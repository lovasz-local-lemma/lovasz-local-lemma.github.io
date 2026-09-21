import {
  EDGE_COLORS,
  PLAYERS,
  AnalysisLimitError,
  analyzeAbstractExample,
  analyzePosition,
  clonePosition,
  emptyPosition,
  exampleLibrary,
  exampleCategories,
  normalizePosition,
  relationLabel,
  tellSummary,
} from "./engine.js?v=13";
import { MOTION_STYLES, MOTION_STYLE_LABELS, runMotionStyle } from "./cut-motion.js?v=2";
import { buildConnectionsChord, buildDistributionChord } from "./chord-view.js?v=1";
import { renderReasoningHTML } from "./reasoning-view.js?v=1";
import { fuseGreen, isAllGreen } from "./fusion.js?v=1";
import { misereAnalysis } from "./misere.js?v=1";
import { nimSumGridHTML, coolingIntervalAt, coolingCaptionHTML } from "./advanced-viz.js?v=2";
import { playFusionReduction } from "./fusion-anim.js?v=1";
import { numericTemperature, clearAutoHeatDisplay, updateAutoHeatDisplay } from "./heat-view.js?v=1";

const BOARD_WIDTH = 980;
const BOARD_HEIGHT = 620;
const GROUND_Y = 560;
const ANALYSIS_DEBOUNCE_MS = 110;

// The board's ground line is rendered as a Bezier curve, not a flat line:
//   M 24 GY  C 180 GY-20, 360 GY+14, 520 GY  S 820 GY-18, 956 GY
// Animations that need to know "where exactly the ground is at this x" should
// call `groundYAt(x)` instead of using GROUND_Y directly. Ink Splash drops,
// rolling balls, etc. all need this so debris sits on the curve, not in air
// or buried below it.
function groundYAt(x) {
  if (x < 24) return GROUND_Y;
  if (x > 956) return GROUND_Y;
  const seg = x < 520
    ? [[24, GROUND_Y], [180, GROUND_Y - 20], [360, GROUND_Y + 14], [520, GROUND_Y]]
    : [[520, GROUND_Y], [680, GROUND_Y - 14], [820, GROUND_Y - 18], [956, GROUND_Y]];
  // Binary search for t such that Bezier_x(t) ≈ x. 24 iterations → < 1px precision.
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const t = (lo + hi) / 2;
    const u = 1 - t;
    const bx = u * u * u * seg[0][0]
             + 3 * u * u * t * seg[1][0]
             + 3 * u * t * t * seg[2][0]
             + t * t * t * seg[3][0];
    if (bx < x) lo = t; else hi = t;
  }
  const t = (lo + hi) / 2;
  const u = 1 - t;
  return u * u * u * seg[0][1]
       + 3 * u * u * t * seg[1][1]
       + 3 * u * t * t * seg[2][1]
       + t * t * t * seg[3][1];
}

// A click / drag-release is treated as landing "on the ground" (creating or
// snapping to a ground node) when it lands within this many px of the curved
// ground line returned by groundYAt(x).
const GROUND_SNAP = 46;
function nearGround(point) {
  return point.y >= groundYAt(point.x) - GROUND_SNAP;
}

const examples = exampleLibrary();
const loadableExamples = examples.filter((example) => example.mode === "loadable" && example.position);
const initialPreset = loadableExamples[0] ?? { position: emptyPosition() };

const state = {
  position: clonePosition(initialPreset.position),
  mode: "play",
  tool: "edge",
  edgeColor: EDGE_COLORS.LEFT,
  stableEdge: false,
  sideToMove: PLAYERS.LEFT,
  play: {
    active: false,
    userSide: PLAYERS.LEFT,
    startingSide: PLAYERS.LEFT,
    startingPosition: clonePosition(initialPreset.position),
    hasStartingPosition: false,
    winner: null,
    history: [],
    // Replay scrubber: snapshots[i] is the position state at move i
    // (snapshots[0] is the starting position; snapshots[history.length] is live).
    snapshots: [],
    // null = live; integer = index in snapshots currently being displayed.
    replayIndex: null,
    // Stash of the live position while scrubbing so we can return on Live.
    livePosition: null,
    // Stash of live sideToMove while scrubbing — restored together with
    // livePosition when the user clicks Live (or hits End).
    liveSideToMove: null,
    opponentTimer: null,
  },
  connectFromId: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  hoverEdgeId: null,
  pointer: { x: BOARD_WIDTH / 2, y: BOARD_HEIGHT / 2 },
  dragging: null,
  dragConnect: null,
  // Create-mode undo/redo: a bounded snapshot stack of the position.
  createHistory: { stack: [], index: -1 },
  restoringHistory: false,
  analysis: null,
  analysisError: null,
  analysisPending: false,
  // True when a heavy "boss" position is loaded but not yet solved — the
  // analysis panel shows a Solve button instead of auto-crunching and freezing.
  analysisGated: false,
  // Pending long-press on an infinite edge (touch equivalent of right-click).
  longPress: null,
  // Extra-analysis panel: chord diagram mode + the stepped reasoning walk.
  chordMode: "connections",
  liveReasoning: false,
  // Whole-board painterly treatment (see :root[data-board-style] in styles.css).
  boardStyle: "none",
  // Off-main-thread solver for heavy boss positions (see solveBossViaWorker).
  solverWorker: null,
  bossSolve: null,
  analysisTimer: null,
  illegalMove: null,
  abstractExample: null,
  idCounter: 0,
  showEdgeInfo: false,
  showVerbose: false,
  showSuggestions: false,
  showMoveDetails: false,
  animationMode: "ink-dust",
  // Ink-mark persistence for the Ink + Dust effect:
  //   "persist" (default) clears on reset · "fade" self-cleans · "permanent"
  //   survives until the Clear button.
  inkMarkMode: "persist",
  // Right-hand games library can be collapsed to give the board full width.
  libraryCollapsed: false,
  // Master-detail library: which category's games show in the detail pane.
  selectedCategory: null,
  // Engine play strength: "optimal" | "strong" | "casual" | "random"
  // Controls how often the engine deviates from the analyzer's recommended
  // move when playing (in both auto mode and as the play-mode opponent).
  aiStrength: "optimal",
  // When true, render each edge with a small "→ value" badge showing what the
  // analysis says the position becomes if that edge is cut. Color-coded by
  // who benefits. Toggleable from the edit + play toolbars.
  showMoveValues: false,
  // Visual style toggles (CSS-only — applied as data-attrs on <body>):
  //   nodeStyle: "sphere" (default 3D gradient) | "flat" | "outlined" | "halo"
  //   edgeStyle: "solid" (default) | "glow" | "chunky" | "hand-drawn"
  nodeStyle: "sphere",
  edgeStyle: "solid",
  auto: {
    active: false,
    paused: false,
    speed: 800,
    timer: null,
    celebrationTimer: null,
    startingSide: PLAYERS.LEFT,
    lastMove: null,
    score: { left: 0, right: 0 },
    gamesPlayed: 0,
  },
};

const refs = {
  heroValue: document.querySelector("#heroValue"),
  heroKind: document.querySelector("#heroKind"),
  heroOutcomeLabel: document.querySelector("#heroOutcomeLabel"),
  heroOutcome: document.querySelector("#heroOutcome"),
  heroTurnCard: document.querySelector("#heroTurnCard"),
  turnSummaryLabel: document.querySelector("#turnSummaryLabel"),
  turnSummary: document.querySelector("#turnSummary"),
  analysisStatus: document.querySelector("#analysisStatus"),
  modeToggle: document.querySelector("#modeToggle"),
  quickToggles: document.querySelector("#quickToggles"),
  quickUserSide: document.querySelector("#quickUserSide"),
  quickFirstToggle: document.querySelector("#quickFirstToggle"),
  mainStack: document.querySelector("#mainContent"),
  librarySidebar: document.querySelector("#librarySidebar"),
  librarySearch: document.querySelector("#librarySearch"),
  libFoldBtn: document.querySelector("#libFoldBtn"),
  libMaster: document.querySelector("#libMaster"),
  libDetail: document.querySelector("#libDetail"),
  themeToggle: document.querySelector("#themeToggle"),
  shortcutsBtn: document.querySelector("#shortcutsBtn"),
  editPanels: document.querySelector("#editPanels"),
  playPanels: document.querySelector("#playPanels"),
  toolButtons: document.querySelector("#toolButtons"),
  colorButtons: document.querySelector("#colorButtons"),
  stableToggle: document.querySelector("#stableToggle"),
  edgeInfoToggle: document.querySelector("#edgeInfoToggle"),
  verboseToggle: document.querySelector("#verboseToggle"),
  turnButtons: document.querySelector("#turnButtons"),
  playerSideButtons: document.querySelector("#playerSideButtons"),
  startingSideButtons: document.querySelector("#startingSideButtons"),
  startMatchButton: document.querySelector("#startMatchButton"),
  createStartButton: document.querySelector("#createStartButton"),
  undoButton: document.querySelector("#undoButton"),
  redoButton: document.querySelector("#redoButton"),
  restartMatchButton: document.querySelector("#restartMatchButton"),
  endMatchButton: document.querySelector("#endMatchButton"),
  playSuggestedButton: document.querySelector("#playSuggestedButton"),
  showSuggestionsToggle: document.querySelector("#showSuggestionsToggle"),
  tellMeMoreButton: document.querySelector("#tellMeMoreButton"),
  suggestionPanel: document.querySelector("#suggestionPanel"),
  suggestionMain: document.querySelector("#suggestionMain"),
  playMovesPanel: document.querySelector("#playMovesPanel"),
  playLeftRecommendation: document.querySelector("#playLeftRecommendation"),
  playRightRecommendation: document.querySelector("#playRightRecommendation"),
  playLeftMoves: document.querySelector("#playLeftMoves"),
  playRightMoves: document.querySelector("#playRightMoves"),
  playStatusPanel: document.querySelector("#playStatusPanel"),
  playSessionSummary: document.querySelector("#playSessionSummary"),
  playStatusSummary: document.querySelector("#playStatusSummary"),
  clearButton: document.querySelector("#clearButton"),
  randomButton: document.querySelector("#randomButton"),
  hardPuzzleButton: document.querySelector("#hardPuzzleButton"),
  playNewPuzzleButton: document.querySelector("#playNewPuzzleButton"),
  playHardPuzzleButton: document.querySelector("#playHardPuzzleButton"),
  aiStrengthSelect: document.querySelector("#aiStrengthSelect"),
  showMoveValuesToggle: document.querySelector("#showMoveValuesToggle"),
  showMoveValuesTogglePlay: document.querySelector("#showMoveValuesTogglePlay"),
  shareButton: document.querySelector("#shareButton"),
  dumpJsonButton: document.querySelector("#dumpJsonButton"),
  loadJsonButton: document.querySelector("#loadJsonButton"),
  runTestsButton: document.querySelector("#runTestsButton"),
  selfTestPanel: document.querySelector("#selfTestPanel"),
  selfTestSummary: document.querySelector("#selfTestSummary"),
  selfTestList: document.querySelector("#selfTestList"),
  roadmapPanel: document.querySelector("#roadmapPanel"),
  roadmapBody: document.querySelector("#roadmapBody"),
  roadmapToggle: document.querySelector("#roadmapToggle"),
  shortcutsOverlay: document.querySelector("#shortcutsOverlay"),
  shortcutsBody: document.querySelector("#shortcutsBody"),
  shortcutsClose: document.querySelector("#shortcutsClose"),
  boardHint: document.querySelector("#boardHint"),
  boardSvg: document.querySelector("#boardSvg"),
  edgeTooltip: document.querySelector("#edgeTooltip"),
  tooltipConnector: document.querySelector("#tooltipConnector"),
  playBanner: document.querySelector("#playBanner"),
  analysisValue: document.querySelector("#analysisValue"),
  analysisSubtitle: document.querySelector("#analysisSubtitle"),
  analysisMeta: document.querySelector("#analysisMeta"),
  analysisExplanation: document.querySelector("#analysisExplanation"),
  analysisDerivation: document.querySelector("#analysisDerivation"),
  extraAnalysisPanel: document.querySelector("#extraAnalysisPanel"),
  fusionView: document.querySelector("#fusionView"),
  chordModeButtons: document.querySelector("#chordModeButtons"),
  chordView: document.querySelector("#chordView"),
  reasoningToggle: document.querySelector("#reasoningToggle"),
  reasoningView: document.querySelector("#reasoningView"),
  exactForm: document.querySelector("#exactForm"),
  exactNumber: document.querySelector("#exactNumber"),
  exactMean: document.querySelector("#exactMean"),
  exactTemperature: document.querySelector("#exactTemperature"),
  strategicOutcome: document.querySelector("#strategicOutcome"),
  currentTurnOutcome: document.querySelector("#currentTurnOutcome"),
  warningList: document.querySelector("#warningList"),
  leftRecommendation: document.querySelector("#leftRecommendation"),
  rightRecommendation: document.querySelector("#rightRecommendation"),
  leftMoves: document.querySelector("#leftMoves"),
  rightMoves: document.querySelector("#rightMoves"),
  presetList: document.querySelector("#libDetail"),
  jsonEditor: document.querySelector("#jsonEditor"),
  theoryPanel: document.querySelector("#theoryPanel"),
  theoryContent: document.querySelector("#theoryContent"),
  traceContent: document.querySelector("#traceContent"),
  componentBreakdown: document.querySelector("#componentBreakdown"),
  thermographView: document.querySelector("#thermographView"),
  analysisAnchors: document.querySelector("#analysisAnchors"),
  signExpansionView: document.querySelector("#signExpansionView"),
  autoHeatViz: document.querySelector("#autoHeatViz"),
  constructionPath: document.querySelector("#constructionPath"),
  gameTreeView: document.querySelector("#gameTreeView"),
  moveHistory: document.querySelector("#moveHistory"),
  heatMeter: document.querySelector("#heatMeter"),
  heatBar: document.querySelector("#heatBar"),
  heatLabel: document.querySelector("#heatLabel"),
  animOverlay: document.querySelector("#animOverlay"),
  inkMarkLayer: document.querySelector("#inkMarkLayer"),
  autoPanels: document.querySelector("#autoPanels"),
  autoNewGameButton: document.querySelector("#autoNewGameButton"),
  autoPauseButton: document.querySelector("#autoPauseButton"),
  autoStopButton: document.querySelector("#autoStopButton"),
  autoSpeedSelect: document.querySelector("#autoSpeedSelect"),
  autoScoreBlue: document.querySelector("#autoScoreBlue"),
  autoScoreRed: document.querySelector("#autoScoreRed"),
  autoCelebration: document.querySelector("#autoCelebration"),
  animModeButtons: document.querySelector("#animModeButtons"),
  boardFrame: document.querySelector("#boardFrame"),
};

// ── Helpers ──

function nextId(prefix) {
  state.idCounter += 1;
  return `${prefix}${state.idCounter}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function colorWord(side) {
  if (side === PLAYERS.LEFT || side === "Blue" || side === "blue") {
    return `<span class="color-blue">Blue</span>`;
  }
  if (side === PLAYERS.RIGHT || side === "Red" || side === "red") {
    return `<span class="color-red">Red</span>`;
  }
  return `<span class="color-green">Green</span>`;
}

function colorize(text) {
  return String(text)
    .replace(/\bBlue\b/g, '<span class="color-blue">Blue</span>')
    .replace(/\bRed\b/g, '<span class="color-red">Red</span>')
    .replace(/\bGreen\b/g, '<span class="color-green">Green</span>');
}

function turnLabel(side) {
  return side === PLAYERS.LEFT ? "Blue" : "Red";
}

function turnLabelHtml(side) {
  return colorWord(side);
}

function findNode(nodeId) {
  return state.position.nodes.find((node) => node.id === nodeId) ?? null;
}

function currentRecommendation() {
  if (!state.analysis) return null;
  return state.analysis.recommendations[state.sideToMove];
}

function recommendedEdgeId() {
  if (state.mode === "play" && !state.showSuggestions) return null;
  return currentHumanRecommendation()?.edgeId ?? null;
}

function boardPointFromEvent(event) {
  const point = refs.boardSvg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(refs.boardSvg.getScreenCTM().inverse());
  return {
    x: clamp(transformed.x, 24, BOARD_WIDTH - 24),
    y: clamp(transformed.y, 36, BOARD_HEIGHT - 24),
  };
}

function clearSelection() {
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
}

function otherSide(side) {
  return side === PLAYERS.LEFT ? PLAYERS.RIGHT : PLAYERS.LEFT;
}

function isPlayActive() {
  return state.play.active;
}

function clearOpponentTimer() {
  if (state.play.opponentTimer !== null) {
    window.clearTimeout(state.play.opponentTimer);
    state.play.opponentTimer = null;
  }
}

// Cancels a pending "branch fall-off" so a stale timer can't apply an orphaned
// move after the session is reset/ended.
function clearBranchTimer() {
  if (state.play.branchTimer) {
    window.clearTimeout(state.play.branchTimer);
    state.play.branchTimer = null;
  }
  state.play.branchPending = false;
}

function clearAutoCelebrationTimer() {
  if (state.auto.celebrationTimer !== null) {
    window.clearTimeout(state.auto.celebrationTimer);
    state.auto.celebrationTimer = null;
  }
}

function clearIllegalMoveState() {
  state.illegalMove = null;
}

function playerOrderLabel(player, startingSide) {
  return player === startingSide ? "first player" : "second player";
}

function recordAutoLastMove(player, label, source = "engine", commentary = null) {
  state.auto.lastMove = {
    player,
    label,
    source,
    commentary,
  };
}

function resolveIllegalMoveLoss(player, edgeId, source = "engine") {
  if (source !== "engine") return false;
  const winner = otherSide(player);
  const message = `${turnLabel(player)} was forced to make an illegal move, thus lost.`;
  state.illegalMove = {
    player,
    edgeId,
    winner,
    source,
    message,
  };

  if (state.mode === "auto" && state.auto.active) {
    // Treat as no-legal-moves end (consistent ending). The note keeps the
    // diagnostic "X was forced to play an illegal move" so the user knows what
    // tripped this safety path.
    autoGameOver(winner, { note: state.illegalMove?.message });
    return false;
  }

  if (isPlayActive()) {
    state.play.history.push({
      source,
      player,
      edgeId: edgeId ?? "illegal",
      label: edgeId ? `Illegal move attempt on ${shortId(edgeId)}` : "Illegal move attempt",
      value: "forfeit",
    });
    state.play.winner = winner;
    showLoserCross(otherSide(winner));
  }

  render();
  return false;
}

function currentWinnerFromAnalysis() {
  if (!state.analysis) return null;
  const moves = state.analysis.moves[state.sideToMove] ?? [];
  if (moves.length === 0) return otherSide(state.sideToMove);
  const relation = state.analysis.value.relationToZero;
  if (relation === "gt") return PLAYERS.LEFT;
  if (relation === "lt") return PLAYERS.RIGHT;
  if (relation === "eq") return otherSide(state.sideToMove);
  return state.sideToMove;
}

function userIsWinning() {
  if (!isPlayActive() || !state.analysis) return null;
  return currentWinnerFromAnalysis() === state.play.userSide;
}

function isUserTurn() {
  return isPlayActive() && !state.play.winner && state.sideToMove === state.play.userSide;
}

function currentHumanRecommendation() {
  if (!state.analysis) return null;
  if (isPlayActive()) {
    return isUserTurn()
      ? state.analysis.recommendations[state.play.userSide]
      : state.analysis.recommendations[state.sideToMove];
  }
  return currentRecommendation();
}

function setHoveredEdge(edgeId) {
  if (state.hoverEdgeId === edgeId) return false;
  state.hoverEdgeId = edgeId;
  return true;
}

function moveFor(player, edgeId) {
  if (!state.analysis) return null;
  return (state.analysis.moves[player] ?? []).find((m) => m.edgeId === edgeId) ?? null;
}

// ── Infinite edge cutting ──

function cutInfiniteEdge(edgeId, n, source = "manual") {
  const edge = state.position.edges.find((e) => e.id === edgeId);
  if (!edge || !edge.infinite) {
    if (source === "engine") {
      return resolveIllegalMoveLoss(state.sideToMove, edgeId, source);
    }
    return false;
  }
  const aNode = findNode(edge.a);
  const bNode = findNode(edge.b);
  if (!aNode || !bNode) return false;

  clearIllegalMoveState();
  animateEdgeCut(edgeId);

  // If this infinite edge had parallel siblings (e.g. a flower petal beside
  // another petal), bulge the resulting chain of finite edges perpendicular to
  // the straight line so it doesn't overlap the sibling's curved path.
  const preCutMeta = buildParallelEdgeMeta(state.position.edges);
  const siblingMeta = preCutMeta.get(edgeId);
  const edgeLength = Math.hypot(bNode.x - aNode.x, bNode.y - aNode.y);
  let bulgeAmp = 0;
  let bulgeNx = 0;
  let bulgeNy = 0;
  if (siblingMeta && siblingMeta.count > 1 && edgeLength > 0) {
    const centered = siblingMeta.index - ((siblingMeta.count - 1) / 2);
    const centeredNonZero = Math.abs(centered) < 0.01 ? 0.55 : centered;
    const dirSign = edge.a === siblingMeta.canonicalStartId ? 1 : -1;
    const signed = Math.sign(centeredNonZero * dirSign) || 1;
    bulgeAmp = Math.min(edgeLength * 0.18, 64) * signed;
    bulgeNx = -(bNode.y - aNode.y) / edgeLength;
    bulgeNy = (bNode.x - aNode.x) / edgeLength;
  }

  // Replace infinite edge with N finite edges as a stalk. Scale to ~65% of the
  // original infinite-edge span so the chain visibly TERMINATES short of the
  // old endpoint — that gap is the visual signal "we cut something off the
  // infinite tail." Without this scaling the chain occupies the same space as
  // the infinite edge and the cut isn't visually obvious.
  const chainScale = 0.65;
  state.position.edges = state.position.edges.filter((e) => e.id !== edgeId);
  let prevId = edge.a;
  const spanX = (bNode.x - aNode.x) * chainScale;
  const spanY = (bNode.y - aNode.y) * chainScale;
  const dx = spanX / n;
  const dy = spanY / n;
  for (let i = 0; i < n; i++) {
    const nid = nextId("n");
    const t = (i + 1) / n;
    // Sine profile — 0 at endpoints, max at midpoint — so the chain arcs toward
    // the side the original edge would have curved to.
    const bulge = bulgeAmp * Math.sin(t * Math.PI);
    state.position.nodes.push({
      id: nid,
      x: aNode.x + (dx * (i + 1)) + (bulgeNx * bulge),
      y: aNode.y + (dy * (i + 1)) + (bulgeNy * bulge),
      ground: false,
    });
    state.position.edges.push({
      id: nextId("e"),
      a: prevId,
      b: nid,
      color: edge.color,
      stable: false,
      infinite: false,
    });
    prevId = nid;
  }
  // Remove the old endpoint if it was only connected to the infinite edge
  const bNodeStillUsed = state.position.edges.some((e) => e.a === edge.b || e.b === edge.b);
  if (!bNodeStillUsed) {
    state.position.nodes = state.position.nodes.filter((nd) => nd.id !== edge.b);
  }

  // In play mode, record this as a move and switch sides
  if (isPlayActive() && !state.play.winner) {
    state.play.history.push({
      source,
      player: state.sideToMove,
      edgeId,
      label: `${edgeColorText(edge.color)} ∞ stalk (cut at ${n})`,
      value: `${n} edge${n !== 1 ? "s" : ""}`,
    });
    state.sideToMove = otherSide(state.sideToMove);
  }
  if (state.mode === "auto" && state.auto.active) {
    recordAutoLastMove(state.sideToMove, `${edgeColorText(edge.color)} ∞ stalk (cut at ${n})`, source);
    state.sideToMove = otherSide(state.sideToMove);
  }

  render();
  scheduleAnalysis(true);
  return true;
}

function enginePickInfiniteCut() {
  // Engine picks a reasonable cut position for infinite edges. In game theory,
  // cutting an infinite blue edge commits Blue to a finite value N (whatever
  // chain length is chosen). Any N ≥ 3 already dominates the small finite
  // positions the engine sees in practice; using N=3 (instead of 10) keeps the
  // resulting position small, which dramatically speeds up subsequent analysis
  // and avoids the "stuck after multiple infinite cuts" performance issue. The
  // user can still pick larger N manually via the slider.
  return 3;
}

// ── Infinite edge slider ──

let infSlider = null;

function showInfiniteSlider(edge, screenX, screenY) {
  hideInfiniteSlider();
  const el = document.createElement("div");
  el.className = "inf-slider-popup";
  el.innerHTML = `
    <div class="inf-slider-header">${edgeColorHtml(edge.color)} ∞ stalk — choose cut position</div>
    <div class="inf-slider-row">
      <input type="range" min="1" max="30" value="3" class="inf-slider-range" />
      <span class="inf-slider-value">3</span>
    </div>
    <div class="inf-slider-actions">
      <button type="button" class="inf-slider-btn inf-slider-cancel">Cancel</button>
      <button type="button" class="inf-slider-btn inf-slider-confirm">Cut</button>
    </div>`;
  document.body.appendChild(el);

  // Position near the click, clamped to viewport
  const rect = el.getBoundingClientRect();
  el.style.left = `${clamp(screenX - rect.width / 2, 8, window.innerWidth - rect.width - 8)}px`;
  el.style.top = `${clamp(screenY - rect.height - 12, 8, window.innerHeight - rect.height - 8)}px`;

  // Fade in. Force a reflow then add the class so the CSS transition fires even
  // when requestAnimationFrame is throttled (e.g. a backgrounded tab).
  void el.offsetWidth;
  el.classList.add("inf-slider-visible");

  const range = el.querySelector(".inf-slider-range");
  const valLabel = el.querySelector(".inf-slider-value");
  const updateFill = () => {
    valLabel.textContent = range.value;
    const pct = ((Number(range.value) - Number(range.min)) / (Number(range.max) - Number(range.min))) * 100;
    range.style.setProperty("--fill", `${pct}%`);
  };
  range.addEventListener("input", updateFill);
  updateFill();

  el.querySelector(".inf-slider-cancel").addEventListener("click", () => hideInfiniteSlider());
  el.querySelector(".inf-slider-confirm").addEventListener("click", () => {
    const n = parseInt(range.value, 10);
    hideInfiniteSlider();
    cutInfiniteEdge(edge.id, n, "manual");
  });

  infSlider = { el, edgeId: edge.id };
}

function hideInfiniteSlider() {
  if (!infSlider) return;
  const el = infSlider.el;
  el.classList.remove("inf-slider-visible");
  el.classList.add("inf-slider-hiding");
  setTimeout(() => el.remove(), 200);
  infSlider = null;
}

// ── Animation System ──

function findUnsupportedEdges(position, cutEdgeId) {
  const groundNodes = new Set();
  for (const node of position.nodes) {
    if (node.ground) groundNodes.add(node.id);
  }
  const reachable = new Set(groundNodes);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of position.edges) {
      if (edge.id === cutEdgeId) continue;
      const aIn = reachable.has(edge.a);
      const bIn = reachable.has(edge.b);
      if (aIn && !bIn) { reachable.add(edge.b); changed = true; }
      if (bIn && !aIn) { reachable.add(edge.a); changed = true; }
    }
  }
  const unsupported = [];
  for (const edge of position.edges) {
    if (edge.id === cutEdgeId) continue;
    if (!reachable.has(edge.a) || !reachable.has(edge.b)) {
      unsupported.push(edge.id);
    }
  }
  return unsupported;
}

function colorValueForEdge(edge) {
  return edge.color === EDGE_COLORS.LEFT ? "var(--blue)" : edge.color === EDGE_COLORS.RIGHT ? "var(--red)" : "var(--green)";
}

function edgePairKey(aId, bId) {
  return aId < bId ? `${aId}::${bId}` : `${bId}::${aId}`;
}

function buildParallelEdgeMeta(edges) {
  const groups = new Map();
  for (const edge of edges) {
    const key = edgePairKey(edge.a, edge.b);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(edge);
  }
  const meta = new Map();
  for (const [key, group] of groups.entries()) {
    const [canonicalStartId] = key.split("::");
    const ordered = [...group].sort((leftEdge, rightEdge) => leftEdge.id.localeCompare(rightEdge.id));
    ordered.forEach((edge, index) => {
      meta.set(edge.id, {
        index,
        count: ordered.length,
        canonicalStartId,
      });
    });
  }
  return meta;
}

function quadraticPoint(aPoint, controlPoint, bPoint, t) {
  const mt = 1 - t;
  return {
    x: (mt * mt * aPoint.x) + (2 * mt * t * controlPoint.x) + (t * t * bPoint.x),
    y: (mt * mt * aPoint.y) + (2 * mt * t * controlPoint.y) + (t * t * bPoint.y),
  };
}

function edgeGeometry(edge, aPoint, bPoint, parallelMeta, allNodes) {
  const dx = bPoint.x - aPoint.x;
  const dy = bPoint.y - aPoint.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  let curveOffset = 0;

  if (parallelMeta && parallelMeta.count > 1) {
    // Always curve every parallel edge — the middle edge of an odd fan used to
    // get centeredIndex=0 and collapse onto the straight midpoint, overlapping
    // its neighbors. Nudge zero-indexed middles so no two parallel edges share
    // a path.
    let centeredIndex = parallelMeta.index - ((parallelMeta.count - 1) / 2);
    if (Math.abs(centeredIndex) < 0.01) centeredIndex = 0.55;
    const spacing = Math.min(Math.max(length * 0.16, 16), 34);
    const direction = edge.a === parallelMeta.canonicalStartId ? 1 : -1;
    curveOffset = centeredIndex * spacing * direction;
  } else if (allNodes && allNodes.length > 0) {
    // Triangle / colinear case: the edge isn't parallel-duplicated, but its
    // straight line passes too close to a non-endpoint node. Curve away so the
    // edge stays visible (and the node circle doesn't sit on top of it).
    //
    // Pick the side with the worst violation and curve in the opposite
    // direction by a magnitude proportional to severity.
    const NODE_AVOID_RADIUS = 24; // node circle r=14 + clearance
    let signedSum = 0;
    let worstSeverity = 0;
    for (const n of allNodes) {
      if (n.id === edge.a || n.id === edge.b) continue;
      const px = n.x - aPoint.x;
      const py = n.y - aPoint.y;
      // Projection parameter along the line (0..1 means "between" endpoints)
      const t = (px * dx + py * dy) / (length * length);
      if (t <= 0.08 || t >= 0.92) continue;
      // Signed perpendicular distance: cross product / length
      const cross = px * dy - py * dx;
      const distAbs = Math.abs(cross) / length;
      if (distAbs >= NODE_AVOID_RADIUS) continue;
      const severity = NODE_AVOID_RADIUS - distAbs;
      const sign = cross >= 0 ? 1 : -1;
      // Curve TOWARD the same side as the node's normal-projection sign so the
      // arc bows away from the obstructing node (control point shifts in the
      // (normalX, normalY) direction; sign here matches that convention).
      signedSum += sign * severity;
      if (severity > worstSeverity) worstSeverity = severity;
    }
    if (worstSeverity > 0) {
      const dir = signedSum >= 0 ? 1 : -1;
      curveOffset = dir * Math.min(worstSeverity + 14, 36);
    }
  }

  const midpoint = {
    x: (aPoint.x + bPoint.x) / 2,
    y: (aPoint.y + bPoint.y) / 2,
  };
  const controlPoint = {
    x: midpoint.x + (normalX * curveOffset),
    y: midpoint.y + (normalY * curveOffset),
  };
  const curved = Math.abs(curveOffset) > 0.5;
  const pathD = curved
    ? `M ${aPoint.x} ${aPoint.y} Q ${controlPoint.x} ${controlPoint.y} ${bPoint.x} ${bPoint.y}`
    : `M ${aPoint.x} ${aPoint.y} L ${bPoint.x} ${bPoint.y}`;
  const centerPoint = curved ? quadraticPoint(aPoint, controlPoint, bPoint, 0.5) : midpoint;
  const markerPoint = curved ? quadraticPoint(aPoint, controlPoint, bPoint, 0.9) : bPoint;
  const labelPush = curved ? Math.sign(curveOffset) * 6 : 0;

  return {
    pathD,
    curved,
    curveOffset,
    centerPoint,
    markerPoint,
    labelX: centerPoint.x + (normalX * labelPush),
    labelY: centerPoint.y + (normalY * labelPush) - 10,
    normalX,
    normalY,
  };
}

function summarizeFallingComponents(position, edgeIds, cutEdgeId) {
  const edgeSet = new Set(edgeIds);
  const edges = position.edges.filter((edge) => edgeSet.has(edge.id));
  const nodeMap = new Map(position.nodes.map((node) => [node.id, node]));
  const adjacency = new Map();

  for (const edge of edges) {
    if (!adjacency.has(edge.a)) adjacency.set(edge.a, []);
    if (!adjacency.has(edge.b)) adjacency.set(edge.b, []);
    adjacency.get(edge.a).push(edge);
    adjacency.get(edge.b).push(edge);
  }

  const seenEdges = new Set();
  const components = [];
  for (const edge of edges) {
    if (seenEdges.has(edge.id)) continue;
    const stack = [edge];
    const componentEdges = [];
    const nodeIds = new Set();
    while (stack.length > 0) {
      const current = stack.pop();
      if (seenEdges.has(current.id)) continue;
      seenEdges.add(current.id);
      componentEdges.push(current);
      nodeIds.add(current.a);
      nodeIds.add(current.b);
      for (const endpoint of [current.a, current.b]) {
        for (const nextEdge of adjacency.get(endpoint) ?? []) {
          if (!seenEdges.has(nextEdge.id)) stack.push(nextEdge);
        }
      }
    }

    const nodes = [...nodeIds].map((nodeId) => nodeMap.get(nodeId)).filter(Boolean);
    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const dominantEdge = componentEdges[0];
    const centroidX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
    const centroidY = ys.reduce((sum, value) => sum + value, 0) / ys.length;

    components.push({
      edges: componentEdges,
      nodes,
      centroidX,
      centroidY,
      minX,
      maxX,
      minY,
      maxY,
      color: dominantEdge ? colorValueForEdge(dominantEdge) : "var(--green)",
      includesCut: componentEdges.some((componentEdge) => componentEdge.id === cutEdgeId),
    });
  }

  return components;
}

function appendSubgraphDrawing(parent, nodes, edges, cutEdgeId = null, options = {}) {
  const NS = "http://www.w3.org/2000/svg";
  const nodeLookup = new Map(nodes.map((node) => [node.id, node]));
  const strokeScale = options.strokeScale ?? 1;
  const nodeScale = options.nodeScale ?? 1;
  const parallelMeta = buildParallelEdgeMeta(edges);

  for (const edge of edges) {
    const aNode = nodeLookup.get(edge.a);
    const bNode = nodeLookup.get(edge.b);
    if (!aNode || !bNode) continue;
    const geom = edgeGeometry(edge, aNode, bNode, parallelMeta.get(edge.id), nodes);
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", geom.pathD);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", colorValueForEdge(edge));
    path.setAttribute("stroke-width", String((edge.infinite ? 5 : 4) * strokeScale));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    if (edge.stable) {
      path.setAttribute("stroke-dasharray", "16 12");
    }
    path.setAttribute("opacity", edge.id === cutEdgeId ? "1" : "0.94");
    parent.appendChild(path);
  }

  for (const node of nodes) {
    const circle = document.createElementNS(NS, "circle");
    circle.setAttribute("cx", String(node.x));
    circle.setAttribute("cy", String(node.y));
    circle.setAttribute("r", String((node.ground ? 5 : 4) * nodeScale));
    circle.setAttribute("fill", node.ground ? "#102136" : "#fff7ea");
    circle.setAttribute("stroke", "rgba(16,33,54,0.35)");
    circle.setAttribute("stroke-width", "1");
    parent.appendChild(circle);
  }
}

function buildComponentSprites(position, edgeIds, cutEdgeId, svgEl, options = {}) {
  const NS = "http://www.w3.org/2000/svg";
  const components = summarizeFallingComponents(position, edgeIds, cutEdgeId);
  return components.map((component) => {
    const group = document.createElementNS(NS, "g");
    if (options.backdrop) {
      const pad = component.includesCut ? 18 : 14;
      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", String(component.minX - pad));
      rect.setAttribute("y", String(component.minY - pad));
      rect.setAttribute("width", String(Math.max(component.maxX - component.minX + pad * 2, 30)));
      rect.setAttribute("height", String(Math.max(component.maxY - component.minY + pad * 2, 30)));
      rect.setAttribute("rx", String(options.backdropRadius ?? 16));
      rect.setAttribute("fill", component.color);
      rect.setAttribute("fill-opacity", component.includesCut ? "0.11" : "0.07");
      group.appendChild(rect);
    }
    appendSubgraphDrawing(group, component.nodes, component.edges, cutEdgeId, {
      strokeScale: options.strokeScale ?? 1,
      nodeScale: options.nodeScale ?? 1,
    });
    svgEl.appendChild(group);
    return {
      ...component,
      group,
      width: Math.max(component.maxX - component.minX, 28),
      height: Math.max(component.maxY - component.minY, 28),
      originX: component.centroidX,
      originY: component.centroidY,
    };
  });
}

function ensureOverlayDefs(svgEl) {
  const NS = "http://www.w3.org/2000/svg";
  let defs = svgEl.querySelector("defs");
  if (defs) return defs;
  defs = document.createElementNS(NS, "defs");
  svgEl.insertBefore(defs, svgEl.firstChild);
  return defs;
}

function animateShapeLockedMode(mode, svgEl, position, edgeIds, cutEdgeId, cutCenterX) {
  const NS = "http://www.w3.org/2000/svg";
  const defs = ensureOverlayDefs(svgEl);
  const bodies = buildComponentSprites(position, edgeIds, cutEdgeId, svgEl, {
    backdrop: mode !== "physics-soft",
    strokeScale: 1.01,
    nodeScale: 1.02,
    backdropRadius: 18,
  }).map((body) => ({
    ...body,
    direction: body.originX >= cutCenterX ? 1 : -1,
    shadow: null,
    drip: null,
    ring: null,
    accentLine: null,
    brush: null,
  }));

  if (mode === "melt-soft") {
    const filterId = `melt-soft-${Math.random().toString(36).slice(2, 8)}`;
    const filter = document.createElementNS(NS, "filter");
    filter.setAttribute("id", filterId);
    const blur = document.createElementNS(NS, "feGaussianBlur");
    blur.setAttribute("stdDeviation", "0.8");
    filter.appendChild(blur);
    defs.appendChild(filter);
    for (const body of bodies) {
      body.group.setAttribute("filter", `url(#${filterId})`);
      const drip = document.createElementNS(NS, "ellipse");
      drip.setAttribute("cx", String(body.originX));
      drip.setAttribute("cy", String(body.maxY + 8));
      drip.setAttribute("rx", "4");
      drip.setAttribute("ry", "6");
      drip.setAttribute("fill", body.color);
      drip.setAttribute("fill-opacity", "0.18");
      body.group.appendChild(drip);
      body.drip = drip;
    }
  }

  if (mode === "kandinsky-soft") {
    for (const body of bodies) {
      const ring = document.createElementNS(NS, "circle");
      ring.setAttribute("cx", String(body.originX));
      ring.setAttribute("cy", String(body.originY));
      ring.setAttribute("r", "10");
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke", body.includesCut ? "#111111" : "#ffd700");
      ring.setAttribute("stroke-width", "2");
      ring.setAttribute("opacity", "0.18");
      body.group.insertBefore(ring, body.group.firstChild);

      const accentLine = document.createElementNS(NS, "line");
      accentLine.setAttribute("x1", String(body.originX - 16));
      accentLine.setAttribute("y1", String(body.originY - 12));
      accentLine.setAttribute("x2", String(body.originX + 16));
      accentLine.setAttribute("y2", String(body.originY - 12));
      accentLine.setAttribute("stroke", body.includesCut ? "#ff0000" : "#0033ff");
      accentLine.setAttribute("stroke-width", "2");
      accentLine.setAttribute("stroke-linecap", "round");
      accentLine.setAttribute("opacity", "0.18");
      body.group.insertBefore(accentLine, body.group.firstChild);

      body.ring = ring;
      body.accentLine = accentLine;
    }
  }

  if (mode === "vangogh-soft") {
    for (const body of bodies) {
      const brush = document.createElementNS(NS, "path");
      brush.setAttribute(
        "d",
        `M ${body.originX - 26} ${body.originY + 6} C ${body.originX - 12} ${body.originY - 18}, ${body.originX + 10} ${body.originY - 16}, ${body.originX + 24} ${body.originY + 4}`,
      );
      brush.setAttribute("fill", "none");
      brush.setAttribute("stroke", body.includesCut ? "#f2bf3b" : "#356dd7");
      brush.setAttribute("stroke-width", "4");
      brush.setAttribute("stroke-linecap", "round");
      brush.setAttribute("opacity", "0.16");
      body.group.insertBefore(brush, body.group.firstChild);
      body.brush = brush;
    }
  }

  if (mode === "dali-soft" || mode === "chirico-soft") {
    for (const body of bodies) {
      const shadow = document.createElementNS(NS, mode === "dali-soft" ? "path" : "polygon");
      shadow.setAttribute("fill", mode === "dali-soft" ? "rgba(114,86,44,0.12)" : "rgba(73,74,97,0.16)");
      svgEl.insertBefore(shadow, body.group);
      body.shadow = shadow;
    }
  }

  const start = performance.now();
  const duration = 1320;
  const easeOutCubic = (t) => 1 - ((1 - t) ** 3);
  const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - (((-2 * t + 2) ** 3) / 2);

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const drift = easeInOut(Math.min(t / 0.62, 1));
    const fade = t <= 0.82 ? 0 : Math.min((t - 0.82) / 0.18, 1);
    const lift = Math.sin(Math.min(t / 0.26, 1) * Math.PI);

    for (const body of bodies) {
      let dx = body.direction * (body.includesCut ? 18 : 10) * drift;
      let dy = (5 * lift) + (34 * drift);
      let rotate = body.direction * (body.includesCut ? 2.8 : 1.6) * drift;
      let skew = 0;
      let scaleX = 1;
      let scaleY = 1;

      if (mode === "kandinsky-soft") {
        dx += Math.sin((t * Math.PI * 2) + (body.originX / 140)) * 3;
      } else if (mode === "vangogh-soft") {
        dx += Math.sin((t * Math.PI * 2.2) + (body.originY / 120)) * 4;
        dy += Math.cos((t * Math.PI * 1.2) + (body.originX / 200)) * 3;
        rotate += Math.sin((t * Math.PI * 1.8) + (body.originX / 160)) * 1.8;
      } else if (mode === "melt-soft") {
        dy += 10 * drift;
        skew = Math.sin((body.originX / 160) + (t * Math.PI)) * 2.4;
        scaleX = 1 - (0.03 * drift);
        scaleY = 1 + (0.12 * drift);
      } else if (mode === "dali-soft") {
        dy += 12 * drift;
        scaleX = 1 - (0.02 * drift);
        scaleY = 1 + (0.06 * drift);
      } else if (mode === "chirico-soft") {
        dx += 18 * drift;
        scaleX = 1 - (0.04 * drift);
        scaleY = 1 - (0.015 * drift);
      }

      body.group.setAttribute(
        "transform",
        `translate(${dx}, ${dy}) rotate(${rotate}, ${body.originX}, ${body.originY}) skewX(${skew}) scale(${scaleX}, ${scaleY})`,
      );
      body.group.setAttribute("opacity", String(Math.max(1 - (fade * 1.08), 0)));

      if (body.ring) {
        body.ring.setAttribute("r", String(10 + (drift * 10)));
        body.ring.setAttribute("opacity", String(Math.max(0.22 * (1 - fade), 0)));
      }
      if (body.accentLine) {
        body.accentLine.setAttribute("transform", `rotate(${Math.sin((t * Math.PI * 2) + (body.originY / 120)) * 10}, ${body.originX}, ${body.originY})`);
        body.accentLine.setAttribute("opacity", String(Math.max(0.22 * (1 - fade), 0)));
      }
      if (body.brush) {
        body.brush.setAttribute("transform", `rotate(${Math.sin((t * Math.PI * 2) + (body.originX / 170)) * 12}, ${body.originX}, ${body.originY})`);
        body.brush.setAttribute("opacity", String(Math.max(0.2 * (1 - fade), 0)));
      }
      if (body.drip) {
        body.drip.setAttribute("cy", String(body.maxY + 8 + (drift * 24)));
        body.drip.setAttribute("rx", String(4 + (drift * 2.5)));
        body.drip.setAttribute("ry", String(6 + (drift * 9)));
        body.drip.setAttribute("opacity", String(Math.max(0.22 - (fade * 0.24), 0)));
      }
      if (body.shadow) {
        if (mode === "dali-soft") {
          const y0 = body.maxY + dy + 6;
          const y1 = y0 + 20 + (drift * 26);
          body.shadow.setAttribute(
            "d",
            `M ${body.minX + dx} ${y0} C ${body.minX + dx + 14} ${y1}, ${body.maxX + dx - 10} ${y1}, ${body.maxX + dx} ${y0} L ${body.maxX + dx + 26} ${y1 + 4} C ${body.maxX + dx - 2} ${y1 + 12}, ${body.minX + dx + 10} ${y1 + 12}, ${body.minX + dx - 18} ${y0 + 4} Z`,
          );
        } else {
          const pts = [
            `${body.minX + dx},${body.maxY + dy + 4}`,
            `${body.maxX + dx},${body.maxY + dy + 4}`,
            `${body.maxX + dx + 70 + (drift * 34)},${body.maxY + dy + 34 + (drift * 10)}`,
            `${body.minX + dx + 54 + (drift * 28)},${body.maxY + dy + 34 + (drift * 10)}`,
          ];
          body.shadow.setAttribute("points", pts.join(" "));
        }
        body.shadow.setAttribute("opacity", String(Math.max((mode === "dali-soft" ? 0.14 : 0.18) * (1 - fade), 0)));
      }
    }

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      svgEl.remove();
    }
  }

  requestAnimationFrame(step);
}

function showLoserCross(loserSide) {
  // Big colored X drawn over the board when a player loses. Persists ~1.4s
  // and fades out — the visual punctuation for "you're out."
  if (state.mode !== "play" && state.mode !== "auto") return;
  const overlay = refs.animOverlay;
  if (!overlay) return;
  const NS = "http://www.w3.org/2000/svg";
  const vb = refs.boardSvg.viewBox.baseVal;
  const color = loserSide === PLAYERS.LEFT ? "var(--blue)" : "var(--red)";
  const svgEl = document.createElementNS(NS, "svg");
  svgEl.setAttribute("viewBox", `0 0 ${vb.width} ${vb.height}`);
  svgEl.style.width = "100%";
  svgEl.style.height = "100%";
  svgEl.style.position = "absolute";
  svgEl.style.top = "0";
  svgEl.style.left = "0";
  svgEl.style.pointerEvents = "none";
  svgEl.style.zIndex = "15";

  // Inset margin from the board edges
  const pad = 80;
  const x1 = pad, y1 = pad;
  const x2 = vb.width - pad, y2 = vb.height - pad;
  const strokeWidth = 26;

  const mkLine = (x1, y1, x2, y2) => {
    const l = document.createElementNS(NS, "line");
    l.setAttribute("x1", x1); l.setAttribute("y1", y1);
    l.setAttribute("x2", x2); l.setAttribute("y2", y2);
    l.setAttribute("stroke", color);
    l.setAttribute("stroke-width", String(strokeWidth));
    l.setAttribute("stroke-linecap", "round");
    l.setAttribute("opacity", "0");
    l.setAttribute("filter", `drop-shadow(0 0 18px ${color})`);
    return l;
  };
  const diag1 = mkLine(x1, y1, x2, y2);
  const diag2 = mkLine(x2, y1, x1, y2);
  svgEl.appendChild(diag1);
  svgEl.appendChild(diag2);
  overlay.appendChild(svgEl);

  const start = performance.now();
  const totalMs = 1700;
  function step(now) {
    const t = Math.min((now - start) / totalMs, 1);
    // Two-stroke draw + fade: 0–0.2 first diag, 0.2–0.4 second diag, 0.6–1 fade
    let op1, op2;
    if (t < 0.18) op1 = t / 0.18 * 0.85;
    else if (t < 0.6) op1 = 0.85;
    else op1 = Math.max(0.85 * (1 - (t - 0.6) / 0.4), 0);
    if (t < 0.18) op2 = 0;
    else if (t < 0.36) op2 = (t - 0.18) / 0.18 * 0.85;
    else if (t < 0.6) op2 = 0.85;
    else op2 = Math.max(0.85 * (1 - (t - 0.6) / 0.4), 0);
    diag1.setAttribute("opacity", String(op1));
    diag2.setAttribute("opacity", String(op2));
    if (t < 1) requestAnimationFrame(step);
    else svgEl.remove();
  }
  requestAnimationFrame(step);
}

function showCutSlash(edge, aNode, bNode) {
  // Brief perpendicular slash mark at the edge midpoint, colored by the side
  // that just moved. Only meaningful in play / auto modes (in edit mode the
  // user is just deleting via the Delete tool).
  if (state.mode !== "play" && state.mode !== "auto") return;
  const overlay = refs.animOverlay;
  if (!overlay) return;
  const sideColor = state.sideToMove === PLAYERS.LEFT ? "var(--blue)" : "var(--red)";
  const mx = (aNode.x + bNode.x) / 2;
  const my = (aNode.y + bNode.y) / 2;
  const dx = bNode.x - aNode.x;
  const dy = bNode.y - aNode.y;
  const length = Math.hypot(dx, dy) || 1;
  // Random tilt ±20° away from strict perpendicular so consecutive slashes
  // don't all look identical. Adds a hand-drawn feel.
  const tiltDeg = (Math.random() - 0.5) * 40;
  const tiltRad = (tiltDeg * Math.PI) / 180;
  const cos = Math.cos(tiltRad);
  const sin = Math.sin(tiltRad);
  // Rotate the perpendicular vector (nx, ny) by tiltRad
  const baseNx = -dy / length;
  const baseNy = dx / length;
  const nx = baseNx * cos - baseNy * sin;
  const ny = baseNx * sin + baseNy * cos;
  const half = 16 + Math.random() * 6; // also a touch of length variation

  const NS = "http://www.w3.org/2000/svg";
  const vb = refs.boardSvg.viewBox.baseVal;
  const slashSvg = document.createElementNS(NS, "svg");
  slashSvg.setAttribute("viewBox", `0 0 ${vb.width} ${vb.height}`);
  slashSvg.style.width = "100%";
  slashSvg.style.height = "100%";
  slashSvg.style.position = "absolute";
  slashSvg.style.top = "0";
  slashSvg.style.left = "0";
  slashSvg.style.pointerEvents = "none";
  const slash = document.createElementNS(NS, "line");
  slash.setAttribute("x1", String(mx + nx * half));
  slash.setAttribute("y1", String(my + ny * half));
  slash.setAttribute("x2", String(mx - nx * half));
  slash.setAttribute("y2", String(my - ny * half));
  slash.setAttribute("stroke", sideColor);
  slash.setAttribute("stroke-width", "5");
  slash.setAttribute("stroke-linecap", "round");
  slash.setAttribute("opacity", "0.95");
  slash.setAttribute("filter", `drop-shadow(0 0 4px ${sideColor})`);
  slashSvg.appendChild(slash);
  overlay.appendChild(slashSvg);

  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / 700, 1);
    // Slash grows then fades
    const scale = t < 0.18 ? (t / 0.18) : 1;
    const opacity = t < 0.18 ? 0.95 : Math.max(0.95 - ((t - 0.18) / 0.82) * 0.95, 0);
    slash.setAttribute("transform", `translate(${mx * (1 - scale)}, ${my * (1 - scale)}) scale(${scale})`);
    slash.setAttribute("opacity", String(opacity));
    if (t < 1) requestAnimationFrame(step);
    else slashSvg.remove();
  }
  requestAnimationFrame(step);
}

// ── Persistent ink marks (Ink + Dust effect) ──
// Marks are ellipse "puddles" drawn into #inkMarkLayer, a standalone SVG that
// renderBoard() never touches (so they survive re-renders). Lifecycle follows
// state.inkMarkMode: persist (clear on reset) · fade (self-clean) · permanent.
function clearInkMarks() {
  if (refs.inkMarkLayer) refs.inkMarkLayer.replaceChildren();
}

function addInkMark(x, y, radius, color) {
  const layer = refs.inkMarkLayer;
  if (!layer) return;
  const puddle = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
  puddle.setAttribute("cx", String(x));
  puddle.setAttribute("cy", String(y));
  puddle.setAttribute("rx", String(radius * 1.9));
  puddle.setAttribute("ry", String(radius * 0.6));
  puddle.setAttribute("fill", color);
  puddle.setAttribute("class", "ink-mark");
  puddle.style.opacity = "0.5";
  layer.appendChild(puddle);
  if (state.inkMarkMode === "fade") {
    puddle.style.transition = "opacity 3.6s linear";
    window.setTimeout(() => { puddle.style.opacity = "0"; }, 400);
    window.setTimeout(() => { if (puddle.parentNode) puddle.remove(); }, 4200);
  }
}

function animateEdgeCut(edgeId) {
  const edge = state.position.edges.find((e) => e.id === edgeId);
  if (!edge) return;
  const aNode = findNode(edge.a);
  const bNode = findNode(edge.b);
  if (!aNode || !bNode) return;

  // Always show the cut-indicator slash (regardless of animation mode), so
  // even with "None" animation users can see who made the move.
  showCutSlash(edge, aNode, bNode);

  if (state.animationMode === "none") return;

  const unsupported = findUnsupportedEdges(state.position, edgeId);
  const allFalling = [edgeId, ...unsupported];

  const vb = refs.boardSvg.viewBox.baseVal;
  const overlay = refs.animOverlay;
  if (!overlay) return;
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgEl.setAttribute("viewBox", `0 0 ${vb.width} ${vb.height}`);
  svgEl.style.width = "100%";
  svgEl.style.height = "100%";
  svgEl.style.position = "absolute";
  svgEl.style.top = "0";
  svgEl.style.left = "0";
  svgEl.style.pointerEvents = "none";

  const parallelMeta = buildParallelEdgeMeta(state.position.edges);
  const pieces = [];
  if (state.animationMode === "simple" || state.animationMode === "physics") {
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "var(--blue)" : fe.color === EDGE_COLORS.RIGHT ? "var(--red)" : "var(--green)";
      const geom = edgeGeometry(fe, fa, fb, parallelMeta.get(fe.id), state.position.nodes);
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", geom.pathD);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", colorVal);
      path.setAttribute("stroke-width", "4");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svgEl.appendChild(path);
      pieces.push({
        el: path,
        cx: geom.centerPoint.x,
        cy: geom.centerPoint.y,
        x: 0, y: 0,
        vx: (Math.random() - 0.5) * 200,
        vy: -(Math.random() * 150 + 50),
        angle: 0,
        angularVel: (Math.random() - 0.5) * 8,
        opacity: 1,
        isCut: fallingId === edgeId,
      });
    }
  }

  overlay.appendChild(svgEl);

  if (MOTION_STYLES[state.animationMode]) {
    // Motion styles live in cut-motion.js: they take the same component sprites
    // every other mode uses and differ only in HOW the pieces move.
    const bodies = buildComponentSprites(state.position, allFalling, edgeId, svgEl, { backdrop: true });
    runMotionStyle(state.animationMode, svgEl, bodies, {
      reduceMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
      centerX: vb.width / 2,
      centerY: vb.height / 2,
    });
  } else if (state.animationMode === "physics-soft"
    || state.animationMode === "kandinsky-soft"
    || state.animationMode === "melt-soft"
    || state.animationMode === "vangogh-soft"
    || state.animationMode === "dali-soft"
    || state.animationMode === "chirico-soft") {
    animateShapeLockedMode(state.animationMode, svgEl, state.position, allFalling, edgeId, (aNode.x + bNode.x) / 2);
  } else if (state.animationMode === "simple") {
    // Gravity cascade: cut edge falls first, unsupported edges above stagger in after
    // a short beat proportional to how far above the cut they were. Gives the "no
    // support -> fall" rule a visible beat without the full physics-mode rotation.
    const duration = 780;
    const start = performance.now();
    const maxCy = Math.max(...pieces.map((p) => p.cy));
    for (const p of pieces) {
      p.delay = p.isCut ? 0 : Math.min(0.32, Math.max(0, (maxCy - p.cy) / 520));
      p.tilt = p.isCut ? (p.vx > 0 ? 22 : -22) : (Math.random() - 0.5) * 12;
      p.drift = p.isCut ? (p.vx > 0 ? 56 : -56) : (Math.random() - 0.5) * 30;
    }
    function stepSimple(now) {
      const elapsed = (now - start) / duration;
      let allDone = true;
      for (const p of pieces) {
        const tp = Math.max(0, Math.min(1, elapsed - p.delay));
        if (tp < 1) allDone = false;
        const fall = 420 * tp * tp;
        const drift = p.drift * tp;
        const rot = p.tilt * tp;
        const op = Math.max(1 - tp * 1.1, 0);
        p.el.setAttribute("transform", `translate(${drift}, ${fall}) rotate(${rot}, ${p.cx}, ${p.cy})`);
        p.el.setAttribute("opacity", String(op));
      }
      if (!allDone) {
        requestAnimationFrame(stepSimple);
      } else {
        svgEl.remove();
      }
    }
    requestAnimationFrame(stepSimple);
  } else if (state.animationMode === "drop") {
    // Each falling edge drops straight down from its current position, bounces a
    // few times on the ground line, then settles and fades. Cut edge starts
    // immediately; cascade edges stagger by a beat so the "no support -> fall"
    // chain reads as a sequence.
    const NS = "http://www.w3.org/2000/svg";
    const dropPieces = [];
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "var(--blue)" : fe.color === EDGE_COLORS.RIGHT ? "var(--red)" : "var(--green)";
      const geom = edgeGeometry(fe, fa, fb, parallelMeta.get(fe.id), state.position.nodes);
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", geom.pathD);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", colorVal);
      path.setAttribute("stroke-width", "4");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svgEl.appendChild(path);
      dropPieces.push({
        el: path,
        originX: geom.centerPoint.x,
        originY: geom.centerPoint.y,
        lowestY: Math.max(fa.y, fb.y),
        x: 0, y: 0,
        vx: (Math.random() - 0.5) * 70,
        vy: 0,
        angle: 0,
        angularVel: (Math.random() - 0.5) * 3.5,
        delay: fallingId === edgeId ? 0 : Math.random() * 0.18 + 0.04,
        bounces: 0,
        settled: false,
        settleAt: 0,
      });
    }
    const dropStart = performance.now();
    let dropLast = dropStart;
    const groundLine = GROUND_Y - 2;
    function stepDrop(now) {
      const dt = Math.min((now - dropLast) / 1000, 0.04);
      dropLast = now;
      const elapsed = (now - dropStart) / 1000;
      let active = false;
      for (const p of dropPieces) {
        if (elapsed < p.delay) { active = true; continue; }
        if (!p.settled) {
          p.vy += 1200 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.angle += p.angularVel * dt;
          const bottomY = p.lowestY + p.y;
          if (bottomY > groundLine && p.vy > 0) {
            p.y -= bottomY - groundLine;
            // 5-bounce ladder for a more satisfying settle.
            const restitution = p.bounces === 0 ? 0.58 : p.bounces === 1 ? 0.42 : p.bounces === 2 ? 0.28 : p.bounces === 3 ? 0.18 : 0.10;
            p.vy = -Math.abs(p.vy) * restitution;
            p.vx *= 0.82;
            p.angularVel *= 0.74;
            p.bounces += 1;
            if (p.bounces >= 5 || Math.abs(p.vy) < 28) {
              p.settled = true;
              p.settleAt = now;
              p.vy = 0; p.vx = 0; p.angularVel = 0;
            }
          }
          active = true;
        } else {
          const fade = Math.min((now - p.settleAt) / 420, 1);
          p.el.setAttribute("opacity", String(1 - fade));
          if (fade < 1) active = true;
        }
        p.el.setAttribute("transform", `translate(${p.x}, ${p.y}) rotate(${(p.angle * 180) / Math.PI}, ${p.originX}, ${p.originY})`);
      }
      if (active) requestAnimationFrame(stepDrop);
      else svgEl.remove();
    }
    requestAnimationFrame(stepDrop);
  } else if (state.animationMode === "edge-burst") {
    // Each edge becomes its own physics body — branches explode into their
    // constituent edges, which fly outward, fall, bounce on the floor, then
    // settle and fade. The cut edge gets the strongest burst.
    const NS = "http://www.w3.org/2000/svg";
    const groundLine = GROUND_Y - 4;
    const cx = (aNode.x + bNode.x) / 2;
    const cy = (aNode.y + bNode.y) / 2;
    const burstPieces = [];
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "var(--blue)" : fe.color === EDGE_COLORS.RIGHT ? "var(--red)" : "var(--green)";
      const geom = edgeGeometry(fe, fa, fb, parallelMeta.get(fe.id), state.position.nodes);
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", geom.pathD);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", colorVal);
      path.setAttribute("stroke-width", "5");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      svgEl.appendChild(path);
      // Direction outward from the cut center; cut edge gets a stronger pop.
      const dx = geom.centerPoint.x - cx;
      const dy = geom.centerPoint.y - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const isCut = fallingId === edgeId;
      const burstStrength = isCut ? 320 : 150 + Math.random() * 80;
      burstPieces.push({
        el: path,
        ox: geom.centerPoint.x,
        oy: geom.centerPoint.y,
        lowestY: Math.max(fa.y, fb.y),
        x: 0, y: 0,
        vx: (dx / dist) * burstStrength + (Math.random() - 0.5) * 100,
        vy: (dy / dist) * burstStrength * 0.4 - 200 - Math.random() * 120,
        angle: 0,
        angularVel: (Math.random() - 0.5) * 11,
        bounces: 0,
        settled: false,
        settleAt: 0,
      });
    }
    const burstStart = performance.now();
    let burstLast = burstStart;
    function stepBurst(now) {
      const dt = Math.min((now - burstLast) / 1000, 0.04);
      burstLast = now;
      let active = false;
      for (const p of burstPieces) {
        if (!p.settled) {
          p.vy += 1100 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.angle += p.angularVel * dt;
          const bottomY = p.lowestY + p.y;
          if (bottomY > groundLine && p.vy > 0) {
            p.y -= bottomY - groundLine;
            const restitution = p.bounces === 0 ? 0.62 : p.bounces === 1 ? 0.46 : p.bounces === 2 ? 0.32 : p.bounces === 3 ? 0.20 : 0.12;
            p.vy = -Math.abs(p.vy) * restitution;
            p.vx *= 0.78;
            p.angularVel *= 0.74;
            p.bounces += 1;
            if (p.bounces >= 5 || Math.abs(p.vy) < 28) {
              p.settled = true;
              p.settleAt = now;
              p.vy = 0; p.vx = 0; p.angularVel = 0;
            }
          }
          active = true;
        } else {
          const fade = Math.min((now - p.settleAt) / 480, 1);
          p.el.setAttribute("opacity", String(1 - fade));
          if (fade < 1) active = true;
        }
        p.el.setAttribute("transform", `translate(${p.x}, ${p.y}) rotate(${(p.angle * 180) / Math.PI}, ${p.ox}, ${p.oy})`);
      }
      if (active) requestAnimationFrame(stepBurst);
      else svgEl.remove();
    }
    requestAnimationFrame(stepBurst);
  } else if (state.animationMode === "shatter-bounce") {
    // Each edge shatters into triangular fragments which then fall and bounce
    // multiple times on the ground line before fading. Fragments feel like real
    // debris rather than one-shot shards — the user-visible "branch shattered
    // and bounced" combo.
    const NS = "http://www.w3.org/2000/svg";
    const groundLine = GROUND_Y - 4;
    const fragments = [];
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "#3b82f6" : fe.color === EDGE_COLORS.RIGHT ? "#ef4444" : "#22c55e";
      const pieceCount = 4 + Math.floor(Math.random() * 3);
      for (let i = 0; i < pieceCount; i += 1) {
        const t = (i + 0.5) / pieceCount;
        const mx = fa.x + (fb.x - fa.x) * t;
        const my = fa.y + (fb.y - fa.y) * t;
        const size = 5 + Math.random() * 7;
        const a1 = Math.random() * Math.PI * 2;
        const a2 = a1 + (Math.PI * 2) / 3 + (Math.random() - 0.5) * 0.6;
        const a3 = a1 + (Math.PI * 4) / 3 + (Math.random() - 0.5) * 0.6;
        const pts = [
          [mx + Math.cos(a1) * size, my + Math.sin(a1) * size],
          [mx + Math.cos(a2) * size, my + Math.sin(a2) * size],
          [mx + Math.cos(a3) * size, my + Math.sin(a3) * size],
        ];
        const poly = document.createElementNS(NS, "polygon");
        poly.setAttribute("points", pts.map((pt) => pt.join(",")).join(" "));
        poly.setAttribute("fill", colorVal);
        poly.setAttribute("stroke", colorVal);
        poly.setAttribute("stroke-width", "0.5");
        svgEl.appendChild(poly);
        fragments.push({
          el: poly,
          ox: mx, oy: my,
          x: 0, y: 0,
          vx: (Math.random() - 0.5) * 280,
          vy: -(80 + Math.random() * 120),
          angle: 0,
          angularVel: (Math.random() - 0.5) * 14,
          bounces: 0,
          settled: false,
          settleAt: 0,
        });
      }
    }
    const sbStart = performance.now();
    let sbLast = sbStart;
    function stepShatterBounce(now) {
      const dt = Math.min((now - sbLast) / 1000, 0.04);
      sbLast = now;
      let active = false;
      for (const f of fragments) {
        if (!f.settled) {
          f.vy += 950 * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.angle += f.angularVel * dt;
          const bottomY = f.oy + f.y;
          if (bottomY > groundLine && f.vy > 0) {
            f.y -= bottomY - groundLine;
            // 5-bounce ladder with diminishing rebound — feels more like real
            // debris than the original 3-bounce settle.
            const restitution = f.bounces === 0 ? 0.62 : f.bounces === 1 ? 0.46 : f.bounces === 2 ? 0.32 : f.bounces === 3 ? 0.20 : 0.12;
            f.vy = -Math.abs(f.vy) * restitution;
            f.vx *= 0.76;
            f.angularVel *= 0.78;
            f.bounces += 1;
            if (f.bounces >= 5 || Math.abs(f.vy) < 28) {
              f.settled = true;
              f.settleAt = now;
              f.vy = 0; f.vx = 0; f.angularVel = 0;
            }
          }
          active = true;
        } else {
          const fade = Math.min((now - f.settleAt) / 480, 1);
          f.el.setAttribute("opacity", String(1 - fade));
          if (fade < 1) active = true;
        }
        f.el.setAttribute("transform", `translate(${f.x}, ${f.y}) rotate(${(f.angle * 180) / Math.PI}, ${f.ox}, ${f.oy})`);
      }
      if (active) requestAnimationFrame(stepShatterBounce);
      else svgEl.remove();
    }
    requestAnimationFrame(stepShatterBounce);
  } else if (state.animationMode === "physics") {
    let lastTime = performance.now();
    function stepPhysics(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      let allDone = true;
      for (const p of pieces) {
        if (p.opacity <= 0) continue;
        allDone = false;
        p.vy += 800 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.angularVel * dt;
        p.opacity = Math.max(p.opacity - 0.8 * dt, 0);
        p.el.setAttribute("transform", `translate(${p.x}, ${p.y}) rotate(${(p.angle * 180) / Math.PI}, ${p.cx}, ${p.cy})`);
        p.el.setAttribute("opacity", String(p.opacity));
      }
      if (allDone) {
        svgEl.remove();
      } else {
        requestAnimationFrame(stepPhysics);
      }
    }
    requestAnimationFrame(stepPhysics);

  } else if (state.animationMode === "shatter") {
    // ── Shatter mode: triangular fragments explode, bounce, sub-shatter ──
    const cx = (aNode.x + bNode.x) / 2;
    const cy = (aNode.y + bNode.y) / 2;
    const shatterPieces = [];
    const NS = "http://www.w3.org/2000/svg";

    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "#2563eb" : fe.color === EDGE_COLORS.RIGHT ? "#dc2626" : "#16a34a";
      const fragCount = 4 + Math.floor(Math.random() * 3); // 4-6 fragments
      for (let i = 0; i < fragCount; i++) {
        const t = (i + 0.5) / fragCount;
        const mx = fa.x + (fb.x - fa.x) * t;
        const my = fa.y + (fb.y - fa.y) * t;
        const size = 6 + Math.random() * 8;
        const a1 = Math.random() * Math.PI * 2;
        const a2 = a1 + (Math.PI * 2) / 3 + (Math.random() - 0.5) * 0.5;
        const a3 = a1 + (Math.PI * 4) / 3 + (Math.random() - 0.5) * 0.5;
        const pts = [
          [mx + Math.cos(a1) * size, my + Math.sin(a1) * size],
          [mx + Math.cos(a2) * size, my + Math.sin(a2) * size],
          [mx + Math.cos(a3) * size, my + Math.sin(a3) * size],
        ];
        const poly = document.createElementNS(NS, "polygon");
        poly.setAttribute("points", pts.map((p) => p.join(",")).join(" "));
        poly.setAttribute("fill", colorVal);
        poly.setAttribute("stroke", colorVal);
        poly.setAttribute("stroke-width", "0.5");
        svgEl.appendChild(poly);
        const dirX = mx - cx;
        const dirY = my - cy;
        const dist = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
        shatterPieces.push({
          el: poly,
          ox: mx, oy: my,
          x: 0, y: 0,
          vx: (dirX / dist) * (150 + Math.random() * 200) + (Math.random() - 0.5) * 100,
          vy: (dirY / dist) * (150 + Math.random() * 200) - Math.random() * 120,
          angle: 0,
          angularVel: (Math.random() - 0.5) * 12,
          opacity: 1,
          bounced: false,
          color: colorVal,
          size: size,
          subFragments: [],
        });
      }
    }

    const shatterStart = performance.now();
    const shatterDuration = 1200;

    function stepShatter(now) {
      const elapsed = now - shatterStart;
      const dt = Math.min(1 / 60, 0.05);
      let allDone = true;

      for (const p of shatterPieces) {
        if (p.opacity <= 0) continue;
        allDone = false;
        p.vy += 600 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.angularVel * dt;
        // Ground bounce at y=580
        if (p.oy + p.y > 580 && !p.bounced) {
          p.bounced = true;
          p.vy = -Math.abs(p.vy) * 0.3;
          p.y = 580 - p.oy;
          // Spawn 2 sub-fragments
          for (let s = 0; s < 2; s++) {
            const subSize = p.size * 0.4;
            const sa1 = Math.random() * Math.PI * 2;
            const sa2 = sa1 + (Math.PI * 2) / 3;
            const sa3 = sa1 + (Math.PI * 4) / 3;
            const sx = p.ox + p.x;
            const sy = 580;
            const subPts = [
              [sx + Math.cos(sa1) * subSize, sy + Math.sin(sa1) * subSize],
              [sx + Math.cos(sa2) * subSize, sy + Math.sin(sa2) * subSize],
              [sx + Math.cos(sa3) * subSize, sy + Math.sin(sa3) * subSize],
            ];
            const subPoly = document.createElementNS(NS, "polygon");
            subPoly.setAttribute("points", subPts.map((pt) => pt.join(",")).join(" "));
            subPoly.setAttribute("fill", p.color);
            svgEl.appendChild(subPoly);
            p.subFragments.push({
              el: subPoly,
              ox: sx, oy: sy,
              x: 0, y: 0,
              vx: (Math.random() - 0.5) * 200,
              vy: -(Math.random() * 80 + 40),
              opacity: 0.8,
            });
          }
        }
        p.opacity = Math.max(p.opacity - 1.0 * dt, 0);
        p.el.setAttribute("transform", `translate(${p.x}, ${p.y}) rotate(${(p.angle * 180) / Math.PI}, ${p.ox}, ${p.oy})`);
        p.el.setAttribute("opacity", String(p.opacity));
        // Animate sub-fragments
        for (const sf of p.subFragments) {
          if (sf.opacity <= 0) continue;
          allDone = false;
          sf.vy += 400 * dt;
          sf.x += sf.vx * dt;
          sf.y += sf.vy * dt;
          sf.opacity = Math.max(sf.opacity - 2.0 * dt, 0);
          sf.el.setAttribute("transform", `translate(${sf.x}, ${sf.y})`);
          sf.el.setAttribute("opacity", String(sf.opacity));
        }
      }

      if (allDone || elapsed > shatterDuration) {
        svgEl.remove();
      } else {
        requestAnimationFrame(stepShatter);
      }
    }
    requestAnimationFrame(stepShatter);

  } else if (state.animationMode === "recompose") {
    const NS = "http://www.w3.org/2000/svg";
    const centerX = (aNode.x + bNode.x) / 2;
    const centerY = (aNode.y + bNode.y) / 2;
    const components = summarizeFallingComponents(state.position, allFalling, edgeId);

    const ghostGroup = document.createElementNS(NS, "g");
    ghostGroup.setAttribute("opacity", "0.16");
    svgEl.appendChild(ghostGroup);

    const animatedComponents = components.map((component, index) => {
      const group = document.createElementNS(NS, "g");
      const connector = document.createElementNS(NS, "line");
      connector.setAttribute("x1", String(component.centroidX));
      connector.setAttribute("y1", String(component.centroidY));
      connector.setAttribute("x2", String(component.centroidX));
      connector.setAttribute("y2", String(component.centroidY));
      connector.setAttribute("stroke", component.color);
      connector.setAttribute("stroke-width", component.includesCut ? "3" : "2");
      connector.setAttribute("stroke-dasharray", "8 7");
      connector.setAttribute("stroke-linecap", "round");
      connector.setAttribute("opacity", "0");
      svgEl.appendChild(connector);

      const backdrop = document.createElementNS(NS, "rect");
      const pad = component.includesCut ? 20 : 16;
      backdrop.setAttribute("x", String(component.minX - pad));
      backdrop.setAttribute("y", String(component.minY - pad));
      backdrop.setAttribute("width", String(Math.max(component.maxX - component.minX + pad * 2, 26)));
      backdrop.setAttribute("height", String(Math.max(component.maxY - component.minY + pad * 2, 26)));
      backdrop.setAttribute("rx", "18");
      backdrop.setAttribute("fill", component.color);
      backdrop.setAttribute("fill-opacity", component.includesCut ? "0.12" : "0.08");
      group.appendChild(backdrop);

      appendSubgraphDrawing(group, component.nodes, component.edges, edgeId);
      const ghostComponent = document.createElementNS(NS, "g");
      ghostComponent.setAttribute("opacity", component.includesCut ? "0.28" : "0.16");
      appendSubgraphDrawing(ghostComponent, component.nodes, component.edges, edgeId, { strokeScale: 0.95, nodeScale: 0.95 });
      ghostGroup.appendChild(ghostComponent);

      svgEl.appendChild(group);

      const rawDx = component.centroidX - centerX;
      const rawDy = component.centroidY - centerY;
      const angle = Math.atan2(rawDy || ((index % 2 === 0 ? 1 : -1) * 12), rawDx || ((index + 1) * 14));
      const travel = component.includesCut ? 170 : 110 + index * 14;

      return {
        group,
        connector,
        originX: component.centroidX,
        originY: component.centroidY,
        dx: Math.cos(angle) * travel,
        dy: Math.sin(angle) * travel - (component.includesCut ? 38 : 18),
        rotate: (component.includesCut ? 12 : 8) * (rawDx >= 0 ? 1 : -1),
        scale: component.includesCut ? 1.08 : 1.02,
      };
    });

    const start = performance.now();
    const duration = 1450;
    const easeOutCubic = (t) => 1 - ((1 - t) ** 3);
    const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - (((-2 * t + 2) ** 3) / 2);

    function stepRecompose(now) {
      const t = Math.min((now - start) / duration, 1);
      const liftPhase = Math.min(t / 0.28, 1);
      const driftPhase = t <= 0.22 ? 0 : Math.min((t - 0.22) / 0.56, 1);
      const fadePhase = t <= 0.72 ? 0 : Math.min((t - 0.72) / 0.28, 1);
      const ghostOpacity = 0.16 * (1 - easeInOut(Math.min(t / 0.82, 1)));

      ghostGroup.setAttribute("opacity", String(Math.max(ghostOpacity, 0)));

      for (const component of animatedComponents) {
        const drift = easeOutCubic(driftPhase);
        const pulse = 1 + Math.sin(liftPhase * Math.PI) * 0.06;
        const x = component.dx * drift;
        const y = (-16 * easeOutCubic(liftPhase)) + (component.dy * drift);
        const rotation = component.rotate * drift;
        const scale = 1 + ((component.scale * pulse) - 1) * (1 - fadePhase * 0.65);
        const opacity = 1 - fadePhase * 1.15;

        component.group.setAttribute(
          "transform",
          `translate(${x}, ${y}) rotate(${rotation}, ${component.originX}, ${component.originY}) scale(${scale})`,
        );
        component.group.setAttribute("opacity", String(Math.max(opacity, 0)));

        component.connector.setAttribute("x1", String(component.originX));
        component.connector.setAttribute("y1", String(component.originY));
        component.connector.setAttribute("x2", String(component.originX + x));
        component.connector.setAttribute("y2", String(component.originY + y));
        component.connector.setAttribute("opacity", String(Math.max(0.36 * drift * (1 - fadePhase), 0)));
      }

      if (t < 1) {
        requestAnimationFrame(stepRecompose);
      } else {
        svgEl.remove();
      }
    }

    requestAnimationFrame(stepRecompose);

  } else if (state.animationMode === "equation") {
    const NS = "http://www.w3.org/2000/svg";
    const components = summarizeFallingComponents(state.position, allFalling, edgeId);
    const componentGap = components.length <= 2 ? 132 : components.length === 3 ? 108 : 88;
    const startCenterX = 120;
    const targetCenterY = 124;
    const resultCenter = { x: vb.width - 170, y: 124 };
    const plusSigns = [];

    const allEdges = components.flatMap((component) => component.edges);
    const allNodes = [];
    const seenNodeIds = new Set();
    for (const component of components) {
      for (const node of component.nodes) {
        if (seenNodeIds.has(node.id)) continue;
        seenNodeIds.add(node.id);
        allNodes.push(node);
      }
    }

    const allMinX = Math.min(...components.map((component) => component.minX));
    const allMaxX = Math.max(...components.map((component) => component.maxX));
    const allMinY = Math.min(...components.map((component) => component.minY));
    const allMaxY = Math.max(...components.map((component) => component.maxY));
    const allWidth = Math.max(allMaxX - allMinX, 32);
    const allHeight = Math.max(allMaxY - allMinY, 32);
    const overallCenterX = (allMinX + allMaxX) / 2;
    const overallCenterY = (allMinY + allMaxY) / 2;

    const resultGlow = document.createElementNS(NS, "rect");
    resultGlow.setAttribute("x", String(resultCenter.x - 88));
    resultGlow.setAttribute("y", String(resultCenter.y - 62));
    resultGlow.setAttribute("width", "176");
    resultGlow.setAttribute("height", "124");
    resultGlow.setAttribute("rx", "28");
    resultGlow.setAttribute("fill", "rgba(255,247,234,0.34)");
    resultGlow.setAttribute("stroke", "rgba(16,33,54,0.14)");
    resultGlow.setAttribute("stroke-width", "1.5");
    resultGlow.setAttribute("opacity", "0");
    svgEl.appendChild(resultGlow);

    const resultGroup = document.createElementNS(NS, "g");
    appendSubgraphDrawing(resultGroup, allNodes, allEdges, edgeId, { strokeScale: 0.9, nodeScale: 0.9 });
    resultGroup.setAttribute("opacity", "0");
    svgEl.appendChild(resultGroup);

    const targetScaleOverall = Math.min(132 / allWidth, 104 / allHeight, 0.96);
    const equalsSign = document.createElementNS(NS, "text");
    equalsSign.setAttribute("x", String(resultCenter.x - 118));
    equalsSign.setAttribute("y", String(targetCenterY + 10));
    equalsSign.setAttribute("text-anchor", "middle");
    equalsSign.setAttribute("font-size", "38");
    equalsSign.setAttribute("font-weight", "700");
    equalsSign.setAttribute("fill", "rgba(16,33,54,0.72)");
    equalsSign.textContent = "=";
    equalsSign.setAttribute("opacity", "0");
    svgEl.appendChild(equalsSign);

    const animatedComponents = components.map((component, index) => {
      const group = document.createElementNS(NS, "g");

      const backdrop = document.createElementNS(NS, "rect");
      backdrop.setAttribute("x", String(component.minX - 16));
      backdrop.setAttribute("y", String(component.minY - 16));
      backdrop.setAttribute("width", String(Math.max(component.maxX - component.minX + 32, 28)));
      backdrop.setAttribute("height", String(Math.max(component.maxY - component.minY + 32, 28)));
      backdrop.setAttribute("rx", "16");
      backdrop.setAttribute("fill", component.color);
      backdrop.setAttribute("fill-opacity", component.includesCut ? "0.12" : "0.08");
      group.appendChild(backdrop);

      appendSubgraphDrawing(group, component.nodes, component.edges, edgeId);
      svgEl.appendChild(group);

      const width = Math.max(component.maxX - component.minX, 28);
      const height = Math.max(component.maxY - component.minY, 28);
      const targetCenterX = startCenterX + (index * componentGap);
      const targetScale = Math.min(76 / width, 88 / height, 0.92);

      if (index < components.length - 1) {
        const plus = document.createElementNS(NS, "text");
        plus.setAttribute("x", String(targetCenterX + (componentGap / 2)));
        plus.setAttribute("y", String(targetCenterY + 10));
        plus.setAttribute("text-anchor", "middle");
        plus.setAttribute("font-size", "30");
        plus.setAttribute("font-weight", "700");
        plus.setAttribute("fill", "rgba(16,33,54,0.62)");
        plus.textContent = "+";
        plus.setAttribute("opacity", "0");
        svgEl.appendChild(plus);
        plusSigns.push(plus);
      }

      return {
        group,
        sourceCenterX: component.centroidX,
        sourceCenterY: component.centroidY,
        targetCenterX,
        targetCenterY,
        targetScale,
        includesCut: component.includesCut,
      };
    });

    const start = performance.now();
    const duration = 1680;
    const easeOutCubic = (t) => 1 - ((1 - t) ** 3);
    const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - (((-2 * t + 2) ** 3) / 2);

    function stepEquation(now) {
      const t = Math.min((now - start) / duration, 1);
      const driftPhase = easeInOut(Math.min(t / 0.62, 1));
      const revealPhase = t <= 0.32 ? 0 : easeOutCubic(Math.min((t - 0.32) / 0.42, 1));
      const fadePhase = t <= 0.82 ? 0 : Math.min((t - 0.82) / 0.18, 1);

      for (const component of animatedComponents) {
        const lift = Math.sin(Math.min(t / 0.24, 1) * Math.PI) * (component.includesCut ? 24 : 14);
        const centerXNow = component.sourceCenterX + ((component.targetCenterX - component.sourceCenterX) * driftPhase);
        const centerYNow = component.sourceCenterY + ((component.targetCenterY - component.sourceCenterY) * driftPhase) - lift * (1 - driftPhase * 0.65);
        const scaleNow = 1 + ((component.targetScale - 1) * driftPhase);
        const opacity = 1 - fadePhase * 1.15;
        const tx = centerXNow - (scaleNow * component.sourceCenterX);
        const ty = centerYNow - (scaleNow * component.sourceCenterY);
        component.group.setAttribute("transform", `matrix(${scaleNow} 0 0 ${scaleNow} ${tx} ${ty})`);
        component.group.setAttribute("opacity", String(Math.max(opacity, 0)));
      }

      const resultScaleNow = targetScaleOverall * (0.96 + (0.04 * Math.sin(revealPhase * Math.PI)));
      const resultTx = resultCenter.x - (resultScaleNow * overallCenterX);
      const resultTy = resultCenter.y - (resultScaleNow * overallCenterY);
      const resultOpacity = Math.max(0.08 + (0.82 * revealPhase) - (fadePhase * 1.1), 0);
      resultGroup.setAttribute("transform", `matrix(${resultScaleNow} 0 0 ${resultScaleNow} ${resultTx} ${resultTy})`);
      resultGroup.setAttribute("opacity", String(resultOpacity));
      resultGlow.setAttribute("opacity", String(Math.max(0.14 + (0.34 * revealPhase) - (fadePhase * 1.05), 0)));

      const symbolOpacity = Math.max((revealPhase - 0.1) * 1.25, 0) * (1 - fadePhase);
      equalsSign.setAttribute("opacity", String(symbolOpacity));
      for (const plus of plusSigns) {
        plus.setAttribute("opacity", String(symbolOpacity * 0.92));
      }

      if (t < 1) {
        requestAnimationFrame(stepEquation);
      } else {
        svgEl.remove();
      }
    }

    requestAnimationFrame(stepEquation);

  } else if (state.animationMode === "slice") {
    const NS = "http://www.w3.org/2000/svg";
    const defs = ensureOverlayDefs(svgEl);
    const components = summarizeFallingComponents(state.position, allFalling, edgeId);
    const slices = [];
    const uid = `slice-${Math.random().toString(36).slice(2, 8)}`;
    const start = performance.now();
    const duration = 1180;
    const easeOutCubic = (t) => 1 - ((1 - t) ** 3);

    components.forEach((component, componentIndex) => {
      const sliceCount = Math.max(3, Math.min(5, component.edges.length + (component.includesCut ? 1 : 0)));
      const sliceHeight = Math.max((component.maxY - component.minY + 24) / sliceCount, 12);
      const direction = component.centroidX >= ((aNode.x + bNode.x) / 2) ? 1 : -1;
      for (let i = 0; i < sliceCount; i++) {
        const clipId = `${uid}-${componentIndex}-${i}`;
        const clipPath = document.createElementNS(NS, "clipPath");
        clipPath.setAttribute("id", clipId);
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", String(component.minX - 20));
        rect.setAttribute("y", String(component.minY - 12 + (i * sliceHeight)));
        rect.setAttribute("width", String(Math.max(component.maxX - component.minX + 40, 38)));
        rect.setAttribute("height", String(sliceHeight + 10));
        clipPath.appendChild(rect);
        defs.appendChild(clipPath);

        const group = document.createElementNS(NS, "g");
        group.setAttribute("clip-path", `url(#${clipId})`);
        appendSubgraphDrawing(group, component.nodes, component.edges, edgeId, { strokeScale: 1.06, nodeScale: 1.02 });
        svgEl.appendChild(group);

        const cutMark = document.createElementNS(NS, "line");
        cutMark.setAttribute("x1", String(component.minX - 10));
        cutMark.setAttribute("y1", String(component.minY + (i * sliceHeight) + 4));
        cutMark.setAttribute("x2", String(component.maxX + 10));
        cutMark.setAttribute("y2", String(component.minY + (i * sliceHeight) + 4));
        cutMark.setAttribute("stroke", "rgba(255,255,255,0.42)");
        cutMark.setAttribute("stroke-width", "0.9");
        cutMark.setAttribute("stroke-dasharray", "8 6");
        cutMark.setAttribute("opacity", "0.36");
        svgEl.appendChild(cutMark);

        slices.push({
          group,
          cutMark,
          originX: component.centroidX,
          originY: component.minY + (i * sliceHeight) + (sliceHeight / 2),
          dx: direction * (16 + (i * 11) + (component.includesCut ? 8 : 0)),
          dy: -10 - (i * 5),
          rotate: direction * ((i - ((sliceCount - 1) / 2)) * 3.6),
        });
      }
    });

    function stepSlice(now) {
      const t = Math.min((now - start) / duration, 1);
      const drift = easeOutCubic(Math.min(t / 0.72, 1));
      const settle = t <= 0.46 ? 0 : easeOutCubic(Math.min((t - 0.46) / 0.34, 1));
      const fade = t <= 0.72 ? 0 : Math.min((t - 0.72) / 0.28, 1);
      for (const slice of slices) {
        const x = slice.dx * drift;
        const y = slice.dy * drift + (26 * settle);
        const rotation = slice.rotate * drift;
        slice.group.setAttribute("transform", `translate(${x}, ${y}) rotate(${rotation}, ${slice.originX}, ${slice.originY})`);
        slice.group.setAttribute("opacity", String(Math.max(1 - (fade * 1.1), 0)));
        slice.cutMark.setAttribute("opacity", String(Math.max(0.36 * (1 - fade), 0)));
      }
      if (t < 1) {
        requestAnimationFrame(stepSlice);
      } else {
        svgEl.remove();
      }
    }

    requestAnimationFrame(stepSlice);

  } else if (state.animationMode === "bounce") {
    const NS = "http://www.w3.org/2000/svg";
    const bodies = buildComponentSprites(state.position, allFalling, edgeId, svgEl, { backdrop: true, strokeScale: 1.02, nodeScale: 1.04 }).map((component, index) => {
      const shadow = document.createElementNS(NS, "ellipse");
      shadow.setAttribute("cx", String(component.originX));
      shadow.setAttribute("cy", String(GROUND_Y + 10));
      shadow.setAttribute("rx", String(Math.max(component.width * 0.3, 18)));
      shadow.setAttribute("ry", "10");
      shadow.setAttribute("fill", "rgba(16,33,54,0.14)");
      shadow.setAttribute("opacity", "0.16");
      svgEl.insertBefore(shadow, component.group);
      const direction = component.originX >= ((aNode.x + bNode.x) / 2) ? 1 : -1;
      return {
        ...component,
        shadow,
        x: 0,
        y: 0,
        vx: direction * (110 + (index * 24) + (component.includesCut ? 50 : 0)),
        vy: -(210 + (index * 36) + (component.includesCut ? 80 : 0)),
        angle: 0,
        angularVel: direction * (1.2 + (Math.random() * 1.6)),
        bounces: 0,
      };
    });

    const start = performance.now();
    let lastTime = start;
    const duration = 1900;
    function stepBounce(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.04);
      lastTime = now;
      let active = false;
      for (const body of bodies) {
        body.vy += 980 * dt;
        body.x += body.vx * dt;
        body.y += body.vy * dt;
        body.angle += body.angularVel * dt;
        const groundOffset = GROUND_Y - body.maxY - 4;
        if (body.y > groundOffset) {
          body.y = groundOffset;
          body.vy = -Math.abs(body.vy) * (body.bounces === 0 ? 0.42 : 0.24);
          body.vx *= 0.86;
          body.angularVel *= 0.74;
          body.bounces += 1;
        }
        const done = body.bounces > 2 && Math.abs(body.vy) < 22 && Math.abs(body.vx) < 16;
        const opacity = Math.max(1 - Math.max((now - start) - 1320, 0) / 560, 0);
        body.group.setAttribute("transform", `translate(${body.x}, ${body.y}) rotate(${(body.angle * 180) / Math.PI}, ${body.originX}, ${body.originY})`);
        body.group.setAttribute("opacity", String(opacity));
        body.shadow.setAttribute("cx", String(body.originX + body.x));
        body.shadow.setAttribute("rx", String(Math.max((body.width * 0.3) * (1 - Math.min(Math.abs(body.y) / 260, 0.45)), 10)));
        body.shadow.setAttribute("opacity", String(Math.max(0.1 + ((1 - Math.min(Math.abs(body.y) / 260, 1)) * 0.18), 0)));
        if (!done && opacity > 0) active = true;
      }
      if (active && (now - start) < duration) {
        requestAnimationFrame(stepBounce);
      } else {
        svgEl.remove();
      }
    }

    requestAnimationFrame(stepBounce);

  } else if (state.animationMode === "melt") {
    const NS = "http://www.w3.org/2000/svg";
    const defs = ensureOverlayDefs(svgEl);
    const filterId = `melt-${Math.random().toString(36).slice(2, 8)}`;
    const filter = document.createElementNS(NS, "filter");
    filter.setAttribute("id", filterId);
    const blur = document.createElementNS(NS, "feGaussianBlur");
    blur.setAttribute("stdDeviation", "1.8");
    filter.appendChild(blur);
    defs.appendChild(filter);

    const bodies = buildComponentSprites(state.position, allFalling, edgeId, svgEl, { backdrop: true }).map((component) => {
      component.group.setAttribute("filter", `url(#${filterId})`);
      const drips = component.nodes
        .filter((node) => node.y >= component.maxY - 8)
        .slice(0, 3)
        .map((node, index) => {
          const drip = document.createElementNS(NS, "ellipse");
          drip.setAttribute("cx", String(node.x));
          drip.setAttribute("cy", String(node.y + 6));
          drip.setAttribute("rx", String(4 + index));
          drip.setAttribute("ry", String(5 + index));
          drip.setAttribute("fill", component.color);
          drip.setAttribute("fill-opacity", "0.35");
          drip.setAttribute("filter", `url(#${filterId})`);
          svgEl.appendChild(drip);
          return { el: drip, x: node.x, y: node.y + 6, offset: index * 0.08 };
        });
      return { ...component, drips };
    });

    const start = performance.now();
    const duration = 1500;
    const easeOutCubic = (t) => 1 - ((1 - t) ** 3);
    function stepMelt(now) {
      const t = Math.min((now - start) / duration, 1);
      const stretch = easeOutCubic(Math.min(t / 0.76, 1));
      const fade = t <= 0.66 ? 0 : Math.min((t - 0.66) / 0.34, 1);
      for (const body of bodies) {
        const dx = Math.sin((t * Math.PI * 2) + (body.originX / 90)) * 6;
        const dy = 14 + (stretch * 92);
        const scaleX = 1 - (stretch * 0.12);
        const scaleY = 1 + (stretch * (body.includesCut ? 0.72 : 0.54));
        const skew = Math.sin((t * Math.PI) + (body.originX / 150)) * 8;
        body.group.setAttribute("transform", `translate(${dx}, ${dy}) skewX(${skew}) scale(${scaleX}, ${scaleY})`);
        body.group.setAttribute("opacity", String(Math.max(1 - (fade * 1.1), 0)));
        for (const drip of body.drips) {
          const dripT = Math.max(t - drip.offset, 0);
          drip.el.setAttribute("cy", String(drip.y + (dripT * 180)));
          drip.el.setAttribute("rx", String(5 + (dripT * 8)));
          drip.el.setAttribute("ry", String(6 + (dripT * 18)));
          drip.el.setAttribute("opacity", String(Math.max(0.55 - dripT, 0)));
        }
      }
      if (t < 1) {
        requestAnimationFrame(stepMelt);
      } else {
        svgEl.remove();
      }
    }

    requestAnimationFrame(stepMelt);

  } else if (state.animationMode === "vangogh") {
    const NS = "http://www.w3.org/2000/svg";
    const bodies = buildComponentSprites(state.position, allFalling, edgeId, svgEl, { backdrop: true, strokeScale: 1.08, nodeScale: 1.05 });
    const swirls = [];
    for (const component of bodies) {
      for (let i = 0; i < 3; i++) {
        const path = document.createElementNS(NS, "path");
        const radius = 26 + (i * 14);
        path.setAttribute("d", `M ${component.originX - radius} ${component.originY} C ${component.originX - radius * 0.4} ${component.originY - radius}, ${component.originX + radius * 0.3} ${component.originY - radius * 0.6}, ${component.originX + radius * 0.9} ${component.originY}`);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", i % 2 === 0 ? "#f3c94f" : "#2456c6");
        path.setAttribute("stroke-width", String(4 - (i * 0.8)));
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("opacity", "0.5");
        svgEl.insertBefore(path, component.group);
        swirls.push({ path, component, radius, phase: i * 0.8 });
      }
    }

    const start = performance.now();
    const duration = 1550;
    function stepVanGogh(now) {
      const t = Math.min((now - start) / duration, 1);
      const fade = t <= 0.72 ? 0 : Math.min((t - 0.72) / 0.28, 1);
      for (const body of bodies) {
        const dx = Math.sin((t * Math.PI * 2) + (body.originX / 140)) * 30;
        const dy = (-18 * Math.sin(t * Math.PI)) + (t * 86);
        const rotate = Math.sin((t * Math.PI * 2.2) + (body.originY / 80)) * 8;
        body.group.setAttribute("transform", `translate(${dx}, ${dy}) rotate(${rotate}, ${body.originX}, ${body.originY})`);
        body.group.setAttribute("opacity", String(Math.max(1 - (fade * 1.05), 0)));
      }
      for (const swirl of swirls) {
        const orbit = (t * Math.PI * 2.4) + swirl.phase;
        const cx = swirl.component.originX + Math.cos(orbit) * 10;
        const cy = swirl.component.originY + Math.sin(orbit) * 8 + (t * 48);
        swirl.path.setAttribute("transform", `translate(${cx - swirl.component.originX}, ${cy - swirl.component.originY}) rotate(${Math.sin(orbit) * 14}, ${swirl.component.originX}, ${swirl.component.originY})`);
        swirl.path.setAttribute("opacity", String(Math.max(0.54 * (1 - fade), 0)));
      }
      if (t < 1) {
        requestAnimationFrame(stepVanGogh);
      } else {
        svgEl.remove();
      }
    }

    requestAnimationFrame(stepVanGogh);

  } else if (state.animationMode === "dali") {
    const NS = "http://www.w3.org/2000/svg";
    const defs = ensureOverlayDefs(svgEl);
    const filterId = `dali-${Math.random().toString(36).slice(2, 8)}`;
    const filter = document.createElementNS(NS, "filter");
    filter.setAttribute("id", filterId);
    const blur = document.createElementNS(NS, "feGaussianBlur");
    blur.setAttribute("stdDeviation", "1.1");
    filter.appendChild(blur);
    defs.appendChild(filter);
    const bodies = buildComponentSprites(state.position, allFalling, edgeId, svgEl, { backdrop: true });
    const shadows = bodies.map((body) => {
      const shadow = document.createElementNS(NS, "path");
      shadow.setAttribute("fill", "rgba(114,86,44,0.16)");
      shadow.setAttribute("filter", `url(#${filterId})`);
      svgEl.insertBefore(shadow, body.group);
      return { body, shadow };
    });

    const start = performance.now();
    const duration = 1650;
    function stepDali(now) {
      const t = Math.min((now - start) / duration, 1);
      const fade = t <= 0.74 ? 0 : Math.min((t - 0.74) / 0.26, 1);
      for (const body of bodies) {
        const sag = t * 120;
        const skew = Math.sin((body.originX / 120) + (t * Math.PI)) * 7;
        const scaleX = 1 - (t * 0.18);
        const scaleY = 1 + (t * 0.48);
        body.group.setAttribute("transform", `translate(${Math.sin(t * Math.PI * 1.6) * 14}, ${sag}) skewX(${skew}) scale(${scaleX}, ${scaleY})`);
        body.group.setAttribute("opacity", String(Math.max(1 - (fade * 1.08), 0)));
      }
      for (const entry of shadows) {
        const x0 = entry.body.minX;
        const x1 = entry.body.maxX;
        const y0 = entry.body.maxY + (t * 90);
        const y1 = y0 + 40 + (t * 60);
        entry.shadow.setAttribute("d", `M ${x0} ${y0} C ${x0 + 20} ${y1}, ${x1 - 20} ${y1}, ${x1} ${y0} L ${x1 + 48} ${y1 + 12} C ${x1} ${y1 + 26}, ${x0 + 10} ${y1 + 28}, ${x0 - 34} ${y0 + 12} Z`);
        entry.shadow.setAttribute("opacity", String(Math.max(0.18 * (1 - fade), 0)));
      }
      if (t < 1) {
        requestAnimationFrame(stepDali);
      } else {
        svgEl.remove();
      }
    }

    requestAnimationFrame(stepDali);

  } else if (state.animationMode === "chirico") {
    const NS = "http://www.w3.org/2000/svg";
    const bodies = buildComponentSprites(state.position, allFalling, edgeId, svgEl, { backdrop: true, strokeScale: 0.98 });
    const shadows = bodies.map((body) => {
      const shadow = document.createElementNS(NS, "polygon");
      shadow.setAttribute("fill", "rgba(73, 74, 97, 0.18)");
      svgEl.insertBefore(shadow, body.group);
      return { body, shadow };
    });

    const start = performance.now();
    const duration = 1500;
    function stepChirico(now) {
      const t = Math.min((now - start) / duration, 1);
      const fade = t <= 0.76 ? 0 : Math.min((t - 0.76) / 0.24, 1);
      for (const body of bodies) {
        const dx = t * (body.includesCut ? 130 : 92);
        const dy = -8 + (t * 42);
        const scale = 1 - (t * 0.18);
        body.group.setAttribute("transform", `matrix(${scale} 0 0 ${scale} ${dx + (body.originX * (1 - scale))} ${dy + (body.originY * (1 - scale))})`);
        body.group.setAttribute("opacity", String(Math.max(1 - (fade * 1.05), 0)));
      }
      for (const entry of shadows) {
        const body = entry.body;
        const stretch = 90 + (t * 160);
        const pts = [
          `${body.minX + (t * 40)},${body.maxY + (t * 16)}`,
          `${body.maxX + (t * 40)},${body.maxY + (t * 16)}`,
          `${body.maxX + stretch},${body.maxY + 70 + (t * 24)}`,
          `${body.minX + stretch * 0.75},${body.maxY + 70 + (t * 24)}`,
        ];
        entry.shadow.setAttribute("points", pts.join(" "));
        entry.shadow.setAttribute("opacity", String(Math.max(0.2 * (1 - fade), 0)));
      }
      if (t < 1) {
        requestAnimationFrame(stepChirico);
      } else {
        svgEl.remove();
      }
    }

    requestAnimationFrame(stepChirico);

  } else if (state.animationMode === "klee") {
    // ── Klee mode: geometric shapes drift upward with wobble, Klee-style ──
    const NS = "http://www.w3.org/2000/svg";
    const kleeShapes = [];
    const kleeColorMap = { blue: "#4a7fb5", red: "#c45c5c", green: "#6b9e6b" };

    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const rawColor = fe.color === EDGE_COLORS.LEFT ? "blue" : fe.color === EDGE_COLORS.RIGHT ? "red" : "green";
      const pastelColor = kleeColorMap[rawColor];
      const emx = (fa.x + fb.x) / 2;
      const emy = (fa.y + fb.y) / 2;
      const shapeTypes = ["rect", "polygon", "circle"];
      const count = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const type = shapeTypes[Math.floor(Math.random() * shapeTypes.length)];
        const size = 10 + Math.random() * 20;
        const ox = emx + (Math.random() - 0.5) * 40;
        const oy = emy + (Math.random() - 0.5) * 30;
        let el;
        if (type === "rect") {
          el = document.createElementNS(NS, "rect");
          el.setAttribute("x", String(ox - size / 2));
          el.setAttribute("y", String(oy - size / 2));
          el.setAttribute("width", String(size));
          el.setAttribute("height", String(size * (0.6 + Math.random() * 0.8)));
        } else if (type === "circle") {
          el = document.createElementNS(NS, "circle");
          el.setAttribute("cx", String(ox));
          el.setAttribute("cy", String(oy));
          el.setAttribute("r", String(size / 2));
        } else {
          el = document.createElementNS(NS, "polygon");
          const pts = [];
          const sides = 3;
          for (let s = 0; s < sides; s++) {
            const ang = (s / sides) * Math.PI * 2 - Math.PI / 2;
            pts.push(`${ox + Math.cos(ang) * size / 2},${oy + Math.sin(ang) * size / 2}`);
          }
          el.setAttribute("points", pts.join(" "));
        }
        el.setAttribute("fill", pastelColor);
        el.setAttribute("fill-opacity", "0.7");
        el.setAttribute("stroke", "black");
        el.setAttribute("stroke-width", "1.5");
        svgEl.appendChild(el);
        kleeShapes.push({
          el,
          ox, oy,
          x: 0, y: 0,
          driftSpeed: -(30 + Math.random() * 60), // upward
          wobbleAmp: 8 + Math.random() * 15,
          wobbleFreq: 1.5 + Math.random() * 2,
          wobblePhase: Math.random() * Math.PI * 2,
          rotation: 0,
          rotSpeed: (Math.random() - 0.5) * 60, // degrees per second
          opacity: 1,
        });
      }
    }

    const kleeStart = performance.now();
    const kleeDuration = 1500;

    function stepKlee(now) {
      const elapsed = now - kleeStart;
      const t = elapsed / kleeDuration;
      if (t >= 1) {
        svgEl.remove();
        return;
      }
      const sec = elapsed / 1000;
      for (const s of kleeShapes) {
        s.y = s.driftSpeed * sec;
        s.x = Math.sin(sec * s.wobbleFreq + s.wobblePhase) * s.wobbleAmp;
        s.rotation = s.rotSpeed * sec;
        s.opacity = Math.max(1 - t * 1.3, 0);
        s.el.setAttribute("transform", `translate(${s.x}, ${s.y}) rotate(${s.rotation}, ${s.ox}, ${s.oy})`);
        s.el.setAttribute("opacity", String(s.opacity));
      }
      requestAnimationFrame(stepKlee);
    }
    requestAnimationFrame(stepKlee);

  } else if (state.animationMode === "kandinsky") {
    // ── Kandinsky mode: explosive geometric composition from the cut point ──
    const NS = "http://www.w3.org/2000/svg";
    const cx = (aNode.x + bNode.x) / 2;
    const cy = (aNode.y + bNode.y) / 2;
    const kandinskyEls = [];
    const boldColors = ["#0033ff", "#ff0000", "#ffd700", "#000000"];

    // Concentric circle groups (3-4)
    const circleGroupCount = 3 + Math.floor(Math.random() * 2);
    for (let g = 0; g < circleGroupCount; g++) {
      const baseRadius = 15 + g * 25 + Math.random() * 15;
      const color = boldColors[g % boldColors.length];
      const ringCount = 2 + Math.floor(Math.random() * 2);
      for (let r = 0; r < ringCount; r++) {
        const radius = baseRadius + r * 8;
        const circle = document.createElementNS(NS, "circle");
        circle.setAttribute("cx", String(cx));
        circle.setAttribute("cy", String(cy));
        circle.setAttribute("r", "0");
        circle.setAttribute("fill", r === ringCount - 1 ? color : "none");
        circle.setAttribute("fill-opacity", "0.15");
        circle.setAttribute("stroke", color);
        circle.setAttribute("stroke-width", r === 0 ? "3" : "1.5");
        circle.setAttribute("opacity", "0");
        svgEl.appendChild(circle);
        kandinskyEls.push({
          el: circle,
          type: "circle",
          targetRadius: radius,
          pulseOffset: g * 0.12 + r * 0.05,
        });
      }
    }

    // Sharp radiating lines (5-8)
    const lineCount = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < lineCount; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const length = 60 + Math.random() * 100;
      const lineColor = Math.random() > 0.5 ? "#000000" : boldColors[Math.floor(Math.random() * 3)];
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", String(cx));
      line.setAttribute("y1", String(cy));
      line.setAttribute("x2", String(cx));
      line.setAttribute("y2", String(cy));
      line.setAttribute("stroke", lineColor);
      line.setAttribute("stroke-width", String(1 + Math.random() * 2));
      line.setAttribute("stroke-linecap", "round");
      line.setAttribute("opacity", "0");
      svgEl.appendChild(line);
      kandinskyEls.push({
        el: line,
        type: "line",
        angle,
        targetLength: length,
        delay: Math.random() * 0.15,
      });
    }

    // Small solid triangles and squares (2-3 each)
    const smallShapeCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < smallShapeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 70;
      const tx = cx + Math.cos(angle) * dist;
      const ty = cy + Math.sin(angle) * dist;
      const size = 8 + Math.random() * 12;
      const color = boldColors[Math.floor(Math.random() * 3)];

      // Triangle
      const tri = document.createElementNS(NS, "polygon");
      const triPts = [
        `${tx},${ty - size}`,
        `${tx - size * 0.866},${ty + size * 0.5}`,
        `${tx + size * 0.866},${ty + size * 0.5}`,
      ];
      tri.setAttribute("points", triPts.join(" "));
      tri.setAttribute("fill", color);
      tri.setAttribute("stroke", "#000000");
      tri.setAttribute("stroke-width", "1");
      tri.setAttribute("opacity", "0");
      svgEl.appendChild(tri);
      kandinskyEls.push({
        el: tri,
        type: "shape",
        sx: tx, sy: ty,
        targetScale: 1,
        delay: 0.05 + Math.random() * 0.15,
      });
    }
    for (let i = 0; i < smallShapeCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 70;
      const rx = cx + Math.cos(angle) * dist;
      const ry = cy + Math.sin(angle) * dist;
      const size = 6 + Math.random() * 10;
      const color = boldColors[Math.floor(Math.random() * 3)];

      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", String(rx - size / 2));
      rect.setAttribute("y", String(ry - size / 2));
      rect.setAttribute("width", String(size));
      rect.setAttribute("height", String(size));
      rect.setAttribute("fill", color);
      rect.setAttribute("stroke", "#000000");
      rect.setAttribute("stroke-width", "1");
      rect.setAttribute("opacity", "0");
      svgEl.appendChild(rect);
      kandinskyEls.push({
        el: rect,
        type: "shape",
        sx: rx, sy: ry,
        targetScale: 1,
        delay: 0.05 + Math.random() * 0.15,
      });
    }

    const kandStart = performance.now();
    const kandDuration = 1200;

    function stepKandinsky(now) {
      const elapsed = now - kandStart;
      const t = elapsed / kandDuration;
      if (t >= 1) {
        svgEl.remove();
        return;
      }
      const sec = elapsed / 1000;
      // Fade in for first 30%, hold, then fade out last 40%
      const globalOpacity = t < 0.3 ? t / 0.3 : t > 0.6 ? Math.max(1 - (t - 0.6) / 0.4, 0) : 1;

      for (const item of kandinskyEls) {
        if (item.type === "circle") {
          const ct = Math.max(t - item.pulseOffset, 0) / (1 - item.pulseOffset);
          const scale = Math.min(ct * 2, 1); // scale up quickly
          const r = item.targetRadius * scale;
          item.el.setAttribute("r", String(r));
          item.el.setAttribute("opacity", String(globalOpacity));
        } else if (item.type === "line") {
          const lt = Math.max(sec - item.delay, 0);
          const extend = Math.min(lt / 0.3, 1); // extend over 0.3s
          const endX = cx + Math.cos(item.angle) * item.targetLength * extend;
          const endY = cy + Math.sin(item.angle) * item.targetLength * extend;
          item.el.setAttribute("x2", String(endX));
          item.el.setAttribute("y2", String(endY));
          item.el.setAttribute("opacity", String(globalOpacity));
        } else if (item.type === "shape") {
          const st = Math.max(sec - item.delay, 0);
          const scaleUp = Math.min(st / 0.2, 1);
          item.el.setAttribute("transform", `translate(${item.sx * (1 - scaleUp)}, ${item.sy * (1 - scaleUp)}) scale(${scaleUp})`);
          item.el.setAttribute("opacity", String(globalOpacity));
        }
      }
      requestAnimationFrame(stepKandinsky);
    }
    requestAnimationFrame(stepKandinsky);

  } else if (state.animationMode === "pixel-dust") {
    // Each falling edge dissolves into a swarm of small colored squares that
    // scatter outward with random velocities + slight gravity, fading fast.
    // Reads as "digital decay" while still feeling physical (real ballistics).
    const NS = "http://www.w3.org/2000/svg";
    const dust = [];
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "#3b82f6" : fe.color === EDGE_COLORS.RIGHT ? "#ef4444" : "#22c55e";
      const isCut = fallingId === edgeId;
      const pixelCount = isCut ? 30 : 14 + Math.floor(Math.random() * 6);
      for (let i = 0; i < pixelCount; i += 1) {
        const t = Math.random();
        const px = fa.x + (fb.x - fa.x) * t + (Math.random() - 0.5) * 6;
        const py = fa.y + (fb.y - fa.y) * t + (Math.random() - 0.5) * 6;
        const size = 2.5 + Math.random() * 3.5;
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", String(px - size / 2));
        rect.setAttribute("y", String(py - size / 2));
        rect.setAttribute("width", String(size));
        rect.setAttribute("height", String(size));
        rect.setAttribute("fill", colorVal);
        rect.setAttribute("rx", "0.5");
        svgEl.appendChild(rect);
        const angle = Math.random() * Math.PI * 2;
        const speed = isCut ? 120 + Math.random() * 220 : 60 + Math.random() * 140;
        dust.push({
          el: rect,
          x: 0, y: 0,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60,
          angle: 0,
          angularVel: (Math.random() - 0.5) * 8,
          ox: px, oy: py,
          opacity: 1,
        });
      }
    }
    const pdStart = performance.now();
    let pdLast = pdStart;
    function stepPixelDust(now) {
      const dt = Math.min((now - pdLast) / 1000, 0.04);
      pdLast = now;
      let active = false;
      for (const p of dust) {
        if (p.opacity <= 0) continue;
        active = true;
        p.vy += 620 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.angularVel * dt;
        p.opacity = Math.max(p.opacity - 1.45 * dt, 0);
        p.el.setAttribute("transform", `translate(${p.x}, ${p.y}) rotate(${(p.angle * 180) / Math.PI}, ${p.ox}, ${p.oy})`);
        p.el.setAttribute("opacity", String(p.opacity));
      }
      if (active) requestAnimationFrame(stepPixelDust);
      else svgEl.remove();
    }
    requestAnimationFrame(stepPixelDust);

  } else if (state.animationMode === "rope-snap") {
    // Each falling edge becomes a rope — its halves swing on pendulums from
    // their endpoints with damped oscillation, then break free and fall under
    // gravity, bouncing on the ground. The cut edge gives both halves an
    // initial recoil away from the cut midpoint.
    const NS = "http://www.w3.org/2000/svg";
    const groundLine = GROUND_Y - 4;
    const ropes = [];
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "var(--blue)" : fe.color === EDGE_COLORS.RIGHT ? "var(--red)" : "var(--green)";
      const isCut = fallingId === edgeId;
      // Two halves per edge, each anchored at one endpoint
      for (const sideKey of [0, 1]) {
        const anchor = sideKey === 0 ? fa : fb;
        const free = sideKey === 0 ? fb : fa;
        const path = document.createElementNS(NS, "path");
        const ang0 = Math.atan2(free.y - anchor.y, free.x - anchor.x);
        const len = Math.hypot(free.x - anchor.x, free.y - anchor.y) / 2;
        const kick = isCut ? 9 + Math.random() * 5 : 3 + Math.random() * 3;
        const dir = sideKey === 0 ? -1 : 1;
        ropes.push({
          el: path,
          anchorX: anchor.x, anchorY: anchor.y,
          len,
          ang: ang0,
          angVel: dir * kick,
          color: colorVal,
          phase: "swing",
          swingTimeLeft: 0.85 + Math.random() * 0.35,
          fallX: 0, fallY: 0,
          fallVx: 0, fallVy: 0,
          fallAng: ang0,
          fallAngVel: 0,
          bounces: 0,
          settled: false,
          settleAt: 0,
        });
        svgEl.appendChild(path);
      }
    }
    function drawRope(r, ang, ox = 0, oy = 0) {
      const tipX = r.anchorX + Math.cos(ang) * r.len + ox;
      const tipY = r.anchorY + Math.sin(ang) * r.len + oy;
      const midX = (r.anchorX + tipX) / 2;
      // Subtle sag for rope feel
      const midY = (r.anchorY + tipY) / 2 + 5 * Math.sin(ang * 1.7);
      r.el.setAttribute("d", `M ${r.anchorX} ${r.anchorY} Q ${midX} ${midY} ${tipX} ${tipY}`);
      r.el.setAttribute("fill", "none");
      r.el.setAttribute("stroke", r.color);
      r.el.setAttribute("stroke-width", "5");
      r.el.setAttribute("stroke-linecap", "round");
    }
    const rsStart = performance.now();
    let rsLast = rsStart;
    function stepRopeSnap(now) {
      const dt = Math.min((now - rsLast) / 1000, 0.04);
      rsLast = now;
      let active = false;
      for (const r of ropes) {
        if (r.phase === "swing") {
          const restAng = Math.PI / 2;
          r.angVel += -9 * Math.sin(r.ang - restAng) * dt;
          r.angVel *= Math.pow(0.86, dt * 60);
          r.ang += r.angVel * dt;
          r.swingTimeLeft -= dt;
          drawRope(r, r.ang);
          if (r.swingTimeLeft <= 0) {
            r.phase = "fall";
            r.fallAng = r.ang;
            r.fallVx = Math.cos(r.ang) * Math.abs(r.angVel) * r.len * 0.25;
            r.fallVy = 60;
            r.fallAngVel = r.angVel * 0.4;
          }
          active = true;
        } else if (r.phase === "fall" && !r.settled) {
          r.fallVy += 950 * dt;
          r.fallX += r.fallVx * dt;
          r.fallY += r.fallVy * dt;
          r.fallAng += r.fallAngVel * dt;
          const tipY = r.anchorY + Math.sin(r.fallAng) * r.len + r.fallY;
          if (tipY > groundLine && r.fallVy > 0) {
            r.fallY -= tipY - groundLine;
            const restitution = r.bounces === 0 ? 0.5 : r.bounces === 1 ? 0.3 : 0.15;
            r.fallVy = -Math.abs(r.fallVy) * restitution;
            r.fallVx *= 0.7;
            r.fallAngVel *= 0.6;
            r.bounces += 1;
            if (r.bounces >= 4 || Math.abs(r.fallVy) < 30) {
              r.settled = true;
              r.settleAt = now;
              r.fallVx = 0; r.fallVy = 0; r.fallAngVel = 0;
            }
          }
          drawRope(r, r.fallAng, r.fallX, r.fallY);
          active = true;
        } else if (r.settled) {
          const fade = Math.min((now - r.settleAt) / 500, 1);
          r.el.setAttribute("opacity", String(1 - fade));
          if (fade < 1) active = true;
        }
      }
      if (active) requestAnimationFrame(stepRopeSnap);
      else svgEl.remove();
    }
    requestAnimationFrame(stepRopeSnap);

  } else if (state.animationMode === "smoke-puff") {
    // Each falling edge dissolves into rising smoke particles — translucent
    // circles that drift up, expand, and fade. Cut edge gets a denser puff.
    const NS = "http://www.w3.org/2000/svg";
    const puffs = [];
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "#3b82f6" : fe.color === EDGE_COLORS.RIGHT ? "#ef4444" : "#22c55e";
      const isCut = fallingId === edgeId;
      const puffCount = isCut ? 24 : 12 + Math.floor(Math.random() * 4);
      for (let i = 0; i < puffCount; i += 1) {
        const t = Math.random();
        const px = fa.x + (fb.x - fa.x) * t + (Math.random() - 0.5) * 10;
        const py = fa.y + (fb.y - fa.y) * t + (Math.random() - 0.5) * 10;
        const startR = 3 + Math.random() * 4;
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", String(px));
        c.setAttribute("cy", String(py));
        c.setAttribute("r", String(startR));
        c.setAttribute("fill", colorVal);
        c.setAttribute("opacity", "0.7");
        svgEl.appendChild(c);
        puffs.push({
          el: c,
          cx: px, cy: py,
          r: startR,
          targetR: startR * (3 + Math.random() * 2),
          vx: (Math.random() - 0.5) * 60,
          vy: -50 - Math.random() * 70,
          opacity: 0.7,
          life: 0,
          ttl: 0.9 + Math.random() * 0.4,
        });
      }
    }
    const spStart = performance.now();
    let spLast = spStart;
    function stepSmokePuff(now) {
      const dt = Math.min((now - spLast) / 1000, 0.04);
      spLast = now;
      let active = false;
      for (const p of puffs) {
        if (p.opacity <= 0) continue;
        active = true;
        p.life += dt;
        const progress = Math.min(p.life / p.ttl, 1);
        p.cx += p.vx * dt;
        p.cy += p.vy * dt;
        p.vy *= 0.97;
        p.vx *= 0.97;
        p.r = p.r + (p.targetR - p.r) * Math.min(dt * 1.8, 1);
        p.opacity = 0.7 * (1 - progress * progress);
        p.el.setAttribute("cx", String(p.cx));
        p.el.setAttribute("cy", String(p.cy));
        p.el.setAttribute("r", String(p.r));
        p.el.setAttribute("opacity", String(p.opacity));
      }
      if (active) requestAnimationFrame(stepSmokePuff);
      else svgEl.remove();
    }
    requestAnimationFrame(stepSmokePuff);

  } else if (state.animationMode === "lightning-strike") {
    // ⚡ A jagged lightning bolt traces along each falling edge, glows for a
    // few frames, then bursts into electric sparks that scatter and fade.
    // The cut edge gets a brighter / more violent zap.
    const NS = "http://www.w3.org/2000/svg";
    const groundLine = GROUND_Y - 4;
    const bolts = [];
    const sparks = [];
    function jaggedPath(fa, fb, segCount, jitter) {
      const pts = [];
      const dx = fb.x - fa.x, dy = fb.y - fa.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      for (let i = 0; i <= segCount; i += 1) {
        const t = i / segCount;
        const baseX = fa.x + dx * t;
        const baseY = fa.y + dy * t;
        const off = i === 0 || i === segCount ? 0 : (Math.random() - 0.5) * jitter;
        pts.push([baseX + nx * off, baseY + ny * off]);
      }
      return "M " + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" L ");
    }
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "#7ab8ff" : fe.color === EDGE_COLORS.RIGHT ? "#ff8a8e" : "#a4f3a4";
      const isCut = fallingId === edgeId;
      const segs = isCut ? 14 : 8;
      const jitter = isCut ? 22 : 14;
      const bolt = document.createElementNS(NS, "path");
      bolt.setAttribute("d", jaggedPath(fa, fb, segs, jitter));
      bolt.setAttribute("fill", "none");
      bolt.setAttribute("stroke", colorVal);
      bolt.setAttribute("stroke-width", isCut ? "4" : "3");
      bolt.setAttribute("stroke-linecap", "round");
      bolt.setAttribute("stroke-linejoin", "round");
      bolt.setAttribute("opacity", "0");
      bolt.style.filter = "drop-shadow(0 0 6px " + colorVal + ")";
      svgEl.appendChild(bolt);
      bolts.push({ el: bolt, fa, fb, segs, jitter, color: colorVal, isCut, opacity: 0, life: 0, jaggleAt: 0 });
      // Spark seeds along the edge — they activate AFTER the bolt phase.
      const sparkCount = isCut ? 22 : 10 + Math.floor(Math.random() * 4);
      for (let i = 0; i < sparkCount; i += 1) {
        const t = Math.random();
        const sx = fa.x + (fb.x - fa.x) * t + (Math.random() - 0.5) * 6;
        const sy = fa.y + (fb.y - fa.y) * t + (Math.random() - 0.5) * 6;
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("cx", String(sx));
        c.setAttribute("cy", String(sy));
        c.setAttribute("r", "0");
        c.setAttribute("fill", colorVal);
        c.style.filter = "drop-shadow(0 0 4px " + colorVal + ")";
        svgEl.appendChild(c);
        const angle = Math.random() * Math.PI * 2;
        const speed = 80 + Math.random() * 200;
        sparks.push({
          el: c, ox: sx, oy: sy, x: 0, y: 0,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 60,
          radius: 0,
          targetRadius: 1.5 + Math.random() * 2,
          opacity: 1,
          delay: 0.18 + Math.random() * 0.08,
          life: 0,
        });
      }
    }
    const lsStart = performance.now();
    let lsLast = lsStart;
    function stepLightning(now) {
      const dt = Math.min((now - lsLast) / 1000, 0.04);
      lsLast = now;
      const elapsed = (now - lsStart) / 1000;
      let active = false;
      // Bolt phase: fade in/out + occasionally re-jaggle for crackle effect
      for (const b of bolts) {
        b.life = elapsed;
        if (b.life < 0.32) {
          // Quick fade in, hold, fade out
          b.opacity = b.life < 0.06 ? b.life / 0.06 : b.life > 0.22 ? Math.max(0, 1 - (b.life - 0.22) / 0.1) : 1;
          b.el.setAttribute("opacity", String(b.opacity));
          // Re-jaggle every ~50ms for crackle
          if (now - b.jaggleAt > 50) {
            b.el.setAttribute("d", jaggedPath(b.fa, b.fb, b.segs, b.jitter));
            b.jaggleAt = now;
          }
          active = true;
        } else if (b.opacity > 0) {
          b.opacity = 0;
          b.el.setAttribute("opacity", "0");
        }
      }
      // Spark phase: only after delay
      for (const p of sparks) {
        if (p.opacity <= 0) continue;
        if (elapsed < p.delay) { active = true; continue; }
        active = true;
        p.life += dt;
        p.vy += 380 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.radius = Math.min(p.radius + dt * 18, p.targetRadius);
        p.opacity = Math.max(p.opacity - 1.6 * dt, 0);
        p.el.setAttribute("transform", `translate(${p.x}, ${p.y})`);
        p.el.setAttribute("r", String(p.radius));
        p.el.setAttribute("opacity", String(p.opacity));
      }
      if (active) requestAnimationFrame(stepLightning);
      else svgEl.remove();
    }
    requestAnimationFrame(stepLightning);

  } else if (state.animationMode === "ink-splash") {
    // 🎨 Each falling edge bursts into colored ink droplets that splatter
    // outward with ballistic trajectories, then drip downward as gravity
    // pulls them. Droplets elongate vertically as they fall to look like wet
    // ink. Cut edge gets the densest splash.
    const NS = "http://www.w3.org/2000/svg";
    const groundLine = GROUND_Y - 4;
    const drops = [];
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "#3b82f6" : fe.color === EDGE_COLORS.RIGHT ? "#ef4444" : "#22c55e";
      const isCut = fallingId === edgeId;
      const dropCount = isCut ? 26 : 12 + Math.floor(Math.random() * 5);
      for (let i = 0; i < dropCount; i += 1) {
        const t = Math.random();
        const px = fa.x + (fb.x - fa.x) * t + (Math.random() - 0.5) * 8;
        const py = fa.y + (fb.y - fa.y) * t + (Math.random() - 0.5) * 8;
        const radius = 2 + Math.random() * 5;
        const e = document.createElementNS(NS, "ellipse");
        e.setAttribute("cx", String(px));
        e.setAttribute("cy", String(py));
        e.setAttribute("rx", String(radius));
        e.setAttribute("ry", String(radius));
        e.setAttribute("fill", colorVal);
        svgEl.appendChild(e);
        const angle = Math.random() * Math.PI * 2;
        const speed = isCut ? 100 + Math.random() * 220 : 50 + Math.random() * 140;
        drops.push({
          el: e,
          ox: px, oy: py,
          x: 0, y: 0,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 80,
          rx: radius, ry: radius,
          radius,
          opacity: 1,
          settled: false,
          settleAt: 0,
        });
      }
    }
    const isStart = performance.now();
    let isLast = isStart;
    function stepInkSplash(now) {
      const dt = Math.min((now - isLast) / 1000, 0.04);
      isLast = now;
      let active = false;
      for (const d of drops) {
        if (d.opacity <= 0) continue;
        active = true;
        if (!d.settled) {
          d.vy += 880 * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          // Elongate vertically when falling fast — wet ink stretching
          const speed = Math.abs(d.vy);
          d.ry = d.radius * (1 + Math.min(speed / 320, 1.6));
          d.rx = d.radius * (1 - Math.min(speed / 1200, 0.3));
          d.el.setAttribute("rx", String(d.rx));
          d.el.setAttribute("ry", String(d.ry));
          // Hit the ground — flatten only when actually touching the curved
          // ground at the drop's x-position (was previously a flat line).
          const dropX = d.ox + d.x;
          const groundLineForDrop = groundYAt(dropX) - 2;
          const bottomY = d.oy + d.y + d.ry;
          if (bottomY > groundLineForDrop && d.vy > 0) {
            d.y -= bottomY - groundLineForDrop;
            d.settled = true;
            d.settleAt = now;
            // Splat: wider + flatter
            d.rx = d.radius * 1.8;
            d.ry = d.radius * 0.55;
            d.el.setAttribute("rx", String(d.rx));
            d.el.setAttribute("ry", String(d.ry));
          }
        } else {
          const fade = Math.min((now - d.settleAt) / 600, 1);
          d.opacity = 1 - fade;
          d.el.setAttribute("opacity", String(d.opacity));
        }
        d.el.setAttribute("transform", `translate(${d.x}, ${d.y})`);
      }
      if (active) requestAnimationFrame(stepInkSplash);
      else svgEl.remove();
    }
    requestAnimationFrame(stepInkSplash);

  } else if (state.animationMode === "ink-splash-2") {
    // 🎨² Like Ink Splash, but each droplet ORIENTS itself along its
    // velocity vector — long axis points in the direction of motion. Drops
    // are wrapped in a <g> so we can independently rotate around their
    // moving center, stretch along motion, compress perpendicular, and
    // splat into a circular puddle on impact.
    const NS = "http://www.w3.org/2000/svg";
    const groundLine = GROUND_Y - 4;
    const drops = [];
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "#3b82f6" : fe.color === EDGE_COLORS.RIGHT ? "#ef4444" : "#22c55e";
      const isCut = fallingId === edgeId;
      const dropCount = isCut ? 26 : 12 + Math.floor(Math.random() * 5);
      for (let i = 0; i < dropCount; i += 1) {
        const t = Math.random();
        const px = fa.x + (fb.x - fa.x) * t + (Math.random() - 0.5) * 8;
        const py = fa.y + (fb.y - fa.y) * t + (Math.random() - 0.5) * 8;
        const radius = 2 + Math.random() * 5;
        const g = document.createElementNS(NS, "g");
        const e = document.createElementNS(NS, "ellipse");
        e.setAttribute("cx", "0");
        e.setAttribute("cy", "0");
        e.setAttribute("rx", String(radius));
        e.setAttribute("ry", String(radius));
        e.setAttribute("fill", colorVal);
        g.appendChild(e);
        svgEl.appendChild(g);
        const angle = Math.random() * Math.PI * 2;
        const speed = isCut ? 100 + Math.random() * 220 : 50 + Math.random() * 140;
        drops.push({
          el: e, group: g,
          ox: px, oy: py,
          x: 0, y: 0,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 80,
          radius,
          opacity: 1,
          settled: false,
          settleAt: 0,
        });
      }
    }
    const is2Start = performance.now();
    let is2Last = is2Start;
    function stepInkSplash2(now) {
      const dt = Math.min((now - is2Last) / 1000, 0.04);
      is2Last = now;
      let active = false;
      for (const d of drops) {
        if (d.opacity <= 0) continue;
        active = true;
        if (!d.settled) {
          d.vy += 880 * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          // Stretch ALONG motion, compress perpendicular. The ellipse is
          // centered at (0,0); the wrapping <g> is translated to the drop
          // position AND rotated to face the velocity vector.
          const speed = Math.hypot(d.vx, d.vy);
          const stretch = 1 + Math.min(speed / 200, 1.6);
          const compress = 1 - Math.min(speed / 900, 0.45);
          d.el.setAttribute("rx", String(d.radius * stretch));
          d.el.setAttribute("ry", String(d.radius * compress));
          const angDeg = (Math.atan2(d.vy, d.vx) * 180) / Math.PI;
          d.group.setAttribute("transform", `translate(${d.ox + d.x}, ${d.oy + d.y}) rotate(${angDeg})`);
          // Hit the ground — use the curved ground at the drop's x-coord so
          // the splat actually sits on the visible ground line.
          const dropX = d.ox + d.x;
          const groundLineForDrop = groundYAt(dropX) - 2;
          const bottomY = d.oy + d.y + d.radius * stretch;
          if (bottomY > groundLineForDrop && d.vy > 0) {
            d.y -= bottomY - groundLineForDrop;
            d.settled = true;
            d.settleAt = now;
            // Splat: round puddle, axis-aligned (no rotation)
            d.el.setAttribute("rx", String(d.radius * 1.9));
            d.el.setAttribute("ry", String(d.radius * 0.55));
            d.group.setAttribute("transform", `translate(${d.ox + d.x}, ${d.oy + d.y})`);
          }
        } else {
          const fade = Math.min((now - d.settleAt) / 600, 1);
          d.opacity = 1 - fade;
          d.group.setAttribute("opacity", String(d.opacity));
        }
      }
      if (active) requestAnimationFrame(stepInkSplash2);
      else svgEl.remove();
    }
    requestAnimationFrame(stepInkSplash2);

  } else if (state.animationMode === "ink-dust") {
    // Default effect. Smaller ink-splash-2 droplets fall and splat onto the
    // curved ground, each leaving a PERSISTENT puddle on #inkMarkLayer, plus a
    // light pixel-dust scatter accent. Two effects composited on one overlay.
    const NS = "http://www.w3.org/2000/svg";
    const drops = [];
    const dust = [];
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "#3b82f6" : fe.color === EDGE_COLORS.RIGHT ? "#ef4444" : "#22c55e";
      const isCut = fallingId === edgeId;
      // Smaller + fewer ink droplets than ink-splash-2.
      const dropCount = isCut ? 14 : 7 + Math.floor(Math.random() * 4);
      for (let i = 0; i < dropCount; i += 1) {
        const t = Math.random();
        const px = fa.x + (fb.x - fa.x) * t + (Math.random() - 0.5) * 8;
        const py = fa.y + (fb.y - fa.y) * t + (Math.random() - 0.5) * 8;
        const radius = 1.4 + Math.random() * 3;
        const g = document.createElementNS(NS, "g");
        const el = document.createElementNS(NS, "ellipse");
        el.setAttribute("cx", "0");
        el.setAttribute("cy", "0");
        el.setAttribute("rx", String(radius));
        el.setAttribute("ry", String(radius));
        el.setAttribute("fill", colorVal);
        g.appendChild(el);
        svgEl.appendChild(g);
        const angle = Math.random() * Math.PI * 2;
        const speed = isCut ? 90 + Math.random() * 180 : 50 + Math.random() * 120;
        drops.push({
          el, group: g, ox: px, oy: py, x: 0, y: 0,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 70,
          radius, color: colorVal, opacity: 1, settled: false, settleAt: 0, marked: false,
        });
      }
      // Pixel-dust accent: a few small squares scatter off the same edge.
      const dustCount = isCut ? 12 : 6 + Math.floor(Math.random() * 4);
      for (let i = 0; i < dustCount; i += 1) {
        const t = Math.random();
        const px = fa.x + (fb.x - fa.x) * t + (Math.random() - 0.5) * 6;
        const py = fa.y + (fb.y - fa.y) * t + (Math.random() - 0.5) * 6;
        const size = 2 + Math.random() * 2.6;
        const rect = document.createElementNS(NS, "rect");
        rect.setAttribute("x", String(px - size / 2));
        rect.setAttribute("y", String(py - size / 2));
        rect.setAttribute("width", String(size));
        rect.setAttribute("height", String(size));
        rect.setAttribute("fill", colorVal);
        rect.setAttribute("rx", "0.5");
        svgEl.appendChild(rect);
        const angle = Math.random() * Math.PI * 2;
        const speed = isCut ? 110 + Math.random() * 200 : 60 + Math.random() * 130;
        dust.push({
          el: rect, x: 0, y: 0,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 60,
          angle: 0, angularVel: (Math.random() - 0.5) * 8, ox: px, oy: py, opacity: 1,
        });
      }
    }
    let idLast = performance.now();
    function stepInkDust(now) {
      const dt = Math.min((now - idLast) / 1000, 0.04);
      idLast = now;
      let active = false;
      for (const d of drops) {
        if (d.opacity <= 0) continue;
        active = true;
        if (!d.settled) {
          d.vy += 820 * dt;
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          const speed = Math.hypot(d.vx, d.vy);
          const stretch = 1 + Math.min(speed / 200, 1.5);
          const compress = 1 - Math.min(speed / 900, 0.4);
          d.el.setAttribute("rx", String(d.radius * stretch));
          d.el.setAttribute("ry", String(d.radius * compress));
          const angDeg = (Math.atan2(d.vy, d.vx) * 180) / Math.PI;
          d.group.setAttribute("transform", `translate(${d.ox + d.x}, ${d.oy + d.y}) rotate(${angDeg})`);
          const dropX = d.ox + d.x;
          const groundLineForDrop = groundYAt(dropX) - 2;
          const bottomY = d.oy + d.y + d.radius * stretch;
          if (bottomY > groundLineForDrop && d.vy > 0) {
            d.y -= bottomY - groundLineForDrop;
            d.settled = true;
            d.settleAt = now;
            d.el.setAttribute("rx", String(d.radius * 1.9));
            d.el.setAttribute("ry", String(d.radius * 0.55));
            d.group.setAttribute("transform", `translate(${d.ox + d.x}, ${d.oy + d.y})`);
            if (!d.marked) {
              d.marked = true;
              addInkMark(d.ox + d.x, groundYAt(d.ox + d.x) - 1, d.radius, d.color);
            }
          }
        } else {
          // Transient splat fades fast; the persistent mark stays on the layer.
          const fade = Math.min((now - d.settleAt) / 360, 1);
          d.opacity = 1 - fade;
          d.group.setAttribute("opacity", String(d.opacity));
        }
      }
      for (const p of dust) {
        if (p.opacity <= 0) continue;
        active = true;
        p.vy += 620 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.angle += p.angularVel * dt;
        p.opacity = Math.max(p.opacity - 1.6 * dt, 0);
        p.el.setAttribute("transform", `translate(${p.x}, ${p.y}) rotate(${(p.angle * 180) / Math.PI}, ${p.ox}, ${p.oy})`);
        p.el.setAttribute("opacity", String(p.opacity));
      }
      if (active) requestAnimationFrame(stepInkDust);
      else svgEl.remove();
    }
    requestAnimationFrame(stepInkDust);

  } else if (state.animationMode === "domino-cascade") {
    // 🁢 Each falling edge stays intact and TIPS OVER from one of its
    // endpoints (rotating 90° around that anchor) like a domino, then slides
    // off the ground and fades. The cut edge tips first; others delay-stagger
    // based on graph distance from the cut.
    const NS = "http://www.w3.org/2000/svg";
    const groundLine = GROUND_Y - 4;
    const dominos = [];
    // Approximate "distance" by simply enumerating order in allFalling — the
    // cut edge is index 0, so use that as the cascade trigger order.
    let i = 0;
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "var(--blue)" : fe.color === EDGE_COLORS.RIGHT ? "var(--red)" : "var(--green)";
      // Anchor is the lower endpoint (closer to ground). Edge tips around it.
      const anchor = fa.y >= fb.y ? fa : fb;
      const free = fa.y >= fb.y ? fb : fa;
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", `M ${anchor.x} ${anchor.y} L ${free.x} ${free.y}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", colorVal);
      path.setAttribute("stroke-width", "5");
      path.setAttribute("stroke-linecap", "round");
      path.style.transformOrigin = `${anchor.x}px ${anchor.y}px`;
      svgEl.appendChild(path);
      // Initial angle: from anchor to free, in degrees (relative to right=0°)
      const initAng = Math.atan2(free.y - anchor.y, free.x - anchor.x) * 180 / Math.PI;
      // Tipping direction: 90° toward whichever side has the longer ground stretch
      const tipDir = anchor.x > BOARD_WIDTH / 2 ? -1 : 1;
      const targetAng = initAng + tipDir * (90 - initAng % 90);
      dominos.push({
        el: path,
        anchor,
        initAng,
        targetAng,
        ang: initAng,
        angVel: 0,
        delay: i * 0.085,
        life: 0,
        slideX: 0, slideVx: 0,
        opacity: 1,
        phase: "wait", // "wait" → "tip" → "slide" → "fade"
        fadeAt: 0,
      });
      i += 1;
    }
    const dcStart = performance.now();
    let dcLast = dcStart;
    function stepDomino(now) {
      const dt = Math.min((now - dcLast) / 1000, 0.04);
      dcLast = now;
      const elapsed = (now - dcStart) / 1000;
      let active = false;
      for (const d of dominos) {
        if (d.opacity <= 0) continue;
        active = true;
        if (d.phase === "wait") {
          if (elapsed >= d.delay) d.phase = "tip";
          else continue;
        }
        if (d.phase === "tip") {
          // Damped angular acceleration toward targetAng
          const angDiff = d.targetAng - d.ang;
          d.angVel += angDiff * 18 * dt;
          d.angVel *= Math.pow(0.86, dt * 60);
          d.ang += d.angVel * dt;
          if (Math.abs(angDiff) < 1.5 && Math.abs(d.angVel) < 4) {
            d.phase = "slide";
            d.slideVx = (d.targetAng > d.initAng ? 1 : -1) * (60 + Math.random() * 60);
          }
          d.el.setAttribute("transform", `rotate(${d.ang - d.initAng}, ${d.anchor.x}, ${d.anchor.y})`);
        } else if (d.phase === "slide") {
          d.slideVx *= 0.95;
          d.slideX += d.slideVx * dt;
          if (Math.abs(d.slideVx) < 8) {
            d.phase = "fade";
            d.fadeAt = now;
          }
          d.el.setAttribute("transform", `rotate(${d.ang - d.initAng}, ${d.anchor.x}, ${d.anchor.y}) translate(${d.slideX}, 0)`);
        } else if (d.phase === "fade") {
          const fade = Math.min((now - d.fadeAt) / 480, 1);
          d.opacity = 1 - fade;
          d.el.setAttribute("opacity", String(d.opacity));
        }
      }
      if (active) requestAnimationFrame(stepDomino);
      else svgEl.remove();
    }
    requestAnimationFrame(stepDomino);

  } else if (state.animationMode === "confetti-pop") {
    // 🎉 Each falling edge bursts into colored ribbon-like rectangles that
    // tumble with rotation + air drag + gravity. Cut edge gets a thicker
    // celebratory burst. Pieces use mixed festive colors instead of just
    // the edge color so the effect reads as "party popper" not "edge".
    const NS = "http://www.w3.org/2000/svg";
    const groundLine = GROUND_Y - 4;
    const pieces = [];
    const palette = ["#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#a78bfa", "#ec4899", "#14b8a6"];
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const isCut = fallingId === edgeId;
      const count = isCut ? 32 : 14 + Math.floor(Math.random() * 6);
      for (let i = 0; i < count; i += 1) {
        const t = Math.random();
        const px = fa.x + (fb.x - fa.x) * t + (Math.random() - 0.5) * 6;
        const py = fa.y + (fb.y - fa.y) * t + (Math.random() - 0.5) * 6;
        const w = 4 + Math.random() * 4;
        const h = 9 + Math.random() * 10;
        const r = document.createElementNS(NS, "rect");
        r.setAttribute("x", String(-w / 2));
        r.setAttribute("y", String(-h / 2));
        r.setAttribute("width", String(w));
        r.setAttribute("height", String(h));
        r.setAttribute("rx", "1.2");
        r.setAttribute("fill", palette[Math.floor(Math.random() * palette.length)]);
        const wrap = document.createElementNS(NS, "g");
        wrap.appendChild(r);
        svgEl.appendChild(wrap);
        const launchAngle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
        const speed = isCut ? 220 + Math.random() * 180 : 100 + Math.random() * 140;
        pieces.push({
          el: wrap,
          ox: px, oy: py,
          x: 0, y: 0,
          vx: Math.cos(launchAngle) * speed + (Math.random() - 0.5) * 80,
          vy: Math.sin(launchAngle) * speed,
          ang: Math.random() * 360,
          angVel: (Math.random() - 0.5) * 540,
          opacity: 1,
          settled: false,
          settleAt: 0,
        });
      }
    }
    const cpStart = performance.now();
    let cpLast = cpStart;
    function stepConfetti(now) {
      const dt = Math.min((now - cpLast) / 1000, 0.04);
      cpLast = now;
      let active = false;
      for (const p of pieces) {
        if (p.opacity <= 0) continue;
        active = true;
        if (!p.settled) {
          p.vy += 700 * dt;
          // Air drag — confetti floats more than rigid debris
          p.vx *= 0.985;
          p.vy *= 0.992;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.ang += p.angVel * dt;
          p.angVel *= 0.99;
          const bottomY = p.oy + p.y + 12;
          if (bottomY > groundLine && p.vy > 0) {
            p.y -= bottomY - groundLine;
            p.settled = true;
            p.settleAt = now;
            p.vy = 0; p.vx = 0; p.angVel = 0;
          }
          p.el.setAttribute("transform", `translate(${p.ox + p.x}, ${p.oy + p.y}) rotate(${p.ang})`);
        } else {
          const fade = Math.min((now - p.settleAt) / 700, 1);
          p.opacity = 1 - fade;
          p.el.setAttribute("opacity", String(p.opacity));
        }
      }
      if (active) requestAnimationFrame(stepConfetti);
      else svgEl.remove();
    }
    requestAnimationFrame(stepConfetti);

  } else if (state.animationMode === "whirlpool") {
    // 🌀 Each falling edge dissolves into particles that spiral inward toward
    // a vortex point at the cut center, accelerating as they approach.
    // Particles fade as they reach the center. Reads as "sucked into the void".
    const NS = "http://www.w3.org/2000/svg";
    const cx = (aNode.x + bNode.x) / 2;
    const cy = (aNode.y + bNode.y) / 2;
    const swirls = [];
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "#3b82f6" : fe.color === EDGE_COLORS.RIGHT ? "#ef4444" : "#22c55e";
      const isCut = fallingId === edgeId;
      const count = isCut ? 22 : 10 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i += 1) {
        const t = Math.random();
        const px = fa.x + (fb.x - fa.x) * t;
        const py = fa.y + (fb.y - fa.y) * t;
        const c = document.createElementNS(NS, "circle");
        c.setAttribute("r", String(2 + Math.random() * 2));
        c.setAttribute("fill", colorVal);
        c.setAttribute("opacity", "0.85");
        svgEl.appendChild(c);
        const dx = px - cx;
        const dy = py - cy;
        const radius = Math.hypot(dx, dy) || 1;
        const angle = Math.atan2(dy, dx);
        swirls.push({
          el: c,
          radius,
          angle,
          // Inward radial velocity (px/s), grows with proximity (1/r factor)
          radialV: 60 + Math.random() * 40,
          // Tangential angular velocity (rad/s) — sense of swirl
          angularV: 4 + Math.random() * 2,
          opacity: 0.85,
        });
      }
    }
    const wpStart = performance.now();
    let wpLast = wpStart;
    function stepWhirlpool(now) {
      const dt = Math.min((now - wpLast) / 1000, 0.04);
      wpLast = now;
      let active = false;
      for (const s of swirls) {
        if (s.opacity <= 0) continue;
        active = true;
        // Spiral inward: accelerate as we approach the center
        const accel = 1 + 30 / Math.max(s.radius, 6);
        s.radius -= s.radialV * accel * dt;
        s.angle += s.angularV * dt;
        if (s.radius < 4) {
          s.opacity = Math.max(s.opacity - 4 * dt, 0);
        }
        const px = cx + Math.cos(s.angle) * Math.max(s.radius, 0);
        const py = cy + Math.sin(s.angle) * Math.max(s.radius, 0);
        s.el.setAttribute("cx", String(px));
        s.el.setAttribute("cy", String(py));
        s.el.setAttribute("opacity", String(s.opacity));
      }
      if (active) requestAnimationFrame(stepWhirlpool);
      else svgEl.remove();
    }
    requestAnimationFrame(stepWhirlpool);

  } else if (state.animationMode === "magnet-pull") {
    // 🧲 Each falling edge becomes two halves that get violently pulled
    // toward opposite "magnetic poles" (top-left + top-right corners of the
    // board). Halves accelerate via 1/r² toward their assigned pole, then
    // spin out with momentum. Cut edge starts at higher speed.
    const NS = "http://www.w3.org/2000/svg";
    const poles = [
      { x: 40, y: 40 },                  // top-left
      { x: BOARD_WIDTH - 40, y: 40 },    // top-right
    ];
    const halves = [];
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "var(--blue)" : fe.color === EDGE_COLORS.RIGHT ? "var(--red)" : "var(--green)";
      const isCut = fallingId === edgeId;
      const midX = (fa.x + fb.x) / 2;
      const midY = (fa.y + fb.y) / 2;
      // Two halves: a→mid, mid→b. Each gets pulled to a different pole based on its position.
      for (const sideKey of [0, 1]) {
        const start = sideKey === 0 ? fa : { x: midX, y: midY };
        const end = sideKey === 0 ? { x: midX, y: midY } : fb;
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", `M ${start.x} ${start.y} L ${end.x} ${end.y}`);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", colorVal);
        path.setAttribute("stroke-width", "4");
        path.setAttribute("stroke-linecap", "round");
        svgEl.appendChild(path);
        // Choose the closer pole
        const ecx = (start.x + end.x) / 2;
        const ecy = (start.y + end.y) / 2;
        const pole = poles[ecx < BOARD_WIDTH / 2 ? 0 : 1];
        halves.push({
          el: path,
          cx: ecx, cy: ecy,
          x: 0, y: 0,
          vx: 0, vy: 0,
          ang: 0,
          angVel: (Math.random() - 0.5) * 12,
          pole,
          isCut,
          opacity: 1,
          life: 0,
        });
      }
    }
    const mpStart = performance.now();
    let mpLast = mpStart;
    function stepMagnet(now) {
      const dt = Math.min((now - mpLast) / 1000, 0.04);
      mpLast = now;
      let active = false;
      for (const h of halves) {
        if (h.opacity <= 0) continue;
        active = true;
        h.life += dt;
        // Magnetic attraction toward pole — F ∝ 1/r²
        const dx = h.pole.x - (h.cx + h.x);
        const dy = h.pole.y - (h.cy + h.y);
        const r = Math.max(Math.hypot(dx, dy), 30);
        const force = 220000 / (r * r);
        h.vx += (dx / r) * force * dt;
        h.vy += (dy / r) * force * dt;
        // Cap velocity so things don't go infinite
        const speed = Math.hypot(h.vx, h.vy);
        if (speed > 1400) { h.vx = (h.vx / speed) * 1400; h.vy = (h.vy / speed) * 1400; }
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.ang += h.angVel * dt;
        // Fade once near pole or after timeout
        if (r < 60 || h.life > 1.4) {
          h.opacity = Math.max(h.opacity - 2.5 * dt, 0);
        }
        h.el.setAttribute("transform", `translate(${h.x}, ${h.y}) rotate(${(h.ang * 180) / Math.PI}, ${h.cx}, ${h.cy})`);
        h.el.setAttribute("opacity", String(h.opacity));
      }
      if (active) requestAnimationFrame(stepMagnet);
      else svgEl.remove();
    }
    requestAnimationFrame(stepMagnet);

  } else if (state.animationMode === "marble-roll") {
    // ⚪ Each falling edge bursts into shiny marbles that fall, bounce on the
    // curved ground, then ROLL along the ground curve — speed decays with
    // friction until they settle. Cut edge gets the densest swarm and the
    // strongest initial outward kick.
    const NS = "http://www.w3.org/2000/svg";
    const cx = (aNode.x + bNode.x) / 2;
    const cy = (aNode.y + bNode.y) / 2;
    const marbles = [];
    for (const fallingId of allFalling) {
      const fe = state.position.edges.find((e) => e.id === fallingId);
      if (!fe) continue;
      const fa = findNode(fe.a);
      const fb = findNode(fe.b);
      if (!fa || !fb) continue;
      const colorVal = fe.color === EDGE_COLORS.LEFT ? "#3b82f6" : fe.color === EDGE_COLORS.RIGHT ? "#ef4444" : "#22c55e";
      const isCut = fallingId === edgeId;
      const ballCount = isCut ? 22 : 10 + Math.floor(Math.random() * 4);
      for (let i = 0; i < ballCount; i += 1) {
        const t = Math.random();
        const px = fa.x + (fb.x - fa.x) * t;
        const py = fa.y + (fb.y - fa.y) * t;
        const radius = 4 + Math.random() * 3;
        // Direction outward from cut center; cut edge gets stronger pop.
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.hypot(dx, dy) || 1;
        const speed = isCut ? 200 + Math.random() * 150 : 80 + Math.random() * 100;
        // SVG: <g> wrapper for translate, <circle> for body, <circle> for highlight
        const g = document.createElementNS(NS, "g");
        const body = document.createElementNS(NS, "circle");
        body.setAttribute("cx", "0");
        body.setAttribute("cy", "0");
        body.setAttribute("r", String(radius));
        body.setAttribute("fill", colorVal);
        body.setAttribute("filter", "drop-shadow(0 1px 2px rgba(0,0,0,0.3))");
        g.appendChild(body);
        const hl = document.createElementNS(NS, "circle");
        hl.setAttribute("cx", String(-radius * 0.35));
        hl.setAttribute("cy", String(-radius * 0.4));
        hl.setAttribute("r", String(radius * 0.32));
        hl.setAttribute("fill", "rgba(255,255,255,0.55)");
        g.appendChild(hl);
        svgEl.appendChild(g);
        marbles.push({
          el: g,
          x: px,
          y: py,
          vx: (dx / dist) * speed + (Math.random() - 0.5) * 60,
          vy: (dy / dist) * speed * 0.4 - 120 - Math.random() * 80,
          radius,
          phase: "fall",  // → "roll" → "fade"
          bounces: 0,
          opacity: 1,
          settleAt: 0,
        });
      }
    }
    const mrStart = performance.now();
    let mrLast = mrStart;
    function stepMarbleRoll(now) {
      const dt = Math.min((now - mrLast) / 1000, 0.04);
      mrLast = now;
      let active = false;
      for (const m of marbles) {
        if (m.opacity <= 0) continue;
        active = true;
        if (m.phase === "fall") {
          m.vy += 1100 * dt;
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          const groundY = groundYAt(m.x) - m.radius;
          if (m.y > groundY && m.vy > 0) {
            m.y = groundY;
            const speed = Math.hypot(m.vx, m.vy);
            // High-speed bounce; low-speed → start rolling
            if (speed > 80 && m.bounces < 3) {
              const restitution = m.bounces === 0 ? 0.5 : m.bounces === 1 ? 0.32 : 0.18;
              m.vy = -Math.abs(m.vy) * restitution;
              m.vx *= 0.85;
              m.bounces += 1;
            } else {
              m.phase = "roll";
              m.vy = 0;
            }
          }
        } else if (m.phase === "roll") {
          // Slide along the ground curve. Friction slows horizontal motion;
          // y is constrained to groundYAt(x) - radius so the marble hugs the
          // curve. Direction of slope adds/subtracts to vx (downhill speeds
          // up, uphill slows down) — small effect.
          m.vx *= Math.pow(0.94, dt * 60);  // friction
          // Add slope acceleration (gravity component along curve)
          const gy0 = groundYAt(m.x);
          const gy1 = groundYAt(m.x + 6);
          const slope = (gy1 - gy0) / 6;
          m.vx += slope * 200 * dt;
          m.x += m.vx * dt;
          m.y = groundYAt(m.x) - m.radius;
          if (Math.abs(m.vx) < 6) {
            m.phase = "fade";
            m.settleAt = now;
          }
        } else if (m.phase === "fade") {
          const fade = Math.min((now - m.settleAt) / 700, 1);
          m.opacity = 1 - fade;
        }
        m.el.setAttribute("transform", `translate(${m.x}, ${m.y})`);
        if (m.opacity < 1) m.el.setAttribute("opacity", String(m.opacity));
      }
      if (active) requestAnimationFrame(stepMarbleRoll);
      else svgEl.remove();
    }
    requestAnimationFrame(stepMarbleRoll);

  } else {
    // fallback: remove overlay immediately for unknown modes
    svgEl.remove();
  }
}

// ─�� Position / Play ──

function setPosition(position, immediate = true, keepMarks = false, gated = false) {
  // A new position interrupts any in-flight boss solve.
  if (state.bossSolve) teardownBossSolve();
  // Persistent ink marks belong to the previous position; clear them on a fresh
  // load/reset (unless "permanent"). Applying a move passes keepMarks=true so
  // marks accumulate across cuts within a single game.
  if (!keepMarks && state.inkMarkMode !== "permanent") clearInkMarks();
  // Normalize the incoming position so we never display orphan/floating nodes
  // or edges that the solver would prune. Without this, the Random button
  // (which mutates a preset by removing edges) and JSON loads with garbage
  // both surface stranded subgraphs that confuse users.
  state.position = clonePosition(normalizePosition(position));
  state.abstractExample = null;
  state.connectFromId = null;
  state.hoverEdgeId = null;
  state.analysisError = null;
  clearIllegalMoveState();
  clearSelection();
  state.analysisGated = gated;
  render();
  if (gated) {
    // Heavy "boss" load: don't auto-solve (it would freeze the page for a second
    // or two). Park the analysis panel on a Solve prompt instead.
    state.analysis = null;
    state.analysisPending = false;
    renderAnalysis();
  } else {
    scheduleAnalysis(immediate);
  }
  // A fresh load is a new editing baseline.
  if (state.mode === "edit" && !state.restoringHistory) resetCreateHistory();
}

function clearAbstractExampleMode() {
  if (!state.abstractExample) return;
  state.abstractExample = null;
}

function loadAbstractExample(example) {
  if (!example || example.mode !== "abstract") return;
  if (state.mode === "auto") {
    stopAutoMode();
  }
  clearOpponentTimer();
  state.mode = "edit";
  state.play.active = false;
  state.play.winner = null;
  state.play.history = [];
  state.abstractExample = example;
  state.position = emptyPosition();
  state.analysis = null;
  state.auto.lastMove = null;
  state.connectFromId = null;
  state.hoverEdgeId = null;
  state.analysisError = null;
  clearIllegalMoveState();
  clearSelection();
  render();
  scheduleAnalysis(true);
}

function addNode(point, ground = false) {
  clearAbstractExampleMode();
  const node = {
    id: nextId(ground ? "g" : "n"),
    x: clamp(point.x, 42, BOARD_WIDTH - 42),
    y: ground ? GROUND_Y : clamp(point.y, 64, GROUND_Y - 56),
    ground,
  };
  state.position.nodes.push(node);
  state.selectedNodeId = node.id;
  state.selectedEdgeId = null;
  render();
  scheduleAnalysis(false);
  recordCreateHistory();
  return node;
}

function toggleGround(nodeId) {
  clearAbstractExampleMode();
  const node = findNode(nodeId);
  if (!node) return;
  node.ground = !node.ground;
  node.y = node.ground ? GROUND_Y : clamp(node.y - 80, 70, GROUND_Y - 56);
  render();
  scheduleAnalysis(false);
  recordCreateHistory();
}

function removeNode(nodeId) {
  clearAbstractExampleMode();
  state.position.nodes = state.position.nodes.filter((n) => n.id !== nodeId);
  state.position.edges = state.position.edges.filter((e) => e.a !== nodeId && e.b !== nodeId);
  if (state.connectFromId === nodeId) state.connectFromId = null;
  clearSelection();
  render();
  scheduleAnalysis(false);
  recordCreateHistory();
}

function removeEdge(edgeId) {
  clearAbstractExampleMode();
  const edge = state.position.edges.find((e) => e.id === edgeId);
  state.position.edges = state.position.edges.filter((e) => e.id !== edgeId);
  if (state.selectedEdgeId === edgeId) state.selectedEdgeId = null;
  // Prune the just-deleted edge's endpoints if they have no other edges and
  // aren't ground. (The Node tool can still stage intentional floating nodes
  // by clicking empty canvas — that path doesn't run through here.) Without
  // this, deleting the only edge on a stalk leaves a stranded vertex behind.
  if (edge) {
    const endpoints = new Set([edge.a, edge.b]);
    state.position.nodes = state.position.nodes.filter((n) => {
      if (!endpoints.has(n.id)) return true;
      if (n.ground) return true;
      return state.position.edges.some((e) => e.a === n.id || e.b === n.id);
    });
  }
  render();
  scheduleAnalysis(false);
  recordCreateHistory();
}

function addEdge(fromId, toId) {
  clearAbstractExampleMode();
  if (fromId === toId) return;
  state.position.edges.push({
    id: nextId("e"),
    a: fromId,
    b: toId,
    color: state.edgeColor,
    stable: state.stableEdge,
  });
  state.selectedNodeId = null;
  state.selectedEdgeId = null;
  state.connectFromId = null;
  render();
  scheduleAnalysis(false);
  recordCreateHistory();
}

function beginPlaySession() {
  clearOpponentTimer();
  clearBranchTimer();
  state.play.active = true;
  state.play.winner = null;
  state.play.history = [];
  clearIllegalMoveState();
  state.play.startingPosition = clonePosition(state.position);
  state.play.hasStartingPosition = true;
  state.play.snapshots = [clonePosition(state.play.startingPosition)];
  state.play.replayIndex = null;
  state.play.livePosition = null;
  state.sideToMove = state.play.startingSide;
  setPosition(state.play.startingPosition, true);
}

function restartPlaySession() {
  if (!state.play.hasStartingPosition || !state.play.startingPosition) return;
  clearOpponentTimer();
  clearBranchTimer();
  state.play.active = true;
  state.play.winner = null;
  state.play.history = [];
  state.play.snapshots = [clonePosition(state.play.startingPosition)];
  state.play.replayIndex = null;
  state.play.livePosition = null;
  clearIllegalMoveState();
  state.sideToMove = state.play.startingSide;
  setPosition(state.play.startingPosition, true);
}

function endPlaySession() {
  const restorePosition = clonePosition(state.play.startingPosition ?? state.position);
  clearOpponentTimer();
  clearBranchTimer();
  state.play.active = false;
  state.play.winner = null;
  state.play.history = [];
  state.play.snapshots = [];
  state.play.replayIndex = null;
  state.play.livePosition = null;
  clearIllegalMoveState();
  state.sideToMove = state.play.startingSide;
  setPosition(restorePosition, true);
}

// Duration of the history "fall-off" when a move branches the timeline.
const HISTORY_FALL_MS = 460;

function playMove(player, edgeId, source = "manual") {
  // A branch fall-off animation is in flight; ignore new moves until it lands.
  if (state.play.branchPending) return false;
  const move = moveFor(player, edgeId);
  if (!move) {
    if (source === "engine") {
      return resolveIllegalMoveLoss(player, edgeId, source);
    }
    return false;
  }
  // Compute commentary BEFORE we apply the move (so analysis still reflects
  // the pre-move position).
  const commentary = computeMoveCommentary(player, move);
  clearIllegalMoveState();

  // A move played from a reverted (scrubbed) point branches the timeline: the
  // old future is now obsolete. Animate those orphaned entries darkening and
  // tipping off, then commit the move (which truncates them for real).
  if (isPlayActive() && state.play.replayIndex !== null) {
    const branchAt = state.play.replayIndex;
    clearOpponentTimer();
    const orphans = collectFallingHistoryEntries(branchAt);
    if (orphans.length) {
      state.play.branchPending = true;
      orphans.forEach((el) => el.classList.add("is-falling"));
      state.play.branchTimer = window.setTimeout(() => {
        state.play.branchTimer = null;
        state.play.branchPending = false;
        if (isPlayActive()) commitPlayMove(player, source, move, commentary, branchAt);
      }, HISTORY_FALL_MS);
      return true;
    }
    return commitPlayMove(player, source, move, commentary, branchAt);
  }
  return commitPlayMove(player, source, move, commentary, null);
}

// Commits a move to the live game. When branchAt is set, the discarded future
// (history[branchAt..] / snapshots[branchAt+1..]) is truncated first.
function commitPlayMove(player, source, move, commentary, branchAt) {
  if (isPlayActive()) {
    if (branchAt !== null) {
      state.play.history.length = branchAt;
      state.play.snapshots.length = branchAt + 1;
      state.play.replayIndex = null;
      state.play.livePosition = null;
      state.play.liveSideToMove = null;
    }
    state.play.history.push({
      source, player,
      edgeId: move.edgeId,
      label: move.label,
      value: move.resultingValue?.label ?? "heuristic only",
      commentary,
    });
    // Snapshot the resulting position so the replay scrubber can step back to it.
    state.play.snapshots.push(clonePosition(move.resultingPosition));
    state.play.winner = null;
  }
  if (state.mode === "auto" && state.auto.active) {
    recordAutoLastMove(player, move.label, source, commentary);
  }
  animateEdgeCut(move.edgeId);
  state.sideToMove = player === PLAYERS.LEFT ? PLAYERS.RIGHT : PLAYERS.LEFT;
  setPosition(move.resultingPosition, true, true);
  return true;
}

// The history entries that a branch at `branchAt` discards (snapshot > branchAt).
function collectFallingHistoryEntries(branchAt) {
  if (!refs.moveHistory) return [];
  return [...refs.moveHistory.querySelectorAll(".history-entry[data-snapshot]")]
    .filter((el) => {
      const s = Number(el.dataset.snapshot);
      return Number.isInteger(s) && s > branchAt;
    });
}

function computeMoveCommentary(player, chosenMove) {
  if (!state.analysis) return null;
  const moves = state.analysis.moves[player] ?? [];
  if (moves.length === 0) return null;
  if (moves.length === 1) {
    return { kind: "forced", text: "Forced — only legal move." };
  }
  const recommended = state.analysis.recommendations[player];
  const isOptimal = recommended && recommended.edgeId === chosenMove.edgeId;
  const recValueLabel = recommended?.resultingValue?.label;
  const chosenValueLabel = chosenMove.resultingValue?.label;
  if (isOptimal) {
    return {
      kind: "optimal",
      text: `Optimal — best of ${moves.length} options${recValueLabel ? ` (→ ${recValueLabel})` : ""}.`,
    };
  }
  if (chosenValueLabel && recValueLabel && chosenValueLabel !== recValueLabel) {
    return {
      kind: "suboptimal",
      text: `Suboptimal of ${moves.length} — chose ${chosenValueLabel}, optimal was ${recValueLabel}.`,
    };
  }
  return { kind: "alternate", text: `One of ${moves.length} legal moves.` };
}

// ── Replay scrubber ──

function scrubTo(idx) {
  if (!isPlayActive() || !state.play.snapshots.length) return;
  const clamped = Math.max(0, Math.min(state.play.snapshots.length - 1, idx));
  // Entering replay for the first time: stash the live position AND the live
  // sideToMove. Without saving sideToMove, scrubLive() would leave it pointing
  // at whatever side was current when scrubbing started, but if the user
  // scrubs through opponent-played moves the side would already have flipped
  // visually. We need a proper round-trip.
  if (state.play.replayIndex === null) {
    state.play.livePosition = clonePosition(state.position);
    state.play.liveSideToMove = state.sideToMove;
  }
  state.play.replayIndex = clamped;
  state.position = clonePosition(state.play.snapshots[clamped]);
  // Also restore sideToMove so the analysis runs for the player whose turn
  // it actually is at this point in history. Without this, the "best move"
  // indicator pulses on the WRONG side's recommended edge, which is the
  // exact symptom the user reported.
  //   snapshot 0  → starting position, no moves played → startingSide moves
  //   snapshot i  → after history[i-1] applied → otherSide(history[i-1].player)
  if (clamped === 0) {
    state.sideToMove = state.play.startingSide ?? PLAYERS.LEFT;
  } else {
    const lastEntry = state.play.history[clamped - 1];
    state.sideToMove = lastEntry ? otherSide(lastEntry.player) : (state.play.startingSide ?? PLAYERS.LEFT);
  }
  scheduleAnalysis(true);
  render();
}

function scrubPrev() {
  if (!isPlayActive() || !state.play.snapshots.length) return;
  const cur = state.play.replayIndex === null
    ? state.play.snapshots.length - 1
    : state.play.replayIndex;
  scrubTo(cur - 1);
}

function scrubNext() {
  if (!isPlayActive() || !state.play.snapshots.length) return;
  if (state.play.replayIndex === null) return; // already live
  const next = state.play.replayIndex + 1;
  if (next >= state.play.snapshots.length - 1) {
    scrubLive();
  } else {
    scrubTo(next);
  }
}

function scrubLive() {
  if (state.play.replayIndex === null) return;
  state.play.replayIndex = null;
  if (state.play.livePosition) {
    state.position = state.play.livePosition;
    state.play.livePosition = null;
  }
  // Restore the live side-to-move that we stashed in scrubTo() — otherwise
  // the live state would inherit whatever side was active at the scrubbed-to
  // history position.
  if (state.play.liveSideToMove !== undefined && state.play.liveSideToMove !== null) {
    state.sideToMove = state.play.liveSideToMove;
    state.play.liveSideToMove = null;
  }
  scheduleAnalysis(true);
  render();
}

function isScrubbing() {
  return isPlayActive() && state.play.replayIndex !== null;
}

function playSuggestedMove() {
  const move = currentHumanRecommendation();
  if (!move) return;
  if (isPlayActive()) {
    if (!isUserTurn()) return;
    playMove(state.play.userSide, move.edgeId, "manual");
    return;
  }
  playMove(state.sideToMove, move.edgeId, "manual");
}

function maybeAutoPlayOpponent() {
  clearOpponentTimer();
  // Never auto-move while the user is reviewing history. Without this, merely
  // scrubbing back to an engine turn armed the opponent timer, and the move it
  // played branched the timeline — silently deleting the future you were
  // looking at. Reviewing must be read-only; only a deliberate move branches.
  if (isScrubbing()) return;
  if (!isPlayActive() || state.analysisPending || state.analysisError || !state.analysis) return;
  const availableMoves = state.analysis.moves[state.sideToMove] ?? [];
  if (availableMoves.length === 0) {
    // Guard against re-fire on subsequent re-analyses of the same lost state.
    if (state.play.winner === null) {
      state.play.winner = otherSide(state.sideToMove);
      showLoserCross(state.sideToMove);
    }
    render();
    return;
  }
  if (state.sideToMove === state.play.userSide) {
    state.play.winner = null;
    render();
    return;
  }
  state.play.opponentTimer = window.setTimeout(() => {
    if (!isPlayActive() || state.play.winner || state.sideToMove !== otherSide(state.play.userSide)) return;
    if (!state.analysis || state.analysisPending || state.analysisError) return;
    const infEdge = state.position.edges.find(
      (e) => e.infinite && edgeLooksPlayableFor(state.sideToMove, e),
    );
    if (infEdge) {
      cutInfiniteEdge(infEdge.id, enginePickInfiniteCut(), "engine");
      return;
    }
    const liveMoves = state.analysis.moves[state.sideToMove] ?? [];
    if (liveMoves.length === 0) {
      if (state.play.winner === null) {
        state.play.winner = state.play.userSide;
        showLoserCross(state.sideToMove);
      }
      render();
      return;
    }
    const opponentMove = pickEngineMove(state.sideToMove)
      ?? liveMoves[Math.floor(Math.random() * liveMoves.length)];
    playMove(state.sideToMove, opponentMove.edgeId, "engine");
  }, 550);
}

// ── Analysis ──

// LRU cache for already-analyzed positions. Keyed by a structural fingerprint
// so iso-equivalent positions hit the cache. When the user scrubs through play
// history or revisits a preset, we return the previous analysis instantly
// instead of re-running the engine. Verbose mode disables caching since the
// trace depends on the moment-by-moment recursion log.
const ANALYSIS_CACHE_SIZE = 24;
const analysisCache = new Map();

function positionFingerprint(position) {
  if (!position) return "";
  const nodes = (position.nodes ?? [])
    .map((n) => `${n.id}${n.ground ? "g" : ""}`)
    .sort()
    .join("|");
  const edges = (position.edges ?? [])
    .map((e) => {
      const ends = [e.a, e.b].sort().join("-");
      const flags = `${e.color[0]}${e.stable ? "s" : ""}${e.infinite ? "i" : ""}${e.loop ? "l" : ""}${e.loopKind ? e.loopKind[0] : ""}`;
      return `${e.id}:${ends}:${flags}`;
    })
    .sort()
    .join("|");
  return `${nodes}||${edges}`;
}

function getCachedAnalysis(position) {
  const key = positionFingerprint(position);
  const cached = analysisCache.get(key);
  if (cached) {
    // LRU bump: re-insert so this entry is now the most-recently-used.
    analysisCache.delete(key);
    analysisCache.set(key, cached);
    return cached;
  }
  return null;
}

function cacheAnalysis(position, analysis) {
  const key = positionFingerprint(position);
  analysisCache.set(key, analysis);
  while (analysisCache.size > ANALYSIS_CACHE_SIZE) {
    const oldest = analysisCache.keys().next().value;
    analysisCache.delete(oldest);
  }
}

function clearAnalysisCache() {
  analysisCache.clear();
}

function analyzeNow() {
  state.analysisPending = true;
  renderAnalysis();
  window.setTimeout(() => {
    try {
      const cached = !state.showVerbose && !state.abstractExample
        ? getCachedAnalysis(state.position)
        : null;
      if (cached) {
        state.analysis = cached;
      } else if (state.abstractExample) {
        state.analysis = analyzeAbstractExample(state.abstractExample);
      } else {
        state.analysis = analyzePosition(state.position, undefined, { verbose: state.showVerbose });
        if (!state.showVerbose) cacheAnalysis(state.position, state.analysis);
      }
      state.analysisError = null;
    } catch (error) {
      state.analysis = null;
      state.analysisError = error;
    }
    state.analysisPending = false;
    const frame = document.querySelector("#boardFrame");
    if (frame) frame.classList.remove("is-analyzing");
    render();
    maybeAutoPlayOpponent();
    if (state.mode === "auto" && state.auto.active && !state.auto.paused) {
      scheduleAutoMove();
    }
  }, 0);
}

function scheduleAnalysis(immediate) {
  window.clearTimeout(state.analysisTimer);
  state.analysisPending = true;
  // Flip the board-frame "analyzing" class so the shimmering indicator shows
  // while the worker-less synchronous engine is crunching.
  const frame = document.querySelector("#boardFrame");
  if (frame) frame.classList.add("is-analyzing");
  renderAnalysis();
  // Always defer at least one tick so the browser paints the "Analyzing…"
  // indicator before the synchronous engine call blocks the main thread.
  state.analysisTimer = window.setTimeout(analyzeNow, immediate ? 0 : ANALYSIS_DEBOUNCE_MS);
}

// ── Boss solver (off the main thread) ──
// Heavy "boss" positions can take seconds to solve; doing that synchronously
// would freeze the page. We hand the position to a Web Worker, stream a live
// state count, and allow cancelling. postMessage (structured clone) returns the
// analysis verbatim — BigInt nimber values and all.

// There is deliberately no up-front time estimate. An edge-count model was
// tried and was wrong by up to 12.5x, because solve cost is driven by the
// position's structure (symmetry memoizes; asymmetry explodes), not its edge
// count. The panel streams the real state count and elapsed time instead, which
// is a measurement rather than a guess.

function ensureSolverWorker() {
  if (state.solverWorker) return state.solverWorker;
  const worker = new Worker(new URL("./solver-worker.js?v=3", import.meta.url), { type: "module" });
  worker.onmessage = (event) => handleSolverMessage(event.data);
  worker.onerror = () => {
    // Worker failed to start (e.g. an import error): fall back to a main-thread
    // solve so the user still gets an answer, just without the live progress.
    teardownBossSolve();
    state.analysisGated = false;
    scheduleAnalysis(true);
  };
  state.solverWorker = worker;
  return worker;
}

function teardownBossSolve() {
  stopBossTimer();
  if (state.solverWorker) {
    state.solverWorker.terminate(); // synchronous solve can't yield; terminate to truly stop
    state.solverWorker = null;
  }
  state.bossSolve = null;
}

function solveBossViaWorker() {
  if (state.bossSolve) teardownBossSolve(); // cancel any in-flight solve first
  let worker;
  try {
    worker = ensureSolverWorker();
  } catch (err) {
    // Web Workers unavailable (very old browser): solve on the main thread. It
    // will briefly freeze, but the user still gets an answer.
    state.analysisGated = false;
    scheduleAnalysis(true);
    return;
  }
  state.analysisGated = false;
  state.analysisError = null;
  state.bossSolve = {
    active: true,
    states: 0,
    startedAt: performance.now(),
    timer: null,
  };
  startBossTimer();
  renderAnalysis();
  worker.postMessage({ position: state.position, limits: { maxPositions: 200000, maxSums: 200000 } });
}

function handleSolverMessage(msg) {
  if (!state.bossSolve) return; // already cancelled / torn down
  if (msg.type === "progress") {
    state.bossSolve.states = msg.states;
    updateBossProgressUI();
    return;
  }
  stopBossTimer();
  state.bossSolve = null; // keep the worker alive for the next solve
  if (msg.type === "done") {
    state.analysis = msg.analysis;
    state.analysisError = null;
    cacheAnalysis(state.position, msg.analysis);
  } else {
    state.analysis = null;
    state.analysisError = msg.name === "AnalysisLimitError"
      ? new AnalysisLimitError(msg.message)
      : new Error(msg.message || "Solve failed");
  }
  render();
}

function cancelBossSolve() {
  teardownBossSolve();
  state.analysisGated = true; // back to the Solve gate
  renderAnalysis();
}

function startBossTimer() {
  stopBossTimer();
  if (state.bossSolve) state.bossSolve.timer = window.setInterval(updateBossProgressUI, 150);
}

function stopBossTimer() {
  if (state.bossSolve && state.bossSolve.timer) {
    window.clearInterval(state.bossSolve.timer);
    state.bossSolve.timer = null;
  }
}

function updateBossProgressUI() {
  const el = document.querySelector("#bossProgress");
  if (!el || !state.bossSolve) return;
  const elapsed = (performance.now() - state.bossSolve.startedAt) / 1000;
  el.textContent = `${state.bossSolve.states.toLocaleString()} states · ${elapsed.toFixed(1)}s elapsed`;
}

// ── Auto Mode ──

function generateAutoPosition() {
  const MIN_EDGES = 3;
  // Filter out tiny presets — auto mode shouldn't show trivial 0/1-edge games.
  const candidates = loadableExamples.filter((ex) =>
    !ex.unsupported && !ex.heavy && ex.position && (ex.position.edges?.length ?? 0) >= MIN_EDGES,
  );
  if (candidates.length === 0) return clonePosition(initialPreset.position);
  // Try a few times to land on a non-trivial position after mutation; fall
  // back to the base preset if all attempts collapse below the threshold.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const base = candidates[Math.floor(Math.random() * candidates.length)];
    const pos = clonePosition(base.position);

    const mutations = Math.floor(Math.random() * 3);
    for (let i = 0; i < mutations; i++) {
      const nonGroundEdges = pos.edges.filter((e) => {
        const a = pos.nodes.find((n) => n.id === e.a);
        const b = pos.nodes.find((n) => n.id === e.b);
        return a && b && !e.stable;
      });
      if (Math.random() < 0.5 && nonGroundEdges.length > MIN_EDGES) {
        // Only allow removal if we'd stay above the trivial threshold.
        const idx = Math.floor(Math.random() * nonGroundEdges.length);
        pos.edges = pos.edges.filter((e) => e.id !== nonGroundEdges[idx].id);
      } else if (pos.nodes.length >= 2) {
        const a = pos.nodes[Math.floor(Math.random() * pos.nodes.length)];
        const b = pos.nodes[Math.floor(Math.random() * pos.nodes.length)];
        if (a.id !== b.id) {
          const colors = [EDGE_COLORS.LEFT, EDGE_COLORS.RIGHT, EDGE_COLORS.NEUTRAL];
          pos.edges.push({
            id: nextId("e"),
            a: a.id,
            b: b.id,
            color: colors[Math.floor(Math.random() * colors.length)],
            stable: false,
          });
        }
      }
    }

    // Normalize so we count only edges that actually contribute to the game.
    const normalized = normalizePosition(pos);
    if (normalized.edges.length >= MIN_EDGES) return normalized;
  }
  // No mutation produced a meaty position — return the largest base candidate.
  const richest = candidates
    .slice()
    .sort((a, b) => (b.position.edges?.length ?? 0) - (a.position.edges?.length ?? 0))[0];
  return clonePosition(richest.position);
}

function startAutoGame() {
  const pos = generateAutoPosition();
  const startingSide = Math.random() < 0.5 ? PLAYERS.LEFT : PLAYERS.RIGHT;
  clearAutoCelebrationTimer();
  state.auto.active = true;
  state.auto.paused = false;
  state.auto.startingSide = startingSide;
  state.auto.lastMove = null;
  state.sideToMove = startingSide;
  clearIllegalMoveState();
  if (refs.autoCelebration) {
    refs.autoCelebration.style.display = "none";
    refs.autoCelebration.className = "auto-celebration";
  }
  setPosition(pos, true);
}

function scheduleAutoMove() {
  if (!state.auto.active || state.auto.paused) return;
  if (state.auto.timer !== null) {
    window.clearTimeout(state.auto.timer);
    state.auto.timer = null;
  }
  state.auto.timer = window.setTimeout(executeAutoMove, state.auto.speed);
}

function executeAutoMove() {
  state.auto.timer = null;
  if (!state.auto.active || state.auto.paused) return;
  if (!state.analysis) return;

  // Loopy positions (on/off/over/under/dud) have a perpetual structure that
  // makes "playing it out" meaningless. Resolve immediately based on the
  // outcome class derived from the loopy value.
  const v = state.analysis.value;
  if (v && v.kind === "loopy") {
    if (v.outcomeClass === "L") {
      autoGameOver(PLAYERS.LEFT, { reason: "Loopy: Blue wins by perpetual motion.", note: `Loopy value: ${v.label}` });
    } else if (v.outcomeClass === "R") {
      autoGameOver(PLAYERS.RIGHT, { reason: "Loopy: Red wins by perpetual motion.", note: `Loopy value: ${v.label}` });
    } else if (v.outcomeClass === "D") {
      // Draw — declare it a draw rather than picking a winner. autoGameOver
      // increments a side's score; for a draw we pause autoplay and warn.
      state.auto.active = false;
      state.auto.paused = true;
      if (refs.autoCelebration) {
        refs.autoCelebration.className = "auto-celebration";
        refs.autoCelebration.style.display = "flex";
        refs.autoCelebration.innerHTML = `
          <div class="celebration-inner">
            <div class="auto-result-title">Loopy Draw (dud)</div>
            <div class="auto-result-subtitle">Either side can keep the loop alive indefinitely. Auto-play paused — this position has no terminating perfect play.</div>
          </div>`;
        // Auto-resume after a beat
        state.auto.celebrationTimer = window.setTimeout(() => {
          if (refs.autoCelebration) refs.autoCelebration.style.display = "none";
          if (state.mode === "auto") startAutoGame();
        }, Math.max(2000, state.auto.speed * 3));
      }
    } else {
      // Fallback: just resign to current side-to-move's opponent.
      autoGameOver(otherSide(state.sideToMove));
    }
    return;
  }

  const moves = state.analysis.moves[state.sideToMove] ?? [];
  if (moves.length === 0) {
    autoGameOver(otherSide(state.sideToMove));
    return;
  }

  // Check for infinite edges
  const infEdge = state.position.edges.find(
    (e) => e.infinite && edgeLooksPlayableFor(state.sideToMove, e),
  );
  if (infEdge) {
    cutInfiniteEdge(infEdge.id, enginePickInfiniteCut(), "engine");
    return;
  }

  const pick = pickEngineMove(state.sideToMove);
  if (pick) {
    playMove(state.sideToMove, pick.edgeId, "engine");
  }
}

function autoGameOver(winner, details = {}) {
  // Big colored X over the board for the loser, drawn before the win banner.
  const loser = otherSide(winner);
  showLoserCross(loser);
  state.auto.active = false;
  if (state.auto.timer !== null) {
    window.clearTimeout(state.auto.timer);
    state.auto.timer = null;
  }
  clearAutoCelebrationTimer();
  state.auto.score[winner] += 1;
  state.auto.gamesPlayed += 1;

  if (refs.autoScoreBlue) refs.autoScoreBlue.textContent = String(state.auto.score.left);
  if (refs.autoScoreRed) refs.autoScoreRed.textContent = String(state.auto.score.right);

  if (refs.autoCelebration) {
    const winnerLabel = winner === PLAYERS.LEFT ? "Blue" : "Red";
    const loserLabel = winner === PLAYERS.LEFT ? "Red" : "Blue";
    const winnerClass = winner === PLAYERS.LEFT ? "color-blue" : "color-red";
    const winnerOrder = playerOrderLabel(winner, state.auto.startingSide);
    const isFast = state.auto.speed <= 400;
    const shape = winner === PLAYERS.LEFT
      ? `<div style="width:40px;height:40px;background:var(--blue);border-radius:6px;margin:0 auto 8px"></div>`
      : `<div style="width:0;height:0;border-left:20px solid transparent;border-right:20px solid transparent;border-bottom:40px solid var(--red);margin:0 auto 8px"></div>`;
    // Consistent ending text — every game ends because the current player has
    // no legal moves. Optional `note` slot covers loopy / special outcomes.
    const reasonText = details.reason || `${loserLabel} has no legal moves.`;
    const noteMarkup = details.note
      ? `<div class="auto-result-note">${colorize(escapeHtml(details.note))}</div>`
      : "";
    refs.autoCelebration.className = `auto-celebration${isFast ? " is-fast" : ""}`;
    refs.autoCelebration.style.display = "flex";
    refs.autoCelebration.innerHTML = `
      <div class="celebration-inner${isFast ? " is-fast" : ""}">
        ${isFast ? "" : shape}
        <div class="auto-result-title ${winnerClass}">${winnerLabel} wins!</div>
        <div class="auto-result-subtitle">${colorize(escapeHtml(`${winnerLabel} (${winnerOrder}) wins. ${reasonText}`))}</div>
        ${noteMarkup}
        <div class="auto-score">Score: ${state.auto.score.left} – ${state.auto.score.right}</div>
      </div>`;
  }

  render();

  // Banner duration scales with the speed control so Slow mode lingers longer
  // on the result and Fast mode flashes past. Fast-mode banner is compact so a
  // shorter floor is fine; Slow mode holds the win for ~4 seconds.
  const bannerDuration = Math.round(Math.max(1100, state.auto.speed * 2.4));
  state.auto.celebrationTimer = window.setTimeout(() => {
    state.auto.celebrationTimer = null;
    if (refs.autoCelebration) refs.autoCelebration.style.display = "none";
    if (state.mode === "auto") startAutoGame();
  }, bannerDuration);
}

function stopAutoMode() {
  if (state.auto.timer !== null) {
    window.clearTimeout(state.auto.timer);
    state.auto.timer = null;
  }
  clearAutoCelebrationTimer();
  state.auto.active = false;
  state.auto.paused = false;
  state.auto.lastMove = null;
  clearIllegalMoveState();
  if (refs.autoCelebration) refs.autoCelebration.style.display = "none";
  render();
}

function pauseAutoMode() {
  state.auto.paused = !state.auto.paused;
  if (state.auto.paused) {
    if (state.auto.timer !== null) {
      window.clearTimeout(state.auto.timer);
      state.auto.timer = null;
    }
  } else {
    scheduleAutoMove();
  }
  if (refs.autoPauseButton) {
    refs.autoPauseButton.textContent = state.auto.paused ? "Resume" : "Pause";
  }
}

// ── UI helpers ──

function shortId(id) {
  const match = /([A-Za-z]+[-]?\d+)$/.exec(id);
  return match ? match[1] : id;
}

function edgeColorClass(color) {
  if (color === EDGE_COLORS.LEFT) return "edge-blue";
  if (color === EDGE_COLORS.RIGHT) return "edge-red";
  return "edge-green";
}

function edgeColorText(color) {
  if (color === EDGE_COLORS.LEFT) return "Blue";
  if (color === EDGE_COLORS.RIGHT) return "Red";
  return "Green";
}

function edgeColorHtml(color) {
  const text = edgeColorText(color);
  const cls = color === EDGE_COLORS.LEFT ? "color-blue" : color === EDGE_COLORS.RIGHT ? "color-red" : "color-green";
  return `<span class="${cls}">${text}</span>`;
}

function hoverPerspectiveSide() {
  return isPlayActive() ? state.play.userSide : state.sideToMove;
}

function edgeLooksPlayableFor(side, edge) {
  if (edge.color === EDGE_COLORS.NEUTRAL) return true;
  return side === PLAYERS.LEFT ? edge.color === EDGE_COLORS.LEFT : edge.color === EDGE_COLORS.RIGHT;
}

function hoverGlowClass(edge, isSupported) {
  if (state.hoverEdgeId !== edge.id || !isSupported) return "";
  return edgeLooksPlayableFor(hoverPerspectiveSide(), edge) ? "edge-hover-friendly" : "edge-hover-opponent";
}

function kindLabel(kind) {
  if (kind === "number") return "Cold number";
  if (kind === "switch") return "Hot switch";
  if (kind === "nimber") return "Nimber";
  if (kind === "infinitesimal") return "Infinitesimal";
  if (kind === "infinite") return "Infinite value";
  if (kind === "loopy") return "Loopy game";
  return "Short game";
}

function outcomeClassText(oc) {
  if (oc === "L") return "Blue";
  if (oc === "R") return "Red";
  if (oc === "P") return "Previous";
  if (oc === "D") return "Draw";
  return "Next";
}

function currentTurnOutcome(value) {
  if (!value) return "-";
  return state.sideToMove === PLAYERS.LEFT
    ? value.currentPlayerResult.left
    : value.currentPlayerResult.right;
}

function toolHint() {
  if (state.abstractExample) {
    return "Named reference loaded. The board stays schematic here because this analysis is pattern-modeled rather than derived from a concrete Hackenbush drawing.";
  }
  if (state.mode === "play" && !isPlayActive()) return "Pick a game from the library below — it starts the moment you click it.";
  if (state.mode === "auto") return state.auto?.active ? "Auto mode running. Watch the game!" : "Click New Game to start auto mode.";
  if (isPlayActive()) {
    if (state.play.winner) return `Match over. ${turnLabel(state.play.winner)} wins.`;
    if (isUserTurn()) return "Your turn. Click a legal edge to play it.";
    return "Engine is thinking...";
  }
  // Create mode (only reached when not play/auto/abstract): onboarding hint on
  // an empty board.
  if (!state.position.edges.length) {
    return state.position.nodes.some((n) => !n.ground)
      ? "Drag from a node out to empty space to grow your first edge."
      : "Click to drop a node (near the ground makes it a ground node), then drag from it to grow an edge.";
  }
  if (state.tool === "node") return "Click to place a node — near the ground it becomes a ground node. Drag a node to move it; click it to toggle ground.";
  if (state.tool === "connection") return "Drag from one node to another to connect them.";
  if (state.tool === "delete") return "Click a node or edge to delete it.";
  // edge (default / main tool)
  return "Drag from a node to grow an edge — release on empty space to add a new node. Click an edge to select it.";
}

function supportBadge(example) {
  if (example.mode === "loadable") return "Loadable";
  if (example.mode === "abstract") return example.support === "loopy" ? "Modeled loopy" : "Modeled reference";
  if (example.support === "infinite") return "Infinite ref";
  if (example.support === "loopy") return "Loopy ref";
  return "Reference";
}

function referenceAccent(example) {
  if (example.support === "loopy") return "#b8692d";
  if (example.support === "infinite") return "#2c6ee9";
  if (example.mode === "abstract") return "#22567c";
  return "#36536f";
}

function figurePalette(example) {
  const accent = referenceAccent(example);
  return {
    accent,
    accentSoft: example.support === "loopy" ? "rgba(184,105,45,0.18)" : example.support === "infinite" ? "rgba(44,110,233,0.16)" : "rgba(34,86,124,0.14)",
    bg: example.support === "loopy" ? "#fff2e6" : "#f6fbff",
    ink: "#132135",
    blue: "#2563eb",
    red: "#d44d49",
    muted: "rgba(19,33,53,0.55)",
  };
}

function layoutAbstractFigureTree(root, width, height) {
  let nextId = 0;
  const nodes = [];
  const links = [];
  const rootY = height * 0.26;
  const depthGap = height * 0.29;

  function place(node, x, y, spread, depth, parentId = null, side = null) {
    const id = `abs-${nextId++}`;
    nodes.push({
      id,
      label: node?.label ?? "?",
      x,
      y,
      root: depth === 0,
      isNumber: Boolean(node?.isNumber),
      loop: Boolean(node?.truncated),
    });
    if (parentId !== null) {
      links.push({ from: parentId, to: id, side });
    }
    if (!node || depth >= 2) return;

    const childSpread = Math.max(spread * 0.58, width * 0.12);
    const nextY = y + depthGap;
    const leftChildren = node.left ?? [];
    const rightChildren = node.right ?? [];
    const leftStep = leftChildren.length > 1 ? Math.min(spread * 0.42, width * 0.12) : 0;
    const rightStep = rightChildren.length > 1 ? Math.min(spread * 0.42, width * 0.12) : 0;

    leftChildren.forEach((child, index) => {
      const childX = x - spread + ((index - ((leftChildren.length - 1) / 2)) * leftStep);
      place(child, childX, nextY, childSpread, depth + 1, id, "left");
    });
    rightChildren.forEach((child, index) => {
      const childX = x + spread + ((index - ((rightChildren.length - 1) / 2)) * rightStep);
      place(child, childX, nextY, childSpread, depth + 1, id, "right");
    });
  }

  place(root, width / 2, rootY, width * 0.23, 0);
  return { nodes, links };
}

function abstractTreeFigureSvg(example, options = {}) {
  const width = options.width ?? 100;
  const height = options.height ?? 60;
  const compact = Boolean(options.compact);
  const board = Boolean(options.board);
  const palette = figurePalette(example);
  const tree = example.abstractAnalysis?.gameTree;
  if (!tree) return "";

  const { nodes, links } = layoutAbstractFigureTree(tree, width, height);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const labelFont = board ? 15 : compact ? 7.5 : 10;
  const badgeFont = board ? 13 : compact ? 6.5 : 8;
  let svg = `<svg class="preset-thumb abstract-thumb" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`;
  svg += `<rect x="0" y="0" width="${width}" height="${height}" rx="${board ? 28 : 12}" fill="${palette.bg}" />`;
  svg += `<path d="M ${width * 0.06} ${height * 0.82} C ${width * 0.24} ${height * 0.64}, ${width * 0.45} ${height * 0.98}, ${width * 0.92} ${height * 0.72}" fill="none" stroke="${palette.accentSoft}" stroke-width="${board ? 18 : 8}" stroke-linecap="round" />`;
  svg += `<text x="${width - (board ? 28 : 10)}" y="${board ? 34 : 14}" font-size="${badgeFont}" text-anchor="end" fill="${palette.muted}" font-weight="700">${escapeHtml(supportBadge(example))}</text>`;

  for (const link of links) {
    const from = nodeMap.get(link.from);
    const to = nodeMap.get(link.to);
    if (!from || !to) continue;
    const stroke = link.side === "left" ? palette.blue : palette.red;
    const midY = (from.y + to.y) / 2;
    svg += `<path d="M ${from.x} ${from.y + (board ? 18 : 10)} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y - (board ? 18 : 10)}" fill="none" stroke="${stroke}" stroke-width="${board ? 4 : 2.1}" stroke-linecap="round" opacity="0.9"/>`;
  }

  for (const node of nodes) {
    const nodeW = clamp((node.label.length * (board ? 10 : compact ? 5.4 : 6.6)) + (board ? 36 : 20), compact ? 22 : 30, board ? 160 : 86);
    const nodeH = board ? 34 : compact ? 12 : 18;
    const x = node.x - (nodeW / 2);
    const y = node.y - (nodeH / 2);
    const fill = node.loop ? "#ffe8ce" : node.isNumber ? "#eef4ff" : node.root ? "#fff7ea" : "#ffffff";
    const stroke = node.loop ? palette.accent : node.isNumber ? palette.blue : "rgba(19,33,53,0.22)";
    svg += `<rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="${board ? 16 : 9}" fill="${fill}" stroke="${stroke}" stroke-width="${board ? 2 : 1.1}" />`;
    svg += `<text x="${node.x}" y="${node.y + (board ? 5 : compact ? 2.6 : 3.2)}" font-size="${labelFont}" text-anchor="middle" fill="${palette.ink}" font-weight="${node.root ? 700 : 600}">${escapeHtml(node.label)}</text>`;
    if (node.loop) {
      const loopR = board ? 16 : 7;
      svg += `<path d="M ${node.x + loopR * 0.2} ${y + 2} C ${node.x + loopR * 1.3} ${y - loopR * 0.9}, ${node.x + loopR * 1.4} ${y + loopR * 0.9}, ${node.x + loopR * 0.25} ${y + loopR * 1.2}" fill="none" stroke="${palette.accent}" stroke-width="${board ? 2.2 : 1.2}" stroke-linecap="round"/>`;
      svg += `<path d="M ${node.x + loopR * 0.26} ${y + loopR * 1.18} l ${board ? 6 : 3.2} ${board ? -4 : -2.2} l ${board ? -1.2 : -0.8} ${board ? 6 : 3.2}" fill="none" stroke="${palette.accent}" stroke-width="${board ? 2.2 : 1.2}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }

  if (board) {
    svg += `<text x="${width / 2}" y="${height - 28}" text-anchor="middle" font-size="15" fill="${palette.accent}" font-weight="700">${escapeHtml(example.name)} reference diagram</text>`;
    svg += `<text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="12" fill="${palette.muted}">${escapeHtml(example.notation ?? "")}</text>`;
  }
  svg += `</svg>`;
  return svg;
}

function referencePosterSvg(example, options = {}) {
  const width = options.width ?? 100;
  const height = options.height ?? 60;
  const board = Boolean(options.board);
  const palette = figurePalette(example);
  const title = board ? example.name : (example.notation || example.name);
  const subtitle = board ? (example.notation || supportBadge(example)) : supportBadge(example);
  const fontSize = board ? 34 : 14;
  const subSize = board ? 15 : 7.5;
  return `<svg class="preset-thumb abstract-thumb" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
    <rect x="0" y="0" width="${width}" height="${height}" rx="${board ? 28 : 12}" fill="${palette.bg}" />
    <path d="M ${width * 0.08} ${height * 0.72} Q ${width * 0.28} ${height * 0.14}, ${width * 0.5} ${height * 0.48} T ${width * 0.92} ${height * 0.24}" fill="none" stroke="${palette.accentSoft}" stroke-width="${board ? 22 : 10}" stroke-linecap="round"/>
    <circle cx="${width * 0.18}" cy="${height * 0.26}" r="${board ? 22 : 9}" fill="${palette.accentSoft}" />
    <circle cx="${width * 0.8}" cy="${height * 0.72}" r="${board ? 15 : 6}" fill="${palette.accentSoft}" />
    <text x="${width / 2}" y="${height * (board ? 0.48 : 0.52)}" text-anchor="middle" font-size="${fontSize}" fill="${palette.ink}" font-weight="800">${escapeHtml(title)}</text>
    <text x="${width / 2}" y="${height * (board ? 0.72 : 0.78)}" text-anchor="middle" font-size="${subSize}" fill="${palette.muted}" font-weight="700">${escapeHtml(subtitle)}</text>
  </svg>`;
}

function referenceFigureSvg(example, options = {}) {
  if (example.abstractAnalysis?.gameTree) {
    return abstractTreeFigureSvg(example, options);
  }
  return referencePosterSvg(example, options);
}

// ── Render: Board ──

function renderBoard() {
  if (state.abstractExample) {
    refs.boardSvg.innerHTML = referenceFigureSvg(state.abstractExample, { width: BOARD_WIDTH, height: BOARD_HEIGHT, board: true });
    updateEdgeTooltip();
    return;
  }
  const recommended = recommendedEdgeId();
  const supportedEdges = new Set(state.analysis?.normalizedPosition.edges.map((e) => e.id) ?? []);
  const playActive = isPlayActive();
  const perspective = hoverPerspectiveSide();
  const parallelMeta = buildParallelEdgeMeta(state.position.edges);
  const illegalEdgeId = state.illegalMove?.edgeId ?? null;
  const svgParts = [];
  const hitLayerParts = [];

  svgParts.push(`<defs>
    <radialGradient id="node-fill" cx="35%" cy="28%" r="80%">
      <stop offset="0%" style="stop-color: var(--node-top)" />
      <stop offset="55%" style="stop-color: var(--node-mid)" />
      <stop offset="100%" style="stop-color: var(--node-bottom)" />
    </radialGradient>
    <radialGradient id="node-fill-selected" cx="35%" cy="28%" r="80%">
      <stop offset="0%" style="stop-color: var(--node-sel-top)" />
      <stop offset="55%" style="stop-color: var(--node-sel-mid)" />
      <stop offset="100%" style="stop-color: var(--node-sel-bottom)" />
    </radialGradient>
    <radialGradient id="node-fill-ground" cx="35%" cy="28%" r="85%">
      <stop offset="0%" style="stop-color: var(--node-gnd-top)" />
      <stop offset="55%" style="stop-color: var(--node-gnd-mid)" />
      <stop offset="100%" style="stop-color: var(--node-gnd-bottom)" />
    </radialGradient>
    <filter id="node-shadow" x="-60%" y="-60%" width="220%" height="220%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="var(--node-shadow-color)" flood-opacity="0.32" />
    </filter>
    <filter id="inf-glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="1.2" result="b" />
      <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    <!-- Spiral end-curls — used by the "Spiral" edge visual style. The
         Archimedean spiral starts at (0, 0) with a tangent along +x so it
         attaches smoothly to the path it terminates. context-stroke lets a
         single marker inherit the edge's color, so we don't need separate
         markers per color. orient="auto-start-reverse" flips the start
         marker so both ends curl OUTWARD (away from the edge body). -->
    ${(() => {
      const samples = 56;
      const turns = 1.7;
      const maxR = 7;
      let d = "M 0 0";
      for (let i = 1; i <= samples; i += 1) {
        const t = i / samples;
        const theta = t * turns * Math.PI * 2;
        const r = t * maxR;
        d += ` L ${(Math.cos(theta) * r).toFixed(2)} ${(Math.sin(theta) * r).toFixed(2)}`;
      }
      return `<marker id="edge-spiral-curl"
            viewBox="-10 -10 20 20"
            markerWidth="22" markerHeight="22"
            refX="0" refY="0"
            orient="auto-start-reverse">
        <path d="${d}" fill="none"
              stroke="context-stroke" stroke-width="1.6"
              stroke-linecap="round" stroke-linejoin="round" />
      </marker>`;
    })()}
    ${(() => {
      // Tighter / smaller spiral for the "subtle" variant — just a hint of a curl.
      const samples = 40;
      const turns = 1.2;
      const maxR = 4.5;
      let d = "M 0 0";
      for (let i = 1; i <= samples; i += 1) {
        const t = i / samples;
        const theta = t * turns * Math.PI * 2;
        const r = t * maxR;
        d += ` L ${(Math.cos(theta) * r).toFixed(2)} ${(Math.sin(theta) * r).toFixed(2)}`;
      }
      return `<marker id="edge-spiral-tight"
            viewBox="-7 -7 14 14"
            markerWidth="14" markerHeight="14"
            refX="0" refY="0"
            orient="auto-start-reverse">
        <path d="${d}" fill="none"
              stroke="context-stroke" stroke-width="1.4"
              stroke-linecap="round" stroke-linejoin="round" />
      </marker>`;
    })()}
  </defs>`);

  svgParts.push(`<g>
    <path class="ground-shadow" d="M 24 ${GROUND_Y} C 180 ${GROUND_Y - 20}, 360 ${GROUND_Y + 14}, 520 ${GROUND_Y} S 820 ${GROUND_Y - 18}, 956 ${GROUND_Y}" />
    <path class="ground-path" d="M 24 ${GROUND_Y} C 180 ${GROUND_Y - 20}, 360 ${GROUND_Y + 14}, 520 ${GROUND_Y} S 820 ${GROUND_Y - 18}, 956 ${GROUND_Y}" />
  </g>`);

  // Build edgeId → resulting value map for the move-value overlay. Same edge
  // may appear in both LEFT and RIGHT lists (green) or just one (partisan);
  // we keep both so the badge can show the more relevant one based on context.
  const moveValueMap = new Map();
  if (state.showMoveValues && state.analysis && !state.analysisPending) {
    for (const player of [PLAYERS.LEFT, PLAYERS.RIGHT]) {
      const moves = state.analysis.moves?.[player] ?? [];
      for (const m of moves) {
        if (!m.edgeId) continue;
        const entry = moveValueMap.get(m.edgeId) ?? {};
        entry[player] = m.resultingValue;
        moveValueMap.set(m.edgeId, entry);
      }
    }
  }

  for (const edge of state.position.edges) {
    const aNode = findNode(edge.a);
    const bNode = findNode(edge.b);
    if (!aNode || !bNode) continue;

    const geom = edgeGeometry(edge, aNode, bNode, parallelMeta.get(edge.id), state.position.nodes);
    const colorCls = edgeColorClass(edge.color);
    const isSel = state.selectedEdgeId === edge.id;
    const isHov = state.hoverEdgeId === edge.id;
    const isRec = recommended === edge.id;
    const isIllegal = illegalEdgeId === edge.id;
    const isSup = supportedEdges.size === 0 || supportedEdges.has(edge.id);
    const stableCls = edge.stable ? "edge-stable" : "";
    const hovCls = isRec ? "" : hoverGlowClass(edge, isSup);
    const playable = playActive ? edgeLooksPlayableFor(perspective, edge) : true;
    const dimCls = playActive && !playable && !isRec ? "edge-dimmed" : "";
    const emphCls = [
      isSel ? "edge-selected" : "",
      isHov ? "edge-hovered" : "",
      isRec ? (playActive ? "edge-recommended edge-pulse" : "edge-recommended") : "",
      isIllegal ? "edge-illegal" : "",
      dimCls,
    ].filter(Boolean).join(" ");
    // Unsupported edges (about to fall) still need to be readable — 0.18 was
    // practically invisible. 0.38 reads as clearly "lower priority" without
    // disappearing.
    const op = isSup ? 1 : 0.38;

    // Build the optional move-value badge SVG markup once per edge.
    let moveValueMarkup = "";
    if (state.showMoveValues && moveValueMap.has(edge.id)) {
      const entry = moveValueMap.get(edge.id);
      // Pick the most relevant resultingValue: prefer the side-to-move's
      // (or the player perspective in play mode), otherwise show whichever exists.
      const persp = playActive ? perspective : state.sideToMove;
      const rel = entry[persp] ?? entry[PLAYERS.LEFT] ?? entry[PLAYERS.RIGHT];
      if (rel) {
        const fullLabel = rel.label ?? "";
        const shortLabel = fullLabel.length > 10 ? `${fullLabel.slice(0, 9)}…` : fullLabel;
        // Color-code: relation to zero from the picked side's perspective
        // (gt = good for Blue, lt = good for Red, eq = balanced, fuzzy = unclear)
        let badgeCls = "move-value-badge";
        if (rel.relationToZero === "gt") badgeCls += " mv-blue-favors";
        else if (rel.relationToZero === "lt") badgeCls += " mv-red-favors";
        else if (rel.relationToZero === "eq") badgeCls += " mv-balanced";
        else badgeCls += " mv-fuzzy";
        // Position the badge at the markerPoint (top-end of curve)
        const bx = geom.markerPoint.x + 10;
        const by = geom.markerPoint.y + 4;
        moveValueMarkup = `<g class="${badgeCls}" pointer-events="none">
          <rect x="${bx}" y="${by - 9}" width="${Math.max(28, shortLabel.length * 6.4 + 8)}" height="16" rx="8" />
          <text x="${bx + 4}" y="${by + 3}">→ ${escapeHtml(shortLabel)}</text>
        </g>`;
      }
    }

    if (edge.infinite) {
      const pat = edge.pattern || "stalk";
      const colorVal = edge.color === EDGE_COLORS.LEFT ? "var(--blue)" : edge.color === EDGE_COLORS.RIGHT ? "var(--red)" : "var(--green)";
      const marker = pat === "grass" ? "🌿" : pat === "flower" ? "🌸" : pat === "tower" ? "∞²" : "∞";
      const baseWidth = pat === "grass" ? 5 : pat === "flower" ? 8 : pat === "tower" ? 9 : 7;
      const overlayWidth = pat === "grass" ? 1.8 : 2.4;
      const baseOpacity = pat === "grass" ? 0.68 : 0.8;
      const colorCls = edgeColorClass(edge.color);

      // "Vapor trail": extend the stroke ~30px past the visible top endpoint as
      // a fading dashed line, so users immediately see the edge continues.
      const tailLen = 36;
      const tailDx = bNode.x - aNode.x;
      const tailDy = bNode.y - aNode.y;
      const tailNorm = Math.hypot(tailDx, tailDy) || 1;
      const tx = bNode.x + (tailDx / tailNorm) * tailLen;
      const ty = bNode.y + (tailDy / tailNorm) * tailLen;
      // The trail starts where the curved edge ENDS (bNode) and goes outward.
      const trailPath = `M ${bNode.x} ${bNode.y} L ${tx} ${ty}`;

      svgParts.push(`<g style="opacity:${op}" data-edge-id="${escapeHtml(edge.id)}">
        ${isIllegal ? `<path class="edge-glow edge-illegal-glow" d="${geom.pathD}" />` : ""}
        ${isRec ? `<path class="edge-glow edge-suggestion-glow" d="${geom.pathD}" />` : ""}
        ${hovCls ? `<path class="edge-glow ${hovCls}" d="${geom.pathD}" />` : ""}
        <path d="${geom.pathD}" fill="none" stroke="${colorVal}" stroke-width="${baseWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${baseOpacity}" class="${colorCls} ${emphCls}" data-edge-id="${escapeHtml(edge.id)}" />
        <path class="inf-overlay inf-overlay-${pat} ${colorCls}" d="${geom.pathD}" fill="none" stroke="${colorVal}" stroke-width="${overlayWidth}" stroke-dasharray="${pat === "grass" ? "3 3" : "7 5"}" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" />
        <path class="inf-vapor-trail ${colorCls}" d="${trailPath}" fill="none" stroke="${colorVal}" stroke-width="${baseWidth - 1.5}" stroke-dasharray="2 4" stroke-linecap="round" />
        <text class="inf-marker" x="${geom.markerPoint.x}" y="${geom.markerPoint.y - 10}" fill="${colorVal}" filter="url(#inf-glow)">${marker}</text>
        <text class="edge-label" x="${geom.labelX}" y="${geom.labelY}">${escapeHtml(shortId(edge.id))}</text>
        ${moveValueMarkup}
      </g>`);
    } else {
      svgParts.push(`<g style="opacity:${op}" data-edge-id="${escapeHtml(edge.id)}">
        ${isIllegal ? `<path class="edge-glow edge-illegal-glow" d="${geom.pathD}" />` : ""}
        ${isRec ? `<path class="edge-glow edge-suggestion-glow" d="${geom.pathD}" />` : ""}
        ${hovCls ? `<path class="edge-glow ${hovCls}" d="${geom.pathD}" />` : ""}
        <path class="edge-main ${colorCls} ${stableCls} ${emphCls}" d="${geom.pathD}" data-edge-id="${escapeHtml(edge.id)}" />
        <text class="edge-label" x="${geom.labelX}" y="${geom.labelY}">${escapeHtml(shortId(edge.id))}</text>
        ${moveValueMarkup}
      </g>`);
    }

    hitLayerParts.push(`<path class="edge-hit" d="${geom.pathD}" data-edge-id="${escapeHtml(edge.id)}" />`);
  }

  if (state.dragConnect) {
    const sn = findNode(state.dragConnect.fromId);
    if (sn) {
      svgParts.push(`<line class="ghost-line" x1="${sn.x}" y1="${sn.y}" x2="${state.pointer.x}" y2="${state.pointer.y}" />`);
    }
  }

  // Flag non-ground nodes that have no incident edges — they're visible to the
  // user but invisible to the solver (pruned during normalizePosition), so
  // surface them visually as "floating / not yet connected".
  const incidentNodeIds = new Set();
  for (const edge of state.position.edges) {
    incidentNodeIds.add(edge.a);
    incidentNodeIds.add(edge.b);
  }

  for (const node of state.position.nodes) {
    const isSel = state.selectedNodeId === node.id;
    const isFloating = !node.ground && !incidentNodeIds.has(node.id);
    const r = node.ground ? 16 : isFloating ? 11 : 14;
    const bc = `node-body${isSel ? " is-selected" : ""}${node.ground ? " is-ground" : ""}${isFloating ? " is-floating" : ""}`;
    const lc = `node-label${node.ground ? " is-ground" : ""}${isFloating ? " is-floating" : ""}`;
    svgParts.push(`<g transform="translate(${node.x} ${node.y})">
      <circle class="${bc}" r="${r}" data-node-id="${escapeHtml(node.id)}" />
      <text class="${lc}" x="0" y="${node.ground ? 4 : 5}">${escapeHtml(shortId(node.id))}</text>
    </g>`);
  }

  svgParts.push(`<g class="edge-hit-layer">${hitLayerParts.join("")}</g>`);
  refs.boardSvg.innerHTML = svgParts.join("");
  updateEdgeTooltip();
}

// ── Render: Edge Tooltip ──

function hideEdgeTooltip() {
  if (refs.edgeTooltip) refs.edgeTooltip.classList.remove("is-visible");
  if (refs.tooltipConnector) refs.tooltipConnector.classList.remove("is-visible");
}

function updateEdgeTooltip() {
  if (!refs.edgeTooltip) return;
  if (state.abstractExample) { hideEdgeTooltip(); return; }
  if (!state.showEdgeInfo || !state.hoverEdgeId) { hideEdgeTooltip(); return; }
  const edge = state.position.edges.find((e) => e.id === state.hoverEdgeId);
  if (!edge) { hideEdgeTooltip(); return; }
  const aNode = findNode(edge.a);
  const bNode = findNode(edge.b);
  if (!aNode || !bNode) { hideEdgeTooltip(); return; }
  const geom = edgeGeometry(edge, aNode, bNode, buildParallelEdgeMeta(state.position.edges).get(edge.id), state.position.nodes);

  const perspectiveSide = hoverPerspectiveSide();
  const move = state.analysis ? moveFor(perspectiveSide, edge.id) : null;
  const playable = edgeLooksPlayableFor(perspectiveSide, edge);

  let content = `<strong>${edgeColorHtml(edge.color)} edge ${escapeHtml(shortId(edge.id))}</strong>`;
  if (edge.stable) content += ` <span class="move-chip">Stable</span>`;
  if (edge.infinite) {
    content += ` <span class="move-chip">∞ Infinite</span>`;
    if (playable) {
      content += `<div class="tooltip-detail inf-hint">Left-click: cut at random position (1–10)</div>`;
      content += `<div class="tooltip-detail inf-hint">${matchMedia("(hover: none)").matches ? "Long-press" : "Right-click"}: choose exact cut position</div>`;
    }
  } else if (move) {
    if (move.resultingValue) {
      content += `<div class="tooltip-detail">After: <code>${escapeHtml(move.resultingValue.label)}</code></div>`;
      content += `<div class="tooltip-detail">${move.winning ? "Winning" : "Losing"} move for ${turnLabelHtml(perspectiveSide)}</div>`;
    } else {
      content += `<div class="tooltip-detail">Heuristic-only move: exact resulting value is unavailable for this pattern.</div>`;
    }
  }
  if (!playable) {
    content += `<div class="tooltip-detail">Not playable by ${turnLabelHtml(perspectiveSide)}</div>`;
  }

  refs.edgeTooltip.innerHTML = content;

  // ── Smart positioning OUTSIDE the board frame ──
  // Compute the edge midpoint in viewport coordinates, then pick whichever side
  // of the board frame has more space (right > left > below > above) and place
  // the tooltip there. A dashed connector line draws from the edge midpoint
  // to the tooltip's anchor point on its inner side.
  const svgRect = refs.boardSvg.getBoundingClientRect();
  const vb = refs.boardSvg.viewBox.baseVal;
  const sx = svgRect.width / vb.width;
  const sy = svgRect.height / vb.height;
  const edgeX = svgRect.left + geom.centerPoint.x * sx;
  const edgeY = svgRect.top + geom.centerPoint.y * sy;

  const boardFrame = refs.boardFrame || refs.boardSvg.parentElement;
  const frameRect = boardFrame.getBoundingClientRect();

  // Make tooltip visible (display:block) BEFORE measuring height. The
  // .is-visible class is added at the very end to trigger the fade/fly-in.
  refs.edgeTooltip.style.visibility = "hidden";
  refs.edgeTooltip.classList.add("is-measuring");
  refs.edgeTooltip.style.left = "0px";
  refs.edgeTooltip.style.top = "0px";
  const tipW = refs.edgeTooltip.offsetWidth || 280;
  const tipH = refs.edgeTooltip.offsetHeight || 80;
  refs.edgeTooltip.classList.remove("is-measuring");
  refs.edgeTooltip.style.visibility = "";

  const margin = 18;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceRight = vw - frameRect.right;
  const spaceLeft = frameRect.left;
  const spaceBelow = vh - frameRect.bottom;
  const spaceAbove = frameRect.top;

  let tipX, tipY, side;
  let anchorX, anchorY; // where the dashed line touches the tooltip
  if (spaceRight >= tipW + margin) {
    side = "right";
    tipX = frameRect.right + margin;
    tipY = clamp(edgeY - tipH / 2, 12, vh - tipH - 12);
    anchorX = tipX;
    anchorY = tipY + tipH / 2;
  } else if (spaceLeft >= tipW + margin) {
    side = "left";
    tipX = frameRect.left - tipW - margin;
    tipY = clamp(edgeY - tipH / 2, 12, vh - tipH - 12);
    anchorX = tipX + tipW;
    anchorY = tipY + tipH / 2;
  } else if (spaceBelow >= tipH + margin) {
    side = "below";
    tipX = clamp(edgeX - tipW / 2, 12, vw - tipW - 12);
    tipY = frameRect.bottom + margin;
    anchorX = tipX + tipW / 2;
    anchorY = tipY;
  } else if (spaceAbove >= tipH + margin) {
    side = "above";
    tipX = clamp(edgeX - tipW / 2, 12, vw - tipW - 12);
    tipY = frameRect.top - tipH - margin;
    anchorX = tipX + tipW / 2;
    anchorY = tipY + tipH;
  } else {
    // Truly cramped — fall back to the old in-frame placement above the edge
    side = "inside";
    tipX = clamp(edgeX - tipW / 2, 12, vw - tipW - 12);
    tipY = clamp(edgeY - tipH - 30, 12, vh - tipH - 12);
    anchorX = tipX + tipW / 2;
    anchorY = tipY + tipH;
  }
  refs.edgeTooltip.style.position = "fixed";
  refs.edgeTooltip.style.left = `${tipX}px`;
  refs.edgeTooltip.style.top = `${tipY}px`;
  refs.edgeTooltip.dataset.side = side;
  refs.edgeTooltip.classList.add("is-visible");

  // Draw the dashed connector line in the viewport-overlay SVG. The line
  // grows toward the tooltip on entry — the path's stroke-dashoffset is
  // animated via CSS for a "fly in" feel.
  drawTooltipConnector(edgeX, edgeY, anchorX, anchorY);
}

function drawTooltipConnector(fromX, fromY, toX, toY) {
  const svg = refs.tooltipConnector;
  if (!svg) return;
  // Cover the viewport
  svg.setAttribute("viewBox", `0 0 ${window.innerWidth} ${window.innerHeight}`);
  svg.style.width = `${window.innerWidth}px`;
  svg.style.height = `${window.innerHeight}px`;
  // Slight curve — a quadratic with a midpoint pulled toward the average
  // y-axis of the two endpoints (so the line bows naturally).
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  // Bow direction perpendicular to the (from→to) vector, magnitude ~14% of
  // the segment length, capped.
  const dx = toX - fromX, dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  const bow = Math.min(len * 0.12, 28);
  const nx = -dy / len, ny = dx / len;
  const cx = midX + nx * bow;
  const cy = midY + ny * bow;
  svg.innerHTML = `
    <path class="tooltip-connector-line"
          d="M ${fromX} ${fromY} Q ${cx} ${cy} ${toX} ${toY}"
          fill="none" stroke-linecap="round" />
    <circle class="tooltip-connector-dot" cx="${fromX}" cy="${fromY}" r="4" />
    <polygon class="tooltip-connector-head"
             points="${toX},${toY} ${toX - 8},${toY - 5} ${toX - 8},${toY + 5}"
             transform="rotate(${(Math.atan2(toY - cy, toX - cx) * 180) / Math.PI}, ${toX}, ${toY})" />
  `;
  svg.classList.add("is-visible");
}

// ── Render: Play Banner ──

function renderPlayBanner() {
  if (!refs.playBanner) return;

  // Auto mode banner
  if (state.mode === "auto" && state.auto.active) {
    refs.playBanner.style.display = "flex";
    const dotClass = state.sideToMove === PLAYERS.LEFT ? "dot-blue" : "dot-red";
    const pauseText = state.auto.paused ? " (Paused)" : "";
    const lastMove = state.auto.lastMove
      ? `<span class="banner-last-move">
          <span class="banner-arrow ${state.auto.lastMove.player === PLAYERS.LEFT ? "banner-arrow-blue" : "banner-arrow-red"}">→</span>
          <span class="banner-last-move-text">${escapeHtml(turnLabel(state.auto.lastMove.player))}: ${escapeHtml(state.auto.lastMove.label)}</span>
          ${state.auto.lastMove.commentary ? `<span class="banner-commentary commentary-${state.auto.lastMove.commentary.kind}">${escapeHtml(state.auto.lastMove.commentary.text)}</span>` : ""}
        </span>`
      : "";
    refs.playBanner.className = "play-banner banner-opponent";
    refs.playBanner.innerHTML = `
      <span class="banner-turn-dot ${dotClass}"></span>
      <span class="banner-text">${turnLabelHtml(state.sideToMove)} to move${pauseText}</span>
      ${lastMove}
      <span class="banner-status">Game ${state.auto.gamesPlayed + 1}</span>`;
    return;
  }

  if (!isPlayActive()) { refs.playBanner.style.display = "none"; return; }
  refs.playBanner.style.display = "flex";

  if (state.play.winner) {
    const won = state.play.winner === state.play.userSide;
    refs.playBanner.className = `play-banner ${won ? "banner-win" : "banner-lose"}`;
    if (state.illegalMove) {
      refs.playBanner.innerHTML = `<span class="banner-icon">${won ? "\u2714" : "\u2718"}</span>
        <span class="banner-text">${colorize(escapeHtml(state.illegalMove.message))}</span>
        <span class="banner-status">${turnLabelHtml(state.play.winner)} wins.</span>`;
      return;
    }
    refs.playBanner.innerHTML = `<span class="banner-icon">${won ? "\u2714" : "\u2718"}</span>
      <span class="banner-text">${won ? "You won!" : "You lost."} ${turnLabelHtml(state.play.winner)} wins.</span>`;
    return;
  }

  if (isUserTurn()) {
    const rec = state.showSuggestions ? currentHumanRecommendation() : null;
    const winning = userIsWinning();
    refs.playBanner.className = `play-banner ${winning ? "banner-winning" : "banner-losing"}`;
    refs.playBanner.innerHTML = `
      <span class="banner-turn-dot ${state.play.userSide === PLAYERS.LEFT ? "dot-blue" : "dot-red"}"></span>
      <span class="banner-text">Your turn (${turnLabelHtml(state.play.userSide)})</span>
      ${rec ? `<span class="banner-best">Best: <strong>${escapeHtml(rec.label)}</strong></span>` : ""}
      ${state.showSuggestions ? `<span class="banner-status">${winning ? "Winning" : "Losing"}</span>` : ""}`;
  } else {
    refs.playBanner.className = "play-banner banner-opponent";
    refs.playBanner.innerHTML = `
      <span class="banner-turn-dot ${state.sideToMove === PLAYERS.LEFT ? "dot-blue" : "dot-red"}"></span>
      <span class="banner-text">Engine thinking (${turnLabelHtml(state.sideToMove)})</span>`;
  }
}

// ── Render: Move History ──

function renderMoveHistory() {
  if (!refs.moveHistory) return;
  if (!isPlayActive() || state.play.history.length === 0) {
    refs.moveHistory.innerHTML = "";
    return;
  }
  const replayIdx = state.play.replayIndex;
  const liveIdx = state.play.snapshots.length - 1;
  const displayedIdx = replayIdx === null ? liveIdx : replayIdx;
  const isScrub = replayIdx !== null;
  const atStart = displayedIdx <= 0;
  const atLive = !isScrub;

  // Move # i in the history list corresponds to snapshot[i+1] (post-move state).
  // Snapshot 0 is the starting position; entry highlight should match.
  const highlightedHistoryIdx = displayedIdx - 1;
  const userSide = state.play.userSide;

  refs.moveHistory.innerHTML = `
    <div class="history-header">
      <p class="group-label" style="margin:0">Move History</p>
      <div class="replay-controls">
        <button type="button" class="replay-btn" id="scrubStartBtn" ${atStart ? "disabled" : ""} title="Back to the first move" aria-label="Back to the first move">\u23ee</button>
        <button type="button" class="replay-btn" id="scrubPrevBtn" ${atStart ? "disabled" : ""} title="Step back one move">\u25c0 Back</button>
        <span class="replay-status">${isScrub
          ? `Replay ${displayedIdx} / ${liveIdx}`
          : `Live (move ${liveIdx})`}</span>
        <button type="button" class="replay-btn" id="scrubNextBtn" ${atLive ? "disabled" : ""} title="Step forward one move">Forward \u25b6</button>
        <button type="button" class="replay-btn replay-live" id="scrubLiveBtn" ${atLive ? "disabled" : ""} title="Jump to live state">Live \u23f5</button>
      </div>
    </div>
    <div class="history-list ${isScrub ? "is-scrubbing" : ""}">
      <div class="history-entry history-start ${displayedIdx === 0 ? "is-current" : ""}" data-snapshot="0">
        <span class="history-num">0.</span>
        <span class="history-move"><em>Starting position</em></span>
      </div>
      ${state.play.history.map((e, i) => {
        const ours = userSide != null && e.player === userSide;
        const sideClass = userSide == null ? "" : ours ? `is-ours ${e.player === PLAYERS.LEFT ? "accent-blue" : "accent-red"}` : "is-theirs";
        return `<div class="history-entry ${sideClass} ${highlightedHistoryIdx === i ? "is-current" : ""}" data-snapshot="${i + 1}">
        <div class="history-row-main">
          <span class="history-num">${i + 1}.</span>
          <span class="history-player ${e.player === PLAYERS.LEFT ? "dot-blue" : "dot-red"}"></span>
          <span class="history-move">${turnLabelHtml(e.player)}: ${escapeHtml(e.label)}</span>
          <code class="history-value">\u2192 ${escapeHtml(e.value)}</code>
          ${e.source === "engine" ? `<span class="meta-chip">Engine</span>` : ""}
        </div>
        ${e.commentary ? `<div class="history-commentary commentary-${e.commentary.kind}">${escapeHtml(e.commentary.text)}</div>` : ""}
      </div>`;
      }).join("")}
    </div>`;

  // Wire the scrubber buttons + entry click-to-scrub.
  const prev = refs.moveHistory.querySelector("#scrubPrevBtn");
  const next = refs.moveHistory.querySelector("#scrubNextBtn");
  const live = refs.moveHistory.querySelector("#scrubLiveBtn");
  if (prev) prev.addEventListener("click", scrubPrev);
  if (next) next.addEventListener("click", scrubNext);
  if (live) live.addEventListener("click", scrubLive);
  const start = refs.moveHistory.querySelector("#scrubStartBtn");
  if (start) start.addEventListener("click", () => scrubTo(0));
  refs.moveHistory.querySelectorAll("[data-snapshot]").forEach((el) => {
    el.addEventListener("click", () => {
      const idx = Number(el.dataset.snapshot);
      if (Number.isInteger(idx)) {
        if (idx === state.play.snapshots.length - 1) scrubLive();
        else scrubTo(idx);
      }
    });
  });
}

// ── Rigor: colour-code how much weight an answer can carry ──
// Green = proved by a theorem, teal = exactly solved and named, amber = exact
// but printed unsimplified, red = pattern-matched rather than derived. The
// point is that a heuristic answer must never look as confident as a solved one.
const RIGOR_LABELS = {
  proved: { text: "Proved", title: "Reduced by a proven theorem — this value is exact and fully simplified." },
  exact: { text: "Exact", title: "Solved exactly by the engine and shown in a recognised named form." },
  unreduced: { text: "Not simplified", title: "Exact, but printed as a raw game form: the simplifier hit its iteration guard and stopped early, returning an unreduced value rather than a wrong one. No shipped position reaches this." },
  heuristic: { text: "Heuristic", title: "Pattern-matched rather than derived. Treat this as indicative, not proven." },
};

function rigorBadge(rigor) {
  if (!rigor) return "";
  const meta = RIGOR_LABELS[rigor.level];
  if (!meta) return "";
  const why = rigor.reasons?.length ? `\n\n${rigor.reasons.join("\n")}` : "";
  return `<span class="rigor-badge rigor-${rigor.level}" title="${escapeHtml(meta.title + why)}">${escapeHtml(meta.text)}</span>`;
}

// The Fusion Principle reduction, shown as the chain of graph surgery that
// replaces an exponential search with a linear walk.
function renderFusionHTML(fused) {
  const groups = fused.fusedGroups.length
    ? `<div class="reason-chips">${fused.fusedGroups.map((g) =>
        `<span class="reason-chip">${escapeHtml(g.members.join(" + "))}${g.loops ? ` → ${g.loops} loop${g.loops === 1 ? "" : "s"}` : ""}</span>`).join("")}</div>`
    : "";
  const steps = fused.steps.map((step) => {
    const perVertex = step.perVertex
      ? `<div class="reason-chips">${step.perVertex.map((v) =>
          `<span class="reason-chip">${escapeHtml(v.vertex)}: ${v.loops ? `${v.loops} loop${v.loops === 1 ? "" : "s"}, ` : ""}${v.children} branch${v.children === 1 ? "" : "es"} → ${v.nim === 0 ? "0" : `*${v.nim === 1 ? "" : v.nim}`}</span>`).join("")}</div>`
      : "";
    return `<li class="reason-step">
      <span class="reason-index">${escapeHtml(step.title)}</span>
      <div class="reason-body">
        <p class="reason-detail">${escapeHtml(step.detail)}</p>
        ${step.key === "fuse" ? groups : ""}
        ${perVertex}
      </div>
    </li>`;
  }).join("");
  const branchXor = fused.rootBranches.reduce((acc, b) => acc ^ b.value, 0);
  const grid = fused.rootBranches.length
    ? `<p class="group-label nim-grid-label">Nim-sum of the branches</p>
       <p class="fusion-lede">Each branch meeting the ground is a bamboo stalk. Written in binary, the answer is read column by column: a column with an even number of filled cells cancels.</p>
       ${nimSumGridHTML(fused.rootBranches, branchXor)}`
    : "";
  return `<p class="group-label">Fusion Principle <span class="rigor-badge rigor-proved" title="An all-green position is impartial, so Sprague-Grundy guarantees the value is exactly this nimber.">Proved</span>
      <button type="button" class="replay-btn fusion-play-btn" id="fusionPlayBtn" title="Watch the cycles contract on the board">▶ Watch reduction</button></p>
    <p class="fusion-lede">This board is all green, so it is impartial and its value must be a single nimber. Rather than unfold the game tree, the Fusion Principle contracts every cycle and reads the answer straight off the graph.</p>
    <ol class="reason-steps">${steps}</ol>
    <p class="fusion-result">Value: <strong>${escapeHtml(fused.label)}</strong></p>
    ${grid}`;
}

// Cooling controls: a scrub slider plus a sweep that animates the freeze.
let coolAnimHandle = null;
function wireCoolingControls(thermograph, tMax) {
  const card = document.querySelector("#thermographCard");
  const slider = document.querySelector("#coolSlider");
  const play = document.querySelector("#coolPlayBtn");
  if (!card || !slider) return;
  const redraw = (t) => {
    state.coolT = t;
    card.innerHTML = renderThermographSvg(thermograph, { coolT: t });
  };
  slider.addEventListener("input", () => {
    if (coolAnimHandle) { cancelAnimationFrame(coolAnimHandle); coolAnimHandle = null; }
    redraw(Number(slider.value));
  });
  if (play) {
    play.addEventListener("click", () => {
      if (coolAnimHandle) cancelAnimationFrame(coolAnimHandle);
      const start = performance.now();
      const duration = 2600;
      const step = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const t = tMax * p;
        slider.value = String(t);
        redraw(t);
        coolAnimHandle = p < 1 ? requestAnimationFrame(step) : null;
      };
      coolAnimHandle = requestAnimationFrame(step);
    });
  }
}

// Runs the Fusion reduction as an overlay on the real board, with narration.
let cancelFusionPlay = null;
function playFusionOnBoard(position, fused) {
  if (cancelFusionPlay) cancelFusionPlay();
  const overlay = refs.animOverlay;
  if (!overlay) return;
  const vb = refs.boardSvg.viewBox.baseVal;
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgEl.setAttribute("viewBox", `0 0 ${vb.width} ${vb.height}`);
  Object.assign(svgEl.style, { width: "100%", height: "100%", position: "absolute", top: "0", left: "0", pointerEvents: "none" });
  // Hide the real board underneath so the reduction reads as one picture.
  refs.boardSvg.style.opacity = "0.12";
  overlay.appendChild(svgEl);

  const caption = document.createElement("div");
  caption.className = "fusion-caption";
  overlay.appendChild(caption);

  const finish = () => {
    refs.boardSvg.style.opacity = "";
    svgEl.remove();
    caption.remove();
    cancelFusionPlay = null;
  };
  const stop = playFusionReduction(svgEl, position, fused, {
    reduceMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    onPhase: (text) => { caption.textContent = text; },
  });
  const timer = window.setTimeout(finish, 6200);
  cancelFusionPlay = () => { stop(); window.clearTimeout(timer); finish(); };
}

// Misère play, for impartial boards only. The interesting part is where it
// disagrees with normal play, so that comparison is the headline.
function renderMisereHTML(position) {
  let result;
  try {
    result = misereAnalysis(position);
  } catch (err) {
    return `<p class="group-label">Misère play <span class="rigor-badge rigor-heuristic" title="${escapeHtml(err.message)}">Too big</span></p>
      <p class="fusion-lede">${escapeHtml(err.message)}</p>`;
  }
  if (!result) return "";
  const card = (title, label, winner, cls) => `<div class="misere-card ${cls}">
      <span class="misere-card-title">${escapeHtml(title)}</span>
      <strong class="misere-card-value">${escapeHtml(label)}</strong>
      <span class="misere-card-winner">${winner === "first" ? "first player wins" : "second player wins"}</span>
    </div>`;
  return `<p class="group-label">Misère play <span class="rigor-badge rigor-exact" title="Computed exactly by recursion over this position, and checked against the classical misère Nim theorem.">Exact</span></p>
    <p class="fusion-lede">Same board, one rule flipped: under misère play the player who makes the <strong>last</strong> move loses.</p>
    <div class="misere-grid">
      ${card("Normal play", result.normalLabel, result.normalWinner, "is-normal")}
      ${card("Misère play", result.misereLabel, result.misereWinner, "is-misere")}
    </div>
    <p class="misere-verdict ${result.differs ? "is-different" : "is-same"}">${result.differs
      ? "These disagree — the winner flips when you reverse the rule. That is exactly where misère play stops being a relabelling of normal play."
      : "These agree here. Misère only diverges once every remaining branch is short."}</p>
    <p class="misere-caveat">Misère Grundy values do <strong>not</strong> nim-add: unlike normal play, you cannot get a sum's value by XOR-ing its parts, which is why this is computed on the whole board and why general misère analysis needs quotient theory rather than a single number.</p>`;
}

// ── Render: Extra Analysis (chord views + stepped reasoning) ──

// Signature of what the extra panel is showing, so we only rebuild — and only
// replay the reveal animation — when the underlying analysis actually changes.
function extraAnalysisSignature() {
  const edges = state.position.edges.map((e) => `${e.a}-${e.b}:${e.color}`).sort().join(",");
  return `${state.chordMode}|${state.liveReasoning}|${state.analysis?.value?.label ?? "-"}|${edges}`;
}

function renderExtraAnalysis() {
  if (!refs.extraAnalysisPanel) return;
  if (refs.chordModeButtons) {
    refs.chordModeButtons.querySelectorAll("[data-chord]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.chord === state.chordMode);
    });
  }
  if (refs.reasoningToggle) {
    refs.reasoningToggle.textContent = state.liveReasoning ? "On" : "Off";
    refs.reasoningToggle.setAttribute("aria-pressed", state.liveReasoning ? "true" : "false");
    refs.reasoningToggle.classList.toggle("is-on", state.liveReasoning);
  }

  const signature = extraAnalysisSignature();
  if (signature === state.extraSignature) return;
  state.extraSignature = signature;

  if (refs.fusionView) {
    // The Fusion Principle showpiece: only meaningful for all-green boards.
    const normalized = normalizePosition(state.position);
    const impartial = isAllGreen(normalized);
    const fused = impartial ? fuseGreen(normalized) : null;
    refs.fusionView.innerHTML = fused
      ? renderFusionHTML(fused) + renderMisereHTML(normalized)
      : "";
    const playBtn = refs.fusionView.querySelector("#fusionPlayBtn");
    if (playBtn) playBtn.onclick = () => playFusionOnBoard(normalized, fused);
  }

  if (refs.chordView) {
    if (state.chordMode === "off") {
      refs.chordView.innerHTML = "";
    } else if (state.chordMode === "distribution") {
      refs.chordView.innerHTML = state.analysis
        ? `<p class="group-label">Where the moves lead</p>${buildDistributionChord(state.analysis)}`
        : `<p class="group-label">Where the moves lead</p><p class="library-hint">Waiting for analysis…</p>`;
    } else {
      refs.chordView.innerHTML = `<p class="group-label">Connections</p>${buildConnectionsChord(state.position)}`;
    }
  }

  if (refs.reasoningView) {
    if (!state.liveReasoning || !state.analysis) {
      refs.reasoningView.innerHTML = "";
    } else {
      refs.reasoningView.innerHTML = `<p class="group-label">How this becomes a value</p>${renderReasoningHTML(state.analysis, state.position)}`;
      // Stagger the reveal so the derivation reads as a walk rather than a wall.
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      refs.reasoningView.querySelectorAll(".reason-step").forEach((el, i) => {
        el.style.animationDelay = reduce ? "0s" : `${i * 0.42}s`;
        el.classList.add("is-revealing");
      });
    }
  }
}

// ── Render: Theory Panel ──

function renderComponentThumbnail(edgeIds, width = 140, height = 88) {
  const edgeIdSet = new Set(edgeIds);
  const edges = state.position.edges.filter((e) => edgeIdSet.has(e.id));
  if (edges.length === 0) return "";
  const nodeIds = new Set();
  for (const e of edges) { nodeIds.add(e.a); nodeIds.add(e.b); }
  const nodes = state.position.nodes.filter((n) => nodeIds.has(n.id));
  if (nodes.length === 0) return "";

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const pad = 24;
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(60, (Math.max(...xs) - Math.min(...xs)) + 2 * pad);
  const h = Math.max(40, (Math.max(...ys) - Math.min(...ys)) + 2 * pad);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const colorFor = (c) => c === EDGE_COLORS.LEFT ? "#2f6ad9" : c === EDGE_COLORS.RIGHT ? "#d93f4f" : "#2fa06a";

  const edgeSvg = edges.map((edge) => {
    const a = byId.get(edge.a);
    const b = byId.get(edge.b);
    if (!a || !b) return "";
    const stroke = colorFor(edge.color);
    if (edge.infinite) {
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="3.2" stroke-dasharray="5 4" stroke-linecap="round" opacity="0.85" />`;
    }
    const dashAttr = edge.stable ? ` stroke-dasharray="8 5"` : "";
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="4" stroke-linecap="round"${dashAttr} />`;
  }).join("");

  const nodeSvg = nodes.map((n) => {
    const fill = n.ground ? "#1c2f47" : "#fff4e0";
    const stroke = n.ground ? "rgba(255,255,255,0.55)" : "rgba(19,33,53,0.35)";
    const r = n.ground ? 6 : 5;
    return `<circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1.4" />`;
  }).join("");

  return `<svg class="component-thumb" viewBox="${minX} ${minY} ${w} ${h}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${edgeSvg}${nodeSvg}</svg>`;
}

function renderSignExpansion(signs) {
  if (!refs.signExpansionView) return;
  if (!signs || signs.length === 0) {
    refs.signExpansionView.innerHTML = "";
    return;
  }
  // Cap visible pills to keep the strip compact even for long expansions.
  const cap = 32;
  const visible = signs.length > cap ? signs.slice(0, cap) : signs;
  const overflow = signs.length > cap ? signs.length - cap : 0;
  const pills = [...visible].map((s) => {
    if (s === "+") return `<span class="sign-pill sign-plus" aria-label="plus">+</span>`;
    if (s === "-") return `<span class="sign-pill sign-minus" aria-label="minus">−</span>`;
    return "";
  }).join("");
  const overflowMarkup = overflow > 0
    ? `<span class="sign-pill sign-overflow" title="${overflow} more sign(s) truncated">+${overflow}</span>`
    : "";
  refs.signExpansionView.innerHTML = `
    <span class="sign-expansion-label">Sign expansion:</span>
    <span class="sign-expansion-pills">${pills}${overflowMarkup}</span>
    <span class="sign-expansion-meta" title="Length of Conway's L/R binary string">${signs.length} sign${signs.length !== 1 ? "s" : ""}</span>`;
}

function renderThermographSvg(thermograph, opts = {}) {
  if (!thermograph) return "";
  const { leftWall, rightWall, mean, temperature, valueRange } = thermograph;
  if (!leftWall || !rightWall) return "";

  const width = opts.width ?? 360;
  const height = opts.height ?? 240;
  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 36;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const isFrozen = temperature < 0;
  const tMax = isFrozen ? 2 : Math.max(temperature * 1.4, 0.6);
  const [vMin, vMax] = valueRange ?? [mean - 1, mean + 1];

  // Project (v, t) → SVG (x, y). Y flips so high temperature is up.
  const xOf = (v) => padL + ((v - vMin) / Math.max(1e-9, vMax - vMin)) * plotW;
  const yOf = (t) => padT + plotH - ((t / Math.max(1e-9, tMax)) * plotH);

  const polylineFor = (wall, color, dashed = false) => {
    const pts = wall
      .filter((p) => p.t <= tMax + 0.01 && Number.isFinite(p.v))
      .map((p) => `${xOf(p.v).toFixed(1)},${yOf(p.t).toFixed(1)}`)
      .join(" ");
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" ${dashed ? 'stroke-dasharray="6 4"' : ""} />`;
  };

  // Tick marks: 5 value ticks + a few temp ticks.
  const valueTicks = [];
  const tickCount = 5;
  for (let i = 0; i <= tickCount; i += 1) {
    const v = vMin + ((vMax - vMin) * i) / tickCount;
    const x = xOf(v);
    valueTicks.push(`<line x1="${x}" y1="${padT + plotH}" x2="${x}" y2="${padT + plotH + 4}" stroke="var(--page-muted)" stroke-width="1" />`);
    valueTicks.push(`<text x="${x}" y="${padT + plotH + 16}" text-anchor="middle" font-size="10" fill="var(--page-muted)" font-family="var(--mono-font)">${v.toFixed(2)}</text>`);
  }
  const tempTicks = [];
  const tempStep = isFrozen ? 0.5 : Math.max(0.25, tMax / 4);
  for (let t = 0; t <= tMax + 1e-9; t += tempStep) {
    const y = yOf(t);
    tempTicks.push(`<line x1="${padL - 4}" y1="${y}" x2="${padL}" y2="${y}" stroke="var(--page-muted)" stroke-width="1" />`);
    tempTicks.push(`<text x="${padL - 6}" y="${y + 3}" text-anchor="end" font-size="10" fill="var(--page-muted)" font-family="var(--mono-font)">${t.toFixed(2)}</text>`);
  }

  // Frame
  const frame = `
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="none" stroke="var(--panel-border)" stroke-width="1" />
    <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="var(--ink-soft-3)" stroke-width="1" />
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="var(--ink-soft-3)" stroke-width="1" />
  `;

  // Mean (vertical dashed line)
  const meanLine = Number.isFinite(mean) ? `<line x1="${xOf(mean)}" y1="${padT}" x2="${xOf(mean)}" y2="${padT + plotH}" stroke="var(--amber)" stroke-width="1" stroke-dasharray="4 4" opacity="0.8" />` : "";

  // Walls
  const leftPoly = polylineFor(leftWall, "var(--blue)");
  const rightPoly = polylineFor(rightWall, "var(--red)");

  // Mean dot at meeting point
  const meetDot = !isFrozen && Number.isFinite(temperature)
    ? `<circle cx="${xOf(mean)}" cy="${yOf(temperature)}" r="3.5" fill="var(--amber)" stroke="var(--page-ink)" stroke-width="0.8" />`
    : "";

  // Axis titles
  const axisTitles = `
    <text x="${padL + plotW / 2}" y="${height - 6}" text-anchor="middle" font-size="11" font-family="var(--body-font)" fill="var(--page-ink)" font-weight="600">Value</text>
    <text x="14" y="${padT + plotH / 2}" text-anchor="middle" font-size="11" font-family="var(--body-font)" fill="var(--page-ink)" font-weight="600" transform="rotate(-90 14 ${padT + plotH / 2})">Temperature</text>
  `;

  const coolOverlay = Number.isFinite(opts.coolT)
    ? coolOverlaySvg(thermograph, opts.coolT, { xOf, yOf, padL, plotW, padT, plotH })
    : "";

  // Status line / annotations
  const statusText = isFrozen
    ? `Cold number — both walls are the vertical line at ${mean.toFixed(3)}.`
    : temperature === 0
      ? `Mean ${mean.toFixed(3)}, temperature 0. Coincident walls alone do not identify a game as a number.`
      : `Mean ${mean.toFixed(3)}, temperature ${temperature.toFixed(3)} — walls converge to the mean as t rises.`;

  return `
    <svg class="thermograph-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Thermograph plot">
      ${frame}
      ${valueTicks.join("")}
      ${tempTicks.join("")}
      ${meanLine}
      ${leftPoly}
      ${rightPoly}
      ${meetDot}
      ${coolOverlay}
      ${axisTitles}
    </svg>
    <p class="thermograph-status">${escapeHtml(statusText)}</p>
  `;
}

// The cooling sweep: at temperature t the game is confused over the span
// between the two walls, so a scan line plus that span shows the confusion
// interval closing as the game cools — and freezing once it hits the mean.
function coolOverlaySvg(thermograph, t, proj) {
  const interval = coolingIntervalAt(thermograph, t);
  if (!interval) return "";
  const { xOf, yOf, padL, plotW, padT, plotH } = proj;
  const y = yOf(t);
  const x1 = xOf(interval.right);
  const x2 = xOf(interval.left);
  const band = interval.frozen
    ? `<circle cx="${xOf(interval.mean)}" cy="${y.toFixed(1)}" r="4" fill="var(--amber)" />`
    : `<rect x="${Math.min(x1, x2).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="${Math.abs(x2 - x1).toFixed(1)}" height="10" rx="4"
         fill="var(--amber)" fill-opacity="0.35" stroke="var(--amber)" stroke-width="1" />`;
  return `<g class="cool-overlay">
      <line x1="${padL}" y1="${y.toFixed(1)}" x2="${padL + plotW}" y2="${y.toFixed(1)}"
        stroke="var(--amber)" stroke-width="1.25" stroke-dasharray="3 3" opacity="0.85" />
      ${band}
      <text x="${padL + plotW - 4}" y="${Math.max(padT + 10, y - 9).toFixed(1)}" text-anchor="end"
        font-size="10" font-family="var(--mono-font)" fill="var(--amber)">t=${t.toFixed(2)}${interval.frozen ? " · frozen" : ` · width ${interval.width.toFixed(2)}`}</text>
    </g>`;
}

function renderGameTreeNode(node, depth) {
  if (!node) return "";
  const indent = depth * 16;
  if (node.truncated) {
    return `<div class="tree-node" style="margin-left:${indent}px"><code>${escapeHtml(node.label)}</code> <span class="meta-chip">\u2026</span></div>`;
  }
  if (node.isNumber || (node.left.length === 0 && node.right.length === 0)) {
    return `<div class="tree-node" style="margin-left:${indent}px"><code>${escapeHtml(node.label)}</code></div>`;
  }
  const lp = node.left.map((c) => renderGameTreeNode(c, depth + 1)).join("");
  const rp = node.right.map((c) => renderGameTreeNode(c, depth + 1)).join("");
  return `<div class="tree-node" style="margin-left:${indent}px"><code>${escapeHtml(node.label)}</code></div>
    ${lp || rp ? `<div class="tree-branches" style="margin-left:${indent + 8}px">
      ${lp ? `<div class="tree-side"><span class="tree-side-label">L:</span>${lp}</div>` : ""}
      ${rp ? `<div class="tree-side"><span class="tree-side-label">R:</span>${rp}</div>` : ""}
    </div>` : ""}`;
}

function renderTheoryPanel() {
  if (!refs.theoryPanel) return;
  if (!state.analysis) {
    refs.theoryContent.innerHTML = `<div class="empty-state">Analyze a position to see theory details.</div>`;
    refs.componentBreakdown.innerHTML = "";
    refs.constructionPath.innerHTML = "";
    refs.gameTreeView.innerHTML = "";
    refs.traceContent.innerHTML = "";
    return;
  }

  const { value, components, gameTree, trace } = state.analysis;
  refs.theoryContent.innerHTML = "";

  if (value.constructionPath && value.constructionPath.length > 0) {
    const stepCount = value.constructionPath.length;
    const stepWord = stepCount === 1 ? "step" : "steps";
    refs.constructionPath.innerHTML = `
      <div class="construction-meta">
        <p class="group-label" style="margin:0">Surreal Construction</p>
        <span class="construction-meta-count">${stepCount} ${stepWord}${stepCount > 8 ? " · scroll" : ""}</span>
      </div>
      <div class="construction-steps">${value.constructionPath.map((s) => `
        <div class="construction-step">
          <span class="step-day">Day ${s.day}</span>
          <code class="step-value">${escapeHtml(s.description)}</code>
        </div>`).join("")}</div>`;
  } else {
    refs.constructionPath.innerHTML = "";
  }

  refs.theoryContent.innerHTML = state.abstractExample
    ? `<p class="group-label">Reference Figure</p>
      <div class="reference-figure-panel">${referenceFigureSvg(state.abstractExample, { width: 520, height: 220 })}</div>
      <p class="group-label" style="margin-top:12px">Reference Note</p>
      <div class="warning-chip">${colorize(escapeHtml(state.abstractExample.note ?? "Pattern-modeled reference analysis."))}</div>`
    : "";

  if (components && components.length > 1) {
    refs.componentBreakdown.innerHTML = `<p class="group-label">Component Breakdown</p>
      <div class="component-list">${components.map((c) => `
        <div class="component-card">
          ${renderComponentThumbnail(c.edges.map((e) => e.id))}
          <div class="component-card-body">
            <strong>Component ${c.index + 1}</strong>
            <span class="move-chip">${escapeHtml(c.value.label)}</span>
            <span class="meta-chip">${c.edgeCount} edge${c.edgeCount !== 1 ? "s" : ""}</span>
          </div>
        </div>`).join("")}</div>`;
  } else {
    refs.componentBreakdown.innerHTML = "";
  }

  if (gameTree) {
    refs.gameTreeView.innerHTML = `<p class="group-label">Game Tree</p>
      <div class="game-tree">${renderGameTreeNode(gameTree, 0)}</div>`;
  } else {
    refs.gameTreeView.innerHTML = "";
  }

  if (refs.thermographView) {
    if (value && value.thermograph) {
      const tMaxSlider = value.thermograph.temperature > 0 ? value.thermograph.temperature * 1.15 : 1;
      refs.thermographView.innerHTML = `<p class="group-label">Thermograph</p>
        <div class="thermograph-card" id="thermographCard">${renderThermographSvg(value.thermograph, { coolT: state.coolT ?? 0 })}</div>
        <div class="cool-controls">
          <button type="button" class="replay-btn" id="coolPlayBtn" ${value.thermograph.temperature > 0 ? "" : "disabled"} title="Sweep the temperature upward and watch the game freeze">▶ Cool</button>
          <input type="range" class="inf-slider-range cool-slider" id="coolSlider" min="0" max="${tMaxSlider.toFixed(3)}" step="0.01" value="${(state.coolT ?? 0).toFixed(2)}" ${value.thermograph.temperature > 0 ? "" : "disabled"} aria-label="Cooling temperature">
        </div>
        <p class="cool-caption">${coolingCaptionHTML(value, { reference: Boolean(state.abstractExample) })}</p>`;
      wireCoolingControls(value.thermograph, tMaxSlider);
    } else {
      refs.thermographView.innerHTML = "";
    }
  }

  if (state.showVerbose && trace && trace.length > 0) {
    refs.traceContent.innerHTML = `<p class="group-label">Solver Trace</p>
      <div class="trace-log">${trace.map((l) => `<div class="trace-line">${escapeHtml(l)}</div>`).join("")}</div>`;
  } else {
    refs.traceContent.innerHTML = "";
  }
}

// ── Render: Heat Meter ──

// ── Game rating ────────────────────────────────────────────────────────
// Categorize a position by complexity, expected length, and concepts present.
// Used in the analysis panel + auto-mode summary so the player has quick
// context on what they're looking at.

// Combine several base presets into a richer composite. Used by the Hard
// Puzzle generator to produce longer, harder-to-read positions than what
// the single-base mutation in generateAutoPosition can produce.
// Pick a move for the engine respecting the configured strength. With
// probability `optimalP` returns the analyzer's recommendation; otherwise
// returns a random legal move. "Random" strength always picks randomly.
function pickEngineMove(player) {
  if (!state.analysis) return null;
  const moves = state.analysis.moves[player] ?? [];
  if (moves.length === 0) return null;
  const recommended = state.analysis.recommendations[player];
  const strength = state.aiStrength || "optimal";
  const optimalP = strength === "optimal" ? 1
    : strength === "strong" ? 0.9
    : strength === "casual" ? 0.6
    : 0; // "random"
  if (recommended && Math.random() < optimalP) return recommended;
  // Otherwise pick uniformly from legal moves
  return moves[Math.floor(Math.random() * moves.length)];
}

function generateCompositePuzzle(componentCount = 3) {
  const candidates = loadableExamples.filter((ex) =>
    !ex.unsupported &&
    ex.position &&
    (ex.position.edges?.length ?? 0) >= 1 &&
    (ex.position.edges?.length ?? 0) <= 5,  // pick small bases so the sum doesn't explode
  );
  if (candidates.length === 0) return generateAutoPosition();
  const parts = [];
  let xOffset = 0;
  for (let i = 0; i < componentCount; i += 1) {
    const base = candidates[Math.floor(Math.random() * candidates.length)];
    // Clone and shift the base horizontally so components don't collide.
    const clone = clonePosition(base.position);
    const shift = xOffset;
    for (const node of clone.nodes) {
      node.x = (node.x ?? 0) + shift;
      node.id = `cp${i}-${node.id}`;
    }
    for (const edge of clone.edges) {
      edge.id = `cp${i}-${edge.id}`;
      edge.a = `cp${i}-${edge.a}`;
      edge.b = `cp${i}-${edge.b}`;
    }
    parts.push(clone);
    xOffset += 220;
  }
  return {
    nodes: parts.flatMap((p) => p.nodes),
    edges: parts.flatMap((p) => p.edges),
  };
}

// Hard puzzle: aim for value close to 0 (uncertain outcome) OR a hot/fuzzy
// game form, with at least 6 edges. Re-rolls combinations until satisfied.
function generateChallengingPuzzle(maxAttempts = 16) {
  for (let i = 0; i < maxAttempts; i += 1) {
    // Mix component-count: sometimes 2, sometimes 3-4 for longer games
    const componentCount = 2 + Math.floor(Math.random() * 3);
    const candidate = generateCompositePuzzle(componentCount);
    if (!candidate || candidate.edges.length < 6) continue;
    if (candidate.edges.length > 18) continue;
    try {
      const analysis = analyzePosition(candidate, undefined, { verbose: false });
      const v = analysis.value;
      // A position is "hard" if outcome is fuzzy (first-player wins) OR value
      // is non-integer OR has switch/loopy/infinitesimal kind. Pure integers
      // like 3 vs -2 are too easy to read.
      const numericValue = v.kind === "number" && v.numericValue
        ? Math.abs(v.numericValue.toNumber ? v.numericValue.toNumber() : 0)
        : null;
      const isBalanced = numericValue !== null && numericValue < 2;
      const isFuzzy = v.relationToZero === "fuzzy";
      const isHot = v.kind === "switch" || v.kind === "infinitesimal" || v.kind === "loopy";
      const isLong = candidate.edges.length >= 8;
      if (isFuzzy || isHot || (isBalanced && isLong)) return candidate;
    } catch {
      continue;
    }
  }
  // Fallback: just produce something challenging-looking
  return generateCompositePuzzle(3);
}

// Roll a position via generateAutoPosition repeatedly until it scores at
// least 2★ complexity AND has at least 4 edges, OR until we hit the retry
// cap. Used by the "New Puzzle" / "Random" buttons. The Solver runs in
// memory-only mode (no UI mutation) so re-rolls are cheap.
function generateInterestingPuzzle(maxAttempts = 14) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = generateAutoPosition();
    if (!candidate || !candidate.edges || candidate.edges.length < 4) continue;
    try {
      const analysis = analyzePosition(candidate, undefined, { verbose: false });
      const rating = rateGame(analysis.normalizedPosition, analysis.value, analysis.stats);
      // "Interesting" = at least 2★ complexity OR has multiple components OR
      // is non-integer (1/2, *2, switch, etc).
      const isInteresting =
        (rating?.complexity ?? 1) >= 2 ||
        (analysis.stats?.independentComponents ?? 1) > 1 ||
        analysis.value.kind !== "number" ||
        (analysis.value.number && analysis.value.number.includes("/"));
      if (isInteresting) return candidate;
    } catch {
      continue;
    }
  }
  // Fallback: just return whatever generateAutoPosition produces last
  return generateAutoPosition();
}

function rateGame(position, value, stats) {
  if (!value) return null;
  const edges = position?.edges ?? [];
  const concepts = [];

  // Complexity score (1–5)
  let complexity = 1;
  if (value.kind === "number") complexity = 1;
  else if (value.kind === "nimber") complexity = 2;
  else if (value.kind === "switch") complexity = 2;
  else if (value.kind === "infinitesimal") complexity = 3;
  else if (value.kind === "loopy") complexity = 4;
  else if (value.kind === "infinite") complexity = 4;
  else if (value.kind === "game") {
    const lblLen = (value.label || "").length;
    if (lblLen > 200) complexity = 5;
    else if (lblLen > 60) complexity = 4;
    else complexity = 3;
  }
  // Bump if many components / many edges
  if (stats?.independentComponents > 3) complexity = Math.min(5, complexity + 1);
  if (edges.length > 12) complexity = Math.min(5, complexity + 1);

  // Length estimate: total edges (every edge eventually gets cut, plus chain
  // expansions for infinite edges).
  let length = edges.length;
  if (edges.some((e) => e.infinite)) length += 4; // infinite cuts add chain edges
  if (edges.some((e) => e.loop)) length = Math.max(length, 1);

  // Concept tags
  if (value.kind === "number") concepts.push("Surreal");
  if (value.kind === "switch") concepts.push("Switch");
  if (value.kind === "nimber") concepts.push("Nimber");
  if (value.kind === "infinitesimal") concepts.push("Infinitesimal");
  if (value.kind === "infinite") concepts.push("Transfinite");
  if (value.kind === "loopy") concepts.push("Loopy");

  if (edges.some((e) => e.color === EDGE_COLORS.NEUTRAL)) concepts.push("Green");
  if (edges.some((e) => e.color === EDGE_COLORS.LEFT) && edges.some((e) => e.color === EDGE_COLORS.RIGHT)) {
    concepts.push("Partisan mix");
  }
  if (edges.some((e) => e.stable)) concepts.push("Stable anchor");
  if (edges.some((e) => e.infinite)) concepts.push("Infinite edge");
  if (edges.some((e) => e.loop)) concepts.push("Loop edge");
  if (stats?.independentComponents > 1) concepts.push(`${stats.independentComponents}-component sum`);

  // Heuristic: detect mirror via edge-count parity + value=0
  if (value.kind === "number" && value.number === "0" && stats?.independentComponents === 2) {
    concepts.push("Possible mirror");
  }

  return {
    complexity,
    length,
    concepts: [...new Set(concepts)],
  };
}

function renderRatingChips(rating) {
  if (!rating) return "";
  const stars = "★".repeat(rating.complexity) + "☆".repeat(5 - rating.complexity);
  const conceptChips = rating.concepts.slice(0, 6).map((c) => `<span class="rating-concept">${escapeHtml(c)}</span>`).join("");
  return `
    <div class="rating-row">
      <span class="rating-chip" title="Complexity rating">
        <span class="rating-label">Complexity</span>
        <span class="rating-stars">${stars}</span>
      </span>
      <span class="rating-chip" title="Estimated total moves to play out">
        <span class="rating-label">Length</span>
        <span class="rating-value">~${rating.length} ${rating.length === 1 ? "move" : "moves"}</span>
      </span>
      ${conceptChips ? `<span class="rating-concepts">${conceptChips}</span>` : ""}
    </div>`;
}

function renderAutoHeatViz() {
  if (!refs.autoHeatViz) return;
  if (state.mode !== "auto" || !state.analysis) {
    clearAutoHeatDisplay(refs.autoHeatViz);
    return;
  }
  const value = state.analysis.value;
  if (!value) { clearAutoHeatDisplay(refs.autoHeatViz); return; }

  // Tiny inline thermograph — render only when the game has nontrivial walls.
  // For cold numbers the thermograph is just a vertical line (boring); skip
  // it to save space. For switches and beyond, show the SVG.
  let thermoMarkup = "";
  const t = value.thermograph;
  if (t && t.temperature > 0) {
    thermoMarkup = renderThermographSvg(t, { width: 240, height: 130 });
  } else if (t && t.temperature === 0 && value.kind !== "number") {
    // Temp=0 switch: still show a compact horizontal bar at the mean
    thermoMarkup = `<div class="auto-thermo-flat">Flat at <code>${escapeHtml(String(t.mean))}</code> (no thermal width)</div>`;
  }

  // Compact rating chips for the auto-mode summary
  const rating = rateGame(state.analysis.normalizedPosition, value, state.analysis.stats);
  const ratingMarkup = rating ? renderRatingChips(rating) : "";

  updateAutoHeatDisplay(refs.autoHeatViz, value, thermoMarkup + ratingMarkup);
}

function renderHeatMeter() {
  if (!refs.heatMeter || !refs.heatBar || !refs.heatLabel) return;
  if (!state.analysis) {
    refs.heatBar.style.width = "0%";
    refs.heatBar.className = "heat-bar heat-cold";
    refs.heatLabel.textContent = "-";
    return;
  }
  const { value } = state.analysis;
  let temp = 0;
  let label = "0 (cold)";
  let cls = "heat-cold";

  if (value.kind === "number") {
    temp = 0;
    label = "0 (cold)";
    cls = "heat-cold";
  } else if (value.kind === "loopy") {
    temp = 0.55;
    label = "loop";
    cls = "heat-warm";
  } else if (value.kind === "switch" && value.temperature) {
    const tNum = numericTemperature(value);
    temp = tNum === null ? 0.3 : Math.max(0, Math.min(tNum / 4, 1));
    label = tNum === null ? "? (unresolved temperature)" : `${value.temperature}`;
    cls = tNum > 1 ? "heat-hot" : tNum > 0 ? "heat-warm" : "heat-cold";
  } else if (value.kind === "nimber") {
    temp = 0.15;
    label = "* (fuzzy)";
    cls = "heat-fuzzy";
  } else if (value.kind === "infinitesimal") {
    temp = 0.05;
    label = "\u2248 0 (infinitesimal)";
    cls = "heat-cold";
  } else if (value.kind === "infinite") {
    temp = 1;
    label = "\u221e";
    cls = "heat-infinite";
  } else {
    temp = 0.3;
    label = "? (general game)";
    cls = "heat-warm";
  }

  refs.heatBar.style.width = `${Math.max(temp * 100, 3)}%`;
  refs.heatBar.className = `heat-bar ${cls}`;
  refs.heatLabel.textContent = label;
}

// ── Render: Suggestions (play mode) ──

function renderSuggestionPanel() {
  if (!refs.suggestionPanel) return;
  if (state.mode !== "play" || !state.showSuggestions || !state.analysis) {
    refs.suggestionPanel.style.display = "none";
    if (refs.playMovesPanel) refs.playMovesPanel.style.display = "none";
    return;
  }

  refs.suggestionPanel.style.display = "block";
  const rec = currentHumanRecommendation();
  const winning = userIsWinning();
  const winText = winning === null ? "" : winning ? `<span class="color-green">You are winning</span> with best play.` : `<span class="color-red">You are losing</span> with best play.`;

  if (rec) {
    refs.suggestionMain.innerHTML = `Best move: <strong>${escapeHtml(rec.label)}</strong> \u2192 ${escapeHtml(rec.resultingValue.label)}. ${winText}`;
  } else {
    refs.suggestionMain.innerHTML = `No move available. ${winText}`;
  }

  refs.playSuggestedButton.disabled = isPlayActive() ? !isUserTurn() : false;

  if (state.showMoveDetails && refs.playMovesPanel) {
    refs.playMovesPanel.style.display = "block";
    renderMoveList(refs.playLeftMoves, PLAYERS.LEFT);
    renderMoveList(refs.playRightMoves, PLAYERS.RIGHT);
    refs.playLeftRecommendation.innerHTML = recommendationMarkup(PLAYERS.LEFT, state.analysis.recommendations.left);
    refs.playRightRecommendation.innerHTML = recommendationMarkup(PLAYERS.RIGHT, state.analysis.recommendations.right);
  } else if (refs.playMovesPanel) {
    refs.playMovesPanel.style.display = "none";
  }
}

// ── Render: Shared markup ──

function metaChip(label, value) {
  return `<span class="meta-chip"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</span>`;
}

function warningChip(text) {
  return `<div class="warning-chip">${colorize(escapeHtml(text))}</div>`;
}

function moveButtonState(player) {
  if (!isPlayActive()) return "";
  if (state.play.winner) return " disabled";
  return player === state.play.userSide && isUserTurn() ? "" : " disabled";
}

function recommendationMarkup(player, move) {
  const title = `${turnLabelHtml(player)} best move`;
  if (!move) {
    if (state.abstractExample) {
      return `<div class="recommendation-header"><strong>${title}</strong></div>
      <p class="recommendation-copy">No concrete board move list: this is a named reference analysis.</p>`;
    }
    if (state.analysis?.moveAnalysisUnavailable) {
      return `<div class="recommendation-header"><strong>${title}</strong></div>
      <p class="recommendation-copy">Heuristic value only. Exact move scoring is unavailable for this pattern.</p>`;
    }
    return `<div class="recommendation-header"><strong>${title}</strong></div>
      <p class="recommendation-copy">No legal move remains.</p>`;
  }
  const emphasis = move.winning ? "Winning under perfect play." : "No forced win from this side.";
  return `<div data-hover-edge="${escapeHtml(move.edgeId)}">
    <div class="recommendation-header">
      <strong>${title}</strong>
      <span class="relation-chip">${escapeHtml(relationLabel(move.resultingValue.relationToZero))}</span>
    </div>
    <p class="recommendation-copy">${escapeHtml(move.label)} \u2192 ${escapeHtml(move.resultingValue.label)}</p>
    <p class="recommendation-copy">${escapeHtml(emphasis)}</p>
    <button type="button" class="move-play-button" data-play-player="${escapeHtml(player)}" data-play-edge="${escapeHtml(move.edgeId)}" ${moveButtonState(player)}>Play This Move</button>
  </div>`;
}

function moveMarkup(move, featured) {
  const fc = featured ? " is-featured" : "";
  if (move.heuristicOnly || !move.resultingValue) {
    return `<article class="move-card${fc}" data-hover-edge="${escapeHtml(move.edgeId)}">
      <div class="move-header">
        <strong>${escapeHtml(move.label)}</strong>
        <span class="move-chip">${edgeColorHtml(move.edgeColor)}</span>
      </div>
      <div class="chip-row">
        <span class="move-chip">Heuristic only</span>
        <span class="move-chip">Unscored</span>
      </div>
      <button type="button" class="move-play-button" data-play-player="${escapeHtml(move.player)}" data-play-edge="${escapeHtml(move.edgeId)}" ${moveButtonState(move.player)}>Play</button>
    </article>`;
  }
  const winText = move.winning ? "Winning" : "Losing";
  return `<article class="move-card${fc}" data-hover-edge="${escapeHtml(move.edgeId)}">
    <div class="move-header">
      <strong>${escapeHtml(move.label)}</strong>
      <span class="move-chip">${edgeColorHtml(move.edgeColor)}</span>
    </div>
    <div class="chip-row">
      <span class="relation-chip">${escapeHtml(relationLabel(move.resultingValue.relationToZero))}</span>
      <span class="move-chip">${escapeHtml(winText)}</span>
      <span class="move-chip">${escapeHtml(move.resultingValue.label)}</span>
    </div>
    <button type="button" class="move-play-button" data-play-player="${escapeHtml(move.player)}" data-play-edge="${escapeHtml(move.edgeId)}" ${moveButtonState(move.player)}>Play</button>
  </article>`;
}

function renderMoveList(container, player) {
  if (!container || !state.analysis) {
    if (container) container.innerHTML = `<div class="empty-state">No analysis.</div>`;
    return;
  }
  const moves = [...(state.analysis.moves[player] ?? [])];
  if (moves.length === 0) {
    if (state.abstractExample) {
      container.innerHTML = `<div class="empty-state">No concrete move list: this card is a named reference, not a playable board.</div>`;
      return;
    }
    if (state.analysis.moveAnalysisUnavailable) {
      container.innerHTML = `<div class="empty-state">Move scoring is unavailable for this mixed infinite pattern.</div>`;
      return;
    }
    container.innerHTML = `<div class="empty-state">No legal moves for ${turnLabel(player)}.</div>`;
    return;
  }
  const rec = state.analysis.recommendations[player];
  moves.sort((a, b) => {
    if (rec && a.edgeId === rec.edgeId) return -1;
    if (rec && b.edgeId === rec.edgeId) return 1;
    return a.label.localeCompare(b.label);
  });
  container.innerHTML = moves.map((m) => moveMarkup(m, rec?.edgeId === m.edgeId)).join("");
}

// ── Render: Analysis ──

function renderAnalysis() {
  refs.boardHint.textContent = toolHint();
  refs.turnSummary.innerHTML = turnLabelHtml(state.sideToMove);

  if (state.mode === "auto" && state.auto.active) {
    refs.analysisStatus.textContent = state.auto.paused ? "Paused" : "Auto";
  } else if (isPlayActive() && state.play.winner) {
    refs.analysisStatus.textContent = "Finished";
  } else if (state.analysisPending) {
    refs.analysisStatus.textContent = "Analyzing";
  } else if (state.abstractExample) {
    refs.analysisStatus.textContent = "Reference";
  } else if (isPlayActive() && isUserTurn()) {
    refs.analysisStatus.textContent = "Your turn";
  } else if (isPlayActive()) {
    refs.analysisStatus.textContent = "Engine turn";
  } else if (state.analysisError) {
    refs.analysisStatus.textContent = "Blocked";
  } else {
    refs.analysisStatus.textContent = "Ready";
  }

  if (state.analysisError) {
    const msg = state.analysisError instanceof AnalysisLimitError
      ? state.analysisError.message : `Analysis failed: ${state.analysisError.message}`;
    refs.heroValue.textContent = "-";
    refs.heroKind.textContent = "Unavailable";
    refs.heroOutcomeLabel.textContent = isPlayActive() ? "Your Status" : "Outcome";
    refs.heroOutcome.textContent = "-";
    refs.analysisValue.textContent = "Blocked";
    refs.analysisSubtitle.textContent = "Position exceeded search budget.";
    refs.analysisExplanation.textContent = msg;
    refs.analysisMeta.innerHTML = "";
    refs.exactForm.textContent = "-";
    refs.exactNumber.textContent = "-";
    refs.exactMean.textContent = "-";
    refs.exactTemperature.textContent = "-";
    refs.strategicOutcome.textContent = "-";
    refs.currentTurnOutcome.textContent = "-";
    refs.warningList.innerHTML = warningChip(msg);
    refs.leftRecommendation.innerHTML = recommendationMarkup(PLAYERS.LEFT, null);
    refs.rightRecommendation.innerHTML = recommendationMarkup(PLAYERS.RIGHT, null);
    refs.leftMoves.innerHTML = `<div class="empty-state">Try a smaller position.</div>`;
    refs.rightMoves.innerHTML = `<div class="empty-state">Try a smaller position.</div>`;
    return;
  }

  if (state.bossSolve && state.bossSolve.active) {
    // Boss position is being solved on the worker thread: show live progress
    // (states + elapsed) and a Cancel button. The page stays fully responsive.
    refs.analysisStatus.textContent = "Solving";
    refs.heroValue.textContent = "…";
    refs.heroKind.textContent = "Boss position";
    refs.heroOutcomeLabel.textContent = isPlayActive() ? "Your Status" : "Outcome";
    refs.heroOutcome.textContent = "solving…";
    refs.analysisValue.innerHTML = `<span id="bossProgress" class="boss-progress">0 states · 0.0s elapsed</span><button type="button" id="cancelBossBtn" class="cancel-boss-btn">Cancel</button>`;
    refs.analysisSubtitle.textContent = "Solving on a background thread — the page stays responsive.";
    refs.analysisExplanation.textContent = "The engine is searching this position off the main thread. Cancel any time; the board is untouched.";
    refs.analysisMeta.innerHTML = metaChip("Edges", String(state.position.edges.length));
    refs.exactForm.textContent = "—";
    refs.exactNumber.textContent = "—";
    refs.exactMean.textContent = "—";
    refs.exactTemperature.textContent = "—";
    refs.strategicOutcome.textContent = "Solving…";
    refs.currentTurnOutcome.textContent = "—";
    refs.warningList.innerHTML = `<div class="warning-chip">Working… you can cancel without losing the board.</div>`;
    refs.leftRecommendation.innerHTML = recommendationMarkup(PLAYERS.LEFT, null);
    refs.rightRecommendation.innerHTML = recommendationMarkup(PLAYERS.RIGHT, null);
    refs.leftMoves.innerHTML = `<div class="empty-state">Solving…</div>`;
    refs.rightMoves.innerHTML = `<div class="empty-state">Solving…</div>`;
    const cancelBtn = document.querySelector("#cancelBossBtn");
    if (cancelBtn) cancelBtn.onclick = () => cancelBossSolve();
    updateBossProgressUI();
    return;
  }

  if (state.analysisGated && !state.analysis && !state.analysisPending) {
    // Heavy "boss" position loaded but not yet solved: offer an explicit Solve
    // button rather than auto-running the multi-second synchronous search.
    refs.analysisStatus.textContent = "Heavy";
    refs.heroValue.textContent = "—";
    refs.heroKind.textContent = "Boss position";
    refs.heroOutcomeLabel.textContent = isPlayActive() ? "Your Status" : "Outcome";
    refs.heroOutcome.textContent = "?";
    refs.analysisValue.innerHTML = `<button type="button" id="solveBossBtn" class="solve-boss-btn">Solve position <span aria-hidden="true">⚙</span></button>`;
    refs.analysisSubtitle.textContent = "Boss tier — solving may take a second or two.";
    refs.analysisExplanation.textContent = "This mesh is heavy enough to briefly freeze the page while the engine searches it. Press Solve when you're ready.";
    refs.analysisMeta.innerHTML = metaChip("Edges", String(state.position.edges.length));
    refs.exactForm.textContent = "—";
    refs.exactNumber.textContent = "—";
    refs.exactMean.textContent = "—";
    refs.exactTemperature.textContent = "—";
    refs.strategicOutcome.textContent = "Not solved yet";
    refs.currentTurnOutcome.textContent = "—";
    refs.warningList.innerHTML = `<div class="warning-chip">Press Solve to analyze this boss position.</div>`;
    refs.leftRecommendation.innerHTML = recommendationMarkup(PLAYERS.LEFT, null);
    refs.rightRecommendation.innerHTML = recommendationMarkup(PLAYERS.RIGHT, null);
    refs.leftMoves.innerHTML = `<div class="empty-state">Solve to see Blue's moves.</div>`;
    refs.rightMoves.innerHTML = `<div class="empty-state">Solve to see Red's moves.</div>`;
    const solveBtn = document.querySelector("#solveBossBtn");
    if (solveBtn) solveBtn.onclick = () => solveBossViaWorker();
    return;
  }

  if (!state.analysis) {
    refs.heroValue.textContent = state.abstractExample ? (state.abstractExample.notation ?? state.abstractExample.name) : "-";
    refs.heroKind.textContent = state.abstractExample ? "Reference" : "-";
    refs.heroOutcomeLabel.textContent = isPlayActive() ? "Your Status" : "Outcome";
    refs.heroOutcome.textContent = state.analysisPending ? "Loading" : "-";
    refs.analysisValue.textContent = state.abstractExample ? `Loading ${state.abstractExample.name}...` : "No analysis";
    refs.analysisSubtitle.textContent = state.abstractExample ? "Preparing named reference explanation" : "Draw or load a position to analyze it.";
    refs.analysisExplanation.textContent = state.abstractExample
      ? (state.abstractExample.note ?? "Pattern-modeled reference analysis.")
      : "The engine will summarize the current position here.";
    refs.analysisMeta.innerHTML = state.abstractExample ? metaChip("Support", supportBadge(state.abstractExample)) : "";
    refs.exactForm.textContent = state.abstractExample?.notation ?? "-";
    refs.exactNumber.textContent = "-";
    refs.exactMean.textContent = "-";
    refs.exactTemperature.textContent = "-";
    refs.strategicOutcome.textContent = state.analysisPending ? "Analyzing..." : "-";
    refs.currentTurnOutcome.textContent = state.abstractExample ? "Reference mode" : "-";
    refs.warningList.innerHTML = state.abstractExample
      ? warningChip(state.abstractExample.note ?? "Pattern-modeled reference analysis.")
      : `<div class="warning-chip">Awaiting analysis.</div>`;
    refs.leftRecommendation.innerHTML = recommendationMarkup(PLAYERS.LEFT, null);
    refs.rightRecommendation.innerHTML = recommendationMarkup(PLAYERS.RIGHT, null);
    refs.leftMoves.innerHTML = `<div class="empty-state">${state.abstractExample ? "Named reference view." : "No moves yet."}</div>`;
    refs.rightMoves.innerHTML = `<div class="empty-state">${state.abstractExample ? "Named reference view." : "No moves yet."}</div>`;
    return;
  }

  const { value, stats, warnings } = state.analysis;
  const ignoredEdges = state.position.edges.length - state.analysis.normalizedPosition.edges.length;
  const allWarnings = [...warnings];
  if (ignoredEdges > 0) {
    allWarnings.unshift(`${ignoredEdges} unsupported edge${ignoredEdges === 1 ? "" : "s"} fall immediately.`);
  }

  // For verbose game forms, show a compact "complex" label by default. Click
  // jumps to the interactive Game Tree below so the user can read the
  // structure level-by-level instead of squinting at a long brace expression.
  const COMPLEX_THRESHOLD = 30;
  const isComplex = value.label.length > COMPLEX_THRESHOLD;
  if (isComplex) {
    refs.heroValue.innerHTML = `<button type="button" class="value-complex-btn" data-target="gameTreeView" title="${escapeHtml(value.label)}">complex <span class="value-complex-arrow">↓</span></button>`;
  } else {
    refs.heroValue.textContent = value.label;
  }
  refs.heroKind.textContent = kindLabel(value.kind);
  refs.heroOutcomeLabel.textContent = isPlayActive() ? "Your Status" : "Outcome";
  refs.heroOutcome.innerHTML = isPlayActive()
    ? (userIsWinning() ? `<span class="color-green">Winning</span>` : `<span class="color-red">Losing</span>`)
    : escapeHtml(value.shortOutcome);
  if (isComplex) {
    refs.analysisValue.innerHTML = `<button type="button" class="value-complex-btn" data-target="gameTreeView" title="${escapeHtml(value.label)}">complex <span class="value-complex-arrow">↓</span></button>`;
  } else {
    refs.analysisValue.textContent = value.label;
  }
  refs.analysisSubtitle.innerHTML = `${escapeHtml(value.subtitle)}${rigorBadge(state.analysis.rigor)}`;
  // Wire up the complex-jump buttons (analysis + hero) to scroll-and-flash.
  document.querySelectorAll(".value-complex-btn[data-target]").forEach((btn) => {
    btn.onclick = () => {
      const el = document.getElementById(btn.dataset.target);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("scroll-target-flash");
        window.setTimeout(() => el.classList.remove("scroll-target-flash"), 1500);
      }
    };
  });
  refs.analysisExplanation.innerHTML = colorize(escapeHtml(state.analysis.explanation));
  if (refs.analysisDerivation) {
    // Why this value, from this board's own options. Hidden during a live match
    // so it can't hand the user the option values mid-game.
    const derivation = isPlayActive() ? null : state.analysis.derivation;
    refs.analysisDerivation.innerHTML = derivation ? colorize(escapeHtml(derivation)) : "";
    refs.analysisDerivation.style.display = derivation ? "" : "none";
  }

  // Only show meta chips that are actually meaningful for this kind of value.
  // Reduces visual density and surfaces the most useful info upfront.
  const metaChips = [];
  metaChips.push(metaChip("Outcome", outcomeClassText(value.outcomeClass)));
  if (value.relationToZero && value.relationToZero !== "fuzzy") {
    metaChips.push(metaChip("Order", relationLabel(value.relationToZero)));
  }
  if (stats.independentComponents > 1) {
    metaChips.push(metaChip("Parts", String(stats.independentComponents)));
  }
  if (stats.edgeCount > 0) {
    metaChips.push(metaChip("Edges", String(stats.edgeCount)));
  }
  if (value.kind === "number" && value.birthday !== null && value.birthday !== undefined) {
    metaChips.push(metaChip("Birthday", `Day ${value.birthday}`));
  }
  if (value.atomicWeight !== null && value.atomicWeight !== undefined && value.atomicWeight !== 0) {
    metaChips.push(metaChip("Atomic Weight", String(value.atomicWeight)));
  }
  if (value.kind === "switch" && value.temperature) {
    metaChips.push(metaChip("Temperature", value.temperature));
  }
  // Compute and render the game rating (complexity / length / concepts).
  const rating = rateGame(state.analysis.normalizedPosition, value, stats);
  refs.analysisMeta.innerHTML = metaChips.join("") + renderRatingChips(rating);

  // Render sign-expansion as a row of small +/- pills next to the value.
  if (value.signExpansion !== null && value.signExpansion !== undefined && value.signExpansion.length > 0) {
    renderSignExpansion(value.signExpansion);
  } else {
    if (refs.signExpansionView) refs.signExpansionView.innerHTML = "";
  }

  // Anchor links: jump down to relevant deep-analysis sections so users don't
  // have to scroll-hunt for the heat meter / thermograph / game tree.
  if (refs.analysisAnchors) {
    const anchors = [];
    anchors.push(`<a class="analysis-anchor" data-target="heatMeter" href="#heatMeter">↓ Temperature</a>`);
    if (value.thermograph) {
      anchors.push(`<a class="analysis-anchor" data-target="thermographView" href="#thermographView">↓ Thermograph</a>`);
    }
    if (state.analysis.gameTree || state.analysis.components?.length > 1) {
      anchors.push(`<a class="analysis-anchor" data-target="gameTreeView" href="#gameTreeView">↓ Game Tree</a>`);
    }
    if (value.constructionPath && value.constructionPath.length > 1) {
      anchors.push(`<a class="analysis-anchor" data-target="constructionPath" href="#constructionPath">↓ Construction</a>`);
    }
    refs.analysisAnchors.innerHTML = anchors.join("");
    // Wire smooth scroll (avoid hash navigation since the panels live below the fold).
    refs.analysisAnchors.querySelectorAll(".analysis-anchor").forEach((a) => {
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        const targetId = a.dataset.target;
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          // Brief amber flash so users can see where they landed.
          el.classList.add("scroll-target-flash");
          window.setTimeout(() => el.classList.remove("scroll-target-flash"), 1500);
        }
      });
    });
  }

  refs.exactForm.textContent = value.form;
  refs.exactNumber.textContent = value.number ?? "Not a number";
  refs.exactMean.textContent = value.mean ?? "-";
  refs.exactTemperature.textContent = value.temperature ?? "-";
  refs.strategicOutcome.innerHTML = colorize(escapeHtml(value.outcomeName));
  refs.currentTurnOutcome.innerHTML = colorize(escapeHtml(currentTurnOutcome(value)));
  refs.warningList.innerHTML = allWarnings.length > 0
    ? allWarnings.map((w) => warningChip(w)).join("")
    : `<div class="warning-chip">Exact analysis completed.</div>`;

  refs.leftRecommendation.innerHTML = recommendationMarkup(PLAYERS.LEFT, state.analysis.recommendations.left);
  refs.rightRecommendation.innerHTML = recommendationMarkup(PLAYERS.RIGHT, state.analysis.recommendations.right);
  refs.leftRecommendation.classList.toggle("is-featured", state.sideToMove === PLAYERS.LEFT);
  refs.rightRecommendation.classList.toggle("is-featured", state.sideToMove === PLAYERS.RIGHT);

  renderMoveList(refs.leftMoves, PLAYERS.LEFT);
  renderMoveList(refs.rightMoves, PLAYERS.RIGHT);
}

// ── Render: Presets ──

function positionThumbnail(position) {
  if (!position || !position.nodes || position.nodes.length === 0) return "";
  const nodes = position.nodes;
  const edges = position.edges ?? [];
  const parallelMeta = buildParallelEdgeMeta(edges);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
  }
  const pad = 20;
  const w = Math.max(maxX - minX + pad * 2, 60);
  const h = Math.max(maxY - minY + pad * 2, 60);
  const sx = 100 / w;
  const sy = 60 / h;
  const s = Math.min(sx, sy);
  const ox = (100 - w * s) / 2 - minX * s + pad * s;
  const oy = (60 - h * s) / 2 - minY * s + pad * s;
  const tx = (n) => n.x * s + ox;
  const ty = (n) => n.y * s + oy;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  let svg = `<svg class="preset-thumb" viewBox="0 0 100 60" width="100" height="60">`;
  for (const e of edges) {
    const a = nodeMap.get(e.a);
    const b = nodeMap.get(e.b);
    if (!a || !b) continue;
    const col = e.color === EDGE_COLORS.LEFT ? "var(--blue)" : e.color === EDGE_COLORS.RIGHT ? "var(--red)" : "var(--green)";
    const geom = edgeGeometry(
      e,
      { x: tx(a), y: ty(a) },
      { x: tx(b), y: ty(b) },
      parallelMeta.get(e.id),
    );
    if (e.infinite) {
      svg += `<path d="${geom.pathD}" fill="none" stroke="${col}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.45"/>`;
      svg += `<path d="${geom.pathD}" fill="none" stroke="${col}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3 2" opacity="0.82"/>`;
      svg += `<text x="${geom.markerPoint.x}" y="${geom.markerPoint.y - 3}" font-size="8" fill="${col}" text-anchor="middle">\u221e</text>`;
    } else {
      const dash = e.stable ? ' stroke-dasharray="4 3"' : "";
      svg += `<path d="${geom.pathD}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
    }
  }
  for (const n of nodes) {
    const fill = n.ground ? "#102136" : "#fff7ea";
    const stroke = n.ground ? "rgba(255,255,255,0.5)" : "rgba(19,33,53,0.2)";
    const r = n.ground ? 4 : 3;
    svg += `<circle cx="${tx(n)}" cy="${ty(n)}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
  }
  svg += `</svg>`;
  return svg;
}

function examplesByCategory() {
  const byCategory = new Map();
  for (const ex of examples) {
    const cat = ex.category || "reference";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(ex);
  }
  return byCategory;
}

// Paper Tigers are defined by having a cheap shortcut, so name it — computed
// from the position rather than written by hand, so it can't drift.
function tellChip(ex) {
  if (ex.category !== "paper-tiger" || !ex.position) return "";
  const summary = tellSummary(ex.position);
  return summary ? `<p class="preset-tell">${escapeHtml(summary)}</p>` : "";
}

function buildPresetCard(ex) {
  const thumb = ex.position ? positionThumbnail(ex.position) : referenceFigureSvg(ex, { width: 100, height: 60, compact: true });
  const actionable = ex.mode === "loadable" || ex.mode === "abstract";
  const unsupported = Boolean(ex.unsupported);
  const cardClass = !actionable ? "preset-card preset-unsupported" : "preset-card";
  return `<article class="${cardClass}">
    <div class="preset-row">
      ${thumb ? `<div class="preset-thumb-wrap">${thumb}</div>` : ""}
      <div class="preset-info">
        <div class="preset-header">
          <strong>${escapeHtml(ex.name)}</strong>
          <span class="move-chip">${escapeHtml(ex.notation ?? "")}</span>
          <span class="meta-chip">${escapeHtml(supportBadge(ex))}</span>
        </div>
        <p class="preset-copy">${colorize(escapeHtml(ex.description))}</p>
        ${tellChip(ex)}
      </div>
    </div>
    ${actionable
      ? `<button type="button" class="preset-button" data-preset-id="${escapeHtml(ex.id)}">${ex.mode === "abstract" ? "Explain" : "Load"}</button>`
      : unsupported
        ? `<div class="warning-chip preset-unsupported-badge">Not yet supported</div>`
        : `<div class="warning-chip">Reference only</div>`}
  </article>`;
}

// Master-detail games library. renderPresets() builds the category master list
// (titles + a preview thumbnail) and the initial detail pane.
function renderPresets() {
  if (!refs.libMaster) return;
  const categories = exampleCategories();
  const byCategory = examplesByCategory();
  const nonEmpty = categories.filter((c) => (byCategory.get(c.id) || []).length);
  if (!state.selectedCategory || !nonEmpty.some((c) => c.id === state.selectedCategory)) {
    state.selectedCategory = nonEmpty[0]?.id ?? null;
  }
  refs.libMaster.innerHTML = nonEmpty.map((cat) => {
    const items = byCategory.get(cat.id) || [];
    const previewEx = items.find((e) => e.position) || items[0];
    const thumb = previewEx && previewEx.position ? positionThumbnail(previewEx.position) : "";
    return `<button type="button" class="lib-cat${cat.id === state.selectedCategory ? " is-active" : ""}" data-category-select="${escapeHtml(cat.id)}">
      <span class="lib-cat-thumb">${thumb}</span>
      <span class="lib-cat-text">
        <strong>${escapeHtml(cat.label)}</strong>
        <span class="lib-cat-count">${items.length} game${items.length === 1 ? "" : "s"}</span>
      </span>
    </button>`;
  }).join("");
  renderLibraryDetail();
}

// The detail pane: the selected category's games, or \u2014 when a search is active \u2014
// every game matching the query across all categories. Fades in on swap.
function renderLibraryDetail() {
  if (!refs.libDetail) return;
  const q = (refs.librarySearch?.value || "").trim().toLowerCase();
  let items;
  let heading;
  if (q) {
    items = examples.filter((ex) => `${ex.name || ""} ${ex.description || ""}`.toLowerCase().includes(q));
    heading = `Matches \u201C${refs.librarySearch.value.trim()}\u201D`;
  } else {
    items = examplesByCategory().get(state.selectedCategory) || [];
    const cat = exampleCategories().find((c) => c.id === state.selectedCategory);
    heading = cat ? cat.label : "Games";
  }
  const cards = items.map(buildPresetCard).join("");
  refs.libDetail.innerHTML = `<div class="lib-detail-head"><strong>${escapeHtml(heading)}</strong><span class="lib-detail-count">${items.length}</span></div>${cards || `<p class="library-hint">No games match.</p>`}`;
  try {
    refs.libDetail.animate([{ opacity: 0.2, transform: "translateY(5px)" }, { opacity: 1, transform: "none" }], { duration: 190, easing: "ease-out" });
  } catch { /* Web Animations API optional */ }
}

// Master click: select a category and fade its games into the detail pane.
function selectCategory(catId) {
  state.selectedCategory = catId;
  if (refs.librarySearch) refs.librarySearch.value = "";
  if (refs.libMaster) {
    refs.libMaster.querySelectorAll("[data-category-select]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.categorySelect === catId);
    });
  }
  renderLibraryDetail();
}

// Search re-renders the detail pane (matches across all categories).
function filterLibrary() {
  renderLibraryDetail();
}

// ── Render: Controls ──

function renderControls() {
  const inPlay = isPlayActive();
  const inEdit = state.mode === "edit";

  // Mode toggle
  refs.modeToggle.querySelectorAll("[data-mode]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.mode === state.mode);
    // All modes stay switchable; entering Create from a live match ends it
    // (handled in setMode), so no need to disable the button.
    btn.disabled = false;
  });
  // Slide the active-mode indicator pill under the active button.
  const activeModeBtn = refs.modeToggle.querySelector(`[data-mode="${state.mode}"]`);
  const modeIndicator = refs.modeToggle.querySelector(".mode-indicator");
  if (activeModeBtn && modeIndicator) {
    modeIndicator.style.transform = `translate(${activeModeBtn.offsetLeft}px, ${activeModeBtn.offsetTop}px)`;
    modeIndicator.style.width = `${activeModeBtn.offsetWidth}px`;
    modeIndicator.style.height = `${activeModeBtn.offsetHeight}px`;
  }

  // Show/hide panels
  const inAuto = state.mode === "auto";
  refs.editPanels.style.display = inEdit ? "" : "none";
  refs.playPanels.style.display = state.mode === "play" ? "" : "none";
  if (refs.autoPanels) refs.autoPanels.style.display = inAuto ? "" : "none";
  // Right-hand games library: split view in Play + Create, hidden in Auto.
  const libraryEligible = !inAuto;
  if (refs.mainStack) {
    refs.mainStack.classList.toggle("has-library", libraryEligible);
    // Folded = a slim strip (still present); the grid track animates between the
    // full width and the strip so the board widens/narrows smoothly.
    refs.mainStack.classList.toggle("library-folded", libraryEligible && state.libraryCollapsed);
  }
  if (refs.librarySidebar) refs.librarySidebar.style.display = libraryEligible ? "" : "none";
  if (refs.libFoldBtn) {
    refs.libFoldBtn.setAttribute("aria-expanded", state.libraryCollapsed ? "false" : "true");
    refs.libFoldBtn.title = state.libraryCollapsed ? "Show games" : "Hide games";
  }
  refs.heroTurnCard.style.display = "";
  refs.turnSummaryLabel.textContent = isPlayActive() ? "Turn" : inAuto ? "Turn" : "Side";

  // Header quick toggles — Play mode only.
  if (refs.quickToggles) refs.quickToggles.style.display = state.mode === "play" ? "" : "none";
  if (refs.quickUserSide) {
    refs.quickUserSide.querySelectorAll("[data-quick-side]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.quickSide === state.play.userSide);
    });
  }
  if (refs.quickFirstToggle) {
    const youFirst = state.play.startingSide === state.play.userSide;
    refs.quickFirstToggle.setAttribute("aria-pressed", youFirst ? "true" : "false");
    refs.quickFirstToggle.textContent = youFirst ? "On" : "Off";
    refs.quickFirstToggle.classList.toggle("is-on", youFirst);
  }

  // Animation mode buttons (all groups)
  document.querySelectorAll(".anim-mode-group [data-anim]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.anim === state.animationMode);
  });
  // Visual style buttons (node/edge): same is-active highlight pattern.
  // Restrict to BUTTONS — the document root carries data-node-style /
  // data-edge-style for CSS scoping, and we don't want to toggle classes
  // on it.
  document.querySelectorAll("button[data-node-style]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.nodeStyle === state.nodeStyle);
  });
  document.querySelectorAll("button[data-edge-style]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.edgeStyle === state.edgeStyle);
  });
  document.querySelectorAll("[data-board-style]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.boardStyle === (state.boardStyle ?? "none"));
  });

  // Board frame turn tinting
  if (refs.boardFrame) {
    refs.boardFrame.classList.toggle("auto-blue-turn", (inAuto || isPlayActive()) && state.sideToMove === PLAYERS.LEFT);
    refs.boardFrame.classList.toggle("auto-red-turn", (inAuto || isPlayActive()) && state.sideToMove === PLAYERS.RIGHT);
  }

  if (inEdit) {
    refs.toolButtons.querySelectorAll("[data-tool]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tool === state.tool);
      btn.disabled = Boolean(state.abstractExample);
    });
    refs.colorButtons.querySelectorAll("[data-color]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.color === state.edgeColor);
      btn.disabled = Boolean(state.abstractExample);
    });
    refs.turnButtons.querySelectorAll("[data-side]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.side === state.sideToMove);
      btn.disabled = Boolean(state.abstractExample);
    });
    refs.stableToggle.checked = state.stableEdge;
    refs.stableToggle.disabled = Boolean(state.abstractExample);
  }

  // Play controls
  refs.playerSideButtons.querySelectorAll("[data-player-side]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.playerSide === state.play.userSide);
    btn.disabled = inPlay || Boolean(state.abstractExample);
  });
  refs.startingSideButtons.querySelectorAll("[data-starting-side]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.startingSide === state.play.startingSide);
    btn.disabled = inPlay || Boolean(state.abstractExample);
  });
  if (refs.startMatchButton) {
    refs.startMatchButton.disabled = inPlay || Boolean(state.abstractExample);
    refs.startMatchButton.classList.toggle("start-glow", state.mode === "play" && !inPlay && !state.abstractExample);
  }
  if (refs.createStartButton) refs.createStartButton.disabled = Boolean(state.abstractExample);
  refs.restartMatchButton.disabled = !state.play.hasStartingPosition || Boolean(state.abstractExample);
  refs.endMatchButton.disabled = !inPlay;

  // Play status
  if (refs.playSessionSummary) {
    refs.playSessionSummary.innerHTML = state.abstractExample
      ? `Reference view. Switch to a concrete preset to play a match.`
      : !inPlay
      ? `Setup. You are ${turnLabelHtml(state.play.userSide)}, ${turnLabelHtml(state.play.startingSide)} starts.`
      : `Live. You are ${turnLabelHtml(state.play.userSide)}, ${turnLabelHtml(state.play.startingSide)} started.`;
  }
  if (refs.playStatusSummary) {
    refs.playStatusSummary.textContent = state.abstractExample
      ? "This reference card is explanatory only."
      : !inPlay
      ? "Choose a side, then start the match."
      : state.play.winner
        ? `${turnLabel(state.play.winner)} wins!`
        : isUserTurn()
          ? "Your turn. Click an edge."
          : "Engine thinking...";
  }

  // Preset buttons
  refs.presetList.querySelectorAll("[data-preset-id]").forEach((btn) => {
    btn.disabled = false;
  });
}

// ── Render: Main ──

function render() {
  renderControls();
  renderBoard();
  renderAnalysis();
  renderHeatMeter();
  renderAutoHeatViz();
  renderPlayBanner();
  renderTheoryPanel();
  renderExtraAnalysis();
  renderMoveHistory();
  renderSuggestionPanel();
}

// ── Events ──

// Central tool switch — used by both the toolbar buttons and the keyboard
// shortcuts. Defining this also fixes the previously-undefined `setTool`
// references that were silently throwing (and being swallowed) on keys 1-5.
function setTool(tool) {
  state.tool = tool;
  if (tool !== "edge" && tool !== "connection") state.connectFromId = null;
  state.dragConnect = null;
  render();
}

// setPointerCapture throws on a pointerId that isn't an active pointer (e.g.
// synthetic test events). Capturing is a nice-to-have for drags, so swallow it.
function capturePointer(pointerId) {
  try { refs.boardSvg.setPointerCapture(pointerId); } catch { /* inactive pointer */ }
}

// Delete the currently selected node or edge (Delete / Backspace key). Guarded
// to Create mode so the keys can never mutate a live Play position.
function deleteSelected() {
  if (state.mode !== "edit") return;
  if (state.selectedEdgeId) { removeEdge(state.selectedEdgeId); return; }
  if (state.selectedNodeId) { removeNode(state.selectedNodeId); return; }
}

// ── Create-mode undo / redo ──
// A bounded snapshot stack of the board while editing. Loads/mode-switches set
// a fresh baseline; each edit pushes; restore replays a snapshot without
// re-recording (guarded by restoringHistory).
function resetCreateHistory() {
  state.createHistory = { stack: [clonePosition(state.position)], index: 0 };
  updateUndoRedoButtons();
}
function recordCreateHistory() {
  if (state.mode !== "edit" || state.restoringHistory) return;
  const h = state.createHistory;
  if (!h.stack.length) { resetCreateHistory(); return; }
  h.stack = h.stack.slice(0, h.index + 1);
  h.stack.push(clonePosition(state.position));
  if (h.stack.length > 120) h.stack.shift();
  h.index = h.stack.length - 1;
  updateUndoRedoButtons();
}
function applyHistorySnapshot() {
  const snap = state.createHistory.stack[state.createHistory.index];
  if (!snap) return;
  state.restoringHistory = true;
  state.position = clonePosition(snap);
  state.connectFromId = null;
  clearSelection();
  render();
  scheduleAnalysis(false);
  state.restoringHistory = false;
  updateUndoRedoButtons();
}
function undoCreate() {
  if (state.mode !== "edit" || state.createHistory.index <= 0) return;
  state.createHistory.index -= 1;
  applyHistorySnapshot();
}
function redoCreate() {
  if (state.mode !== "edit" || state.createHistory.index >= state.createHistory.stack.length - 1) return;
  state.createHistory.index += 1;
  applyHistorySnapshot();
}
function updateUndoRedoButtons() {
  const h = state.createHistory;
  const inEdit = state.mode === "edit";
  if (refs.undoButton) refs.undoButton.disabled = !inEdit || h.index <= 0;
  if (refs.redoButton) refs.redoButton.disabled = !inEdit || h.index >= h.stack.length - 1;
}

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 8; // px of travel that still counts as "held still"

// May this pointer gesture open the exact-cut slider for `edge`? Mirrors the
// contextmenu handler's guard chain so a long-press can't bypass the rules.
function infiniteCutAllowed(edge) {
  if (!edge || !edge.infinite) return false;
  if (state.mode === "auto") return false;
  if (isPlayActive()) {
    return !state.play.winner && isUserTurn() && edgeLooksPlayableFor(state.play.userSide, edge);
  }
  return true;
}

function armInfiniteLongPress(edgeId, event) {
  clearInfiniteLongPress();
  if (!edgeId) return;
  const edge = state.position.edges.find((e) => e.id === edgeId);
  if (!infiniteCutAllowed(edge)) return;
  const { clientX, clientY } = event;
  state.longPress = {
    edgeId, startX: clientX, startY: clientY, fired: false,
    timer: window.setTimeout(() => {
      const lp = state.longPress;
      if (!lp) return;
      lp.fired = true;
      lp.timer = null;
      // Re-check: the position may have changed during the hold.
      const live = state.position.edges.find((e) => e.id === lp.edgeId);
      if (infiniteCutAllowed(live)) showInfiniteSlider(live, lp.startX, lp.startY);
    }, LONG_PRESS_MS),
  };
}

function clearInfiniteLongPress() {
  if (state.longPress?.timer) window.clearTimeout(state.longPress.timer);
  state.longPress = null;
}

// True when the just-finished gesture was consumed by a long-press, so the
// pointerup path must not also play a move.
function longPressConsumed() {
  const fired = Boolean(state.longPress?.fired);
  clearInfiniteLongPress();
  return fired;
}

function handleBoardPointerDown(event) {
  // Ignore non-primary buttons. Right-click is reserved for the infinite-edge
  // cut slider (the contextmenu handler), so it must not also run a left-click
  // action — in a live match that would random-cut the edge before the slider.
  if (event.button > 0) return;
  if (state.abstractExample) return;
  if (state.mode === "auto") return;
  const point = boardPointFromEvent(event);
  state.pointer = point;
  const nodeTarget = event.target.closest("[data-node-id]");
  const edgeTarget = event.target.closest("[data-edge-id]");
  const nodeId = nodeTarget?.dataset.nodeId ?? null;
  const edgeId = edgeTarget?.dataset.edgeId ?? null;

  // Long-press on an infinite edge opens the exact-cut slider. Right-click does
  // the same on a mouse (the contextmenu handler), but that gesture doesn't
  // exist on touch — without this the only way to cut an infinite edge on a
  // phone is the random fallback below, in a game about precise choices.
  armInfiniteLongPress(edgeId, event);

  if (isPlayActive()) {
    if (state.play.winner || !isUserTurn()) return;
    if (edgeId) {
      const edge = state.position.edges.find((e) => e.id === edgeId);
      if (edge && edge.infinite && edgeLooksPlayableFor(state.play.userSide, edge)) {
        // Deferred to pointerup: a hold on this edge opens the exact-cut slider
        // instead, and acting now would cut the edge out from under it.
        return;
      }
      const lm = moveFor(state.play.userSide, edgeId);
      if (lm) playMove(state.play.userSide, edgeId, "manual");
      return;
    }
    if (nodeId) {
      const adj = state.position.edges.filter(
        (e) => (e.a === nodeId || e.b === nodeId) && edgeLooksPlayableFor(state.play.userSide, e),
      );
      if (adj.length === 1) {
        const edge = adj[0];
        if (edge.infinite) {
          const n = Math.floor(Math.random() * 10) + 1;
          cutInfiniteEdge(edge.id, n, "manual");
          return;
        }
        const lm = moveFor(state.play.userSide, adj[0].id);
        if (lm) playMove(state.play.userSide, adj[0].id, "manual");
      }
    }
    return;
  }

  if (state.mode === "play") return;

  // ── Create-mode tools ──
  // delete : click a node/edge to remove it.
  // node   : click empty to place (ground-aware) · drag a node to move it ·
  //          click a node (no drag) to toggle its ground flag.
  // edge (default/main) + connection : drag from a node to draw an edge. Edge
  //          spawns a new end node when released on empty space; connection
  //          only links to an existing node. Either can start from empty space
  //          (a start node is created there). Clicking an edge selects it.
  if (state.tool === "delete") {
    if (edgeId) removeEdge(edgeId);
    else if (nodeId) removeNode(nodeId);
    return;
  }

  if (state.tool === "node") {
    if (nodeId) {
      state.selectedNodeId = nodeId;
      state.selectedEdgeId = null;
      const node = findNode(nodeId);
      state.dragging = {
        nodeId, pointerId: event.pointerId,
        offsetX: node.x - point.x, offsetY: node.y - point.y,
        startX: point.x, startY: point.y, moved: false, kind: "node",
      };
      capturePointer(event.pointerId);
      render();
    } else if (edgeId) {
      state.selectedEdgeId = edgeId;
      state.selectedNodeId = null;
      render();
    } else {
      addNode(point, nearGround(point));
    }
    return;
  }

  if (state.tool === "edge" || state.tool === "connection") {
    if (edgeId && !nodeId) {
      state.selectedEdgeId = edgeId;
      state.selectedNodeId = null;
      render();
      return;
    }
    let fromId = nodeId;
    let fromCreated = false;
    if (!fromId) {
      fromId = addNode(point, nearGround(point)).id;
      fromCreated = true;
    }
    state.dragConnect = {
      fromId, fromCreated, pointerId: event.pointerId,
      startX: point.x, startY: point.y, moved: false,
    };
    state.selectedNodeId = fromId;
    state.selectedEdgeId = null;
    capturePointer(event.pointerId);
    render();
    return;
  }
}

function handleBoardPointerMove(event) {
  // Travel past the slop means this is a drag, not a hold.
  const press = state.longPress;
  if (press && !press.fired) {
    if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > LONG_PRESS_SLOP) {
      clearInfiniteLongPress();
    }
  }
  if (state.abstractExample) return;
  const point = boardPointFromEvent(event);
  state.pointer = point;
  const hc = setHoveredEdge(event.target.closest("[data-edge-id]")?.dataset.edgeId ?? null);

  if (isPlayActive()) { if (hc) renderBoard(); return; }

  // Drawing an edge/connection: animate the ghost line to the pointer.
  if (state.dragConnect) {
    if (Math.hypot(point.x - state.dragConnect.startX, point.y - state.dragConnect.startY) > 4) {
      state.dragConnect.moved = true;
    }
    setHoveredEdge(null);
    renderBoard();
    return;
  }

  if (!state.dragging) {
    if (hc) renderBoard();
    return;
  }
  setHoveredEdge(null);
  const node = findNode(state.dragging.nodeId);
  if (!node) return;
  if (Math.hypot(point.x - state.dragging.startX, point.y - state.dragging.startY) > 4) {
    state.dragging.moved = true;
  }
  node.x = clamp(point.x + state.dragging.offsetX, 30, BOARD_WIDTH - 30);
  node.y = node.ground ? GROUND_Y : clamp(point.y + state.dragging.offsetY, 52, GROUND_Y - 40);
  renderBoard();
}

// The browser can steal an in-flight pointer gesture (a touch drag reinterpreted
// as a page pan, a system gesture). That fires pointercancel INSTEAD of
// pointerup, so the normal completion path never runs. Roll the drag back —
// including any node the edge tool placed on pointerdown, which the user never
// got to connect to anything.
function cancelBoardDrag(event) {
  clearInfiniteLongPress();
  if (refs.boardSvg.hasPointerCapture?.(event.pointerId)) {
    refs.boardSvg.releasePointerCapture(event.pointerId);
  }
  const dc = state.dragConnect;
  state.dragConnect = null;
  state.dragging = null;
  if (dc?.fromCreated) {
    removeNode(dc.fromId);
    return; // removeNode already re-renders and re-analyzes
  }
  render();
}

function handleBoardPointerUp(event) {
  // Resolve the long-press first: if it already opened the slider this gesture
  // is spent, otherwise a quick tap on an infinite edge falls through to the
  // random cut that pointerdown deferred.
  const press = state.longPress;
  const pressFired = Boolean(press?.fired);
  const pressedEdgeId = press?.edgeId ?? null;
  clearInfiniteLongPress();

  if (state.abstractExample) return;
  if (pressFired) return;

  if (isPlayActive()) {
    if (pressedEdgeId) {
      const edge = state.position.edges.find((e) => e.id === pressedEdgeId);
      if (infiniteCutAllowed(edge)) {
        cutInfiniteEdge(edge.id, Math.floor(Math.random() * 10) + 1, "manual");
      }
    }
    return;
  }

  // Finish an edge / connection drag.
  if (state.dragConnect) {
    if (refs.boardSvg.hasPointerCapture(event.pointerId)) refs.boardSvg.releasePointerCapture(event.pointerId);
    const dc = state.dragConnect;
    state.dragConnect = null;
    const point = boardPointFromEvent(event);
    const upNodeId = event.target.closest("[data-node-id]")?.dataset.nodeId ?? null;
    if (upNodeId && upNodeId !== dc.fromId) {
      addEdge(dc.fromId, upNodeId);
    } else if (!upNodeId && dc.moved && state.tool === "edge") {
      const endNode = addNode(point, nearGround(point));
      addEdge(dc.fromId, endNode.id);
    } else {
      // Released on the source node, or on empty space with the Connection
      // tool, or no real drag: keep any freshly-placed start node and settle.
      render();
      scheduleAnalysis(false);
    }
    return;
  }

  if (!state.dragging) return;
  if (refs.boardSvg.hasPointerCapture(event.pointerId)) refs.boardSvg.releasePointerCapture(event.pointerId);
  const drag = state.dragging;
  state.dragging = null;
  // Node tool: a press-release with no movement toggles the node's ground flag.
  if (drag.kind === "node" && !drag.moved) {
    toggleGround(drag.nodeId);
  } else {
    scheduleAnalysis(false);
    recordCreateHistory();
  }
}

function handleMovesClick(event) {
  const btn = event.target.closest("[data-play-player]");
  if (!btn) return;
  if (isPlayActive()) {
    if (!isUserTurn() || btn.dataset.playPlayer !== state.play.userSide) return;
    playMove(state.play.userSide, btn.dataset.playEdge, "manual");
    return;
  }
  playMove(btn.dataset.playPlayer, btn.dataset.playEdge, "manual");
}

function handleMovesHover(event) {
  const card = event.target.closest("[data-hover-edge]");
  if (setHoveredEdge(card?.dataset.hoverEdge ?? null)) renderBoard();
}

function handlePresetClick(event) {
  const pb = event.target.closest("[data-preset-id]");
  if (!pb) return;
  const ex = examples.find((entry) => entry.id === pb.dataset.presetId);
  if (!ex) return;
  if (ex.mode === "loadable" && ex.position) {
    // Heavy "boss" positions would freeze the page if auto-analyzed on load.
    // Outside Play mode, load them gated (Solve button) instead of crunching.
    if (ex.heavy && state.mode !== "play") {
      setPosition(ex.position, true, false, true);
      return;
    }
    setPosition(ex.position, true);
    // In Play mode, clicking a game starts the match immediately using the
    // current header toggles (your side + who moves first). Clicking another
    // game mid-match abandons it and starts the new one (beginPlaySession
    // resets the play state). In Create mode we just load it for editing.
    if (state.mode === "play") beginPlaySession();
    return;
  }
  if (ex.mode === "abstract") {
    loadAbstractExample(ex);
  }
}

function dumpJson() {
  refs.jsonEditor.value = JSON.stringify(state.position, null, 2);
}

function loadJson() {
  try {
    setPosition(JSON.parse(refs.jsonEditor.value), true);
  } catch (error) {
    state.analysisError = new Error(`JSON parse failed: ${error.message}`);
    state.analysis = null;
    state.analysisPending = false;
    renderAnalysis();
  }
}

function setMode(mode) {
  if (mode === state.mode) return;
  // When leaving auto mode, stop it
  if (state.mode === "auto") {
    stopAutoMode();
  }
  // Leaving Play for either other mode must end the match. Entering Auto with a
  // live session left two engines driving one board, and the auto-mode moves
  // were appended to the play history.
  if ((mode === "edit" || mode === "auto") && isPlayActive()) {
    endPlaySession();
  }
  state.mode = mode;
  if (mode === "edit") {
    state.showSuggestions = false;
    state.showMoveDetails = false;
    resetCreateHistory();
  }
  render();
  // Cross-fade the main view on mode change (pairs with the sliding indicator).
  if (refs.mainStack && refs.mainStack.animate) {
    try { refs.mainStack.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 220, easing: "ease-out" }); } catch { /* fade optional */ }
  }
}

// ── Shareable URLs ──
// Encode a position into a URL-safe base64 string and round-trip via
// location.hash so users can link directly to a configuration.

function compactPositionForUrl(position) {
  return {
    nodes: (position.nodes ?? []).map((n) => {
      const out = { id: n.id, x: Math.round(n.x ?? 0), y: Math.round(n.y ?? 0) };
      if (n.ground) out.ground = 1;
      return out;
    }),
    edges: (position.edges ?? []).map((e) => {
      const out = { id: e.id, a: e.a, b: e.b, color: e.color };
      if (e.stable) out.stable = 1;
      if (e.infinite) out.infinite = 1;
      if (e.loop) out.loop = 1;
      if (e.loopKind) out.loopKind = e.loopKind;
      if (e.pattern) out.pattern = e.pattern;
      return out;
    }),
  };
}

function expandCompactPosition(compact) {
  if (!compact || !Array.isArray(compact.nodes) || !Array.isArray(compact.edges)) return null;
  return {
    nodes: compact.nodes.map((n) => ({
      id: String(n.id),
      x: Number(n.x ?? 0),
      y: Number(n.y ?? 0),
      ground: Boolean(n.ground),
    })),
    edges: compact.edges.map((e) => ({
      id: String(e.id),
      a: String(e.a),
      b: String(e.b),
      color: String(e.color),
      stable: Boolean(e.stable),
      infinite: Boolean(e.infinite),
      loop: Boolean(e.loop),
      loopKind: e.loopKind ?? null,
      pattern: e.pattern ?? null,
    })),
  };
}

function encodePositionToHash(position) {
  const compact = compactPositionForUrl(position);
  const json = JSON.stringify(compact);
  // UTF-8-safe base64 → URL-safe (no padding, no + or /)
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return b64;
}

function decodeHashToPosition(hash) {
  if (!hash) return null;
  try {
    let b64 = String(hash).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json = decodeURIComponent(escape(atob(b64)));
    return expandCompactPosition(JSON.parse(json));
  } catch (e) {
    return null;
  }
}

function buildShareUrl(position) {
  const hash = encodePositionToHash(position);
  const url = new URL(location.href);
  url.hash = `p=${hash}`;
  return url.toString();
}

function copyShareUrl() {
  const url = buildShareUrl(state.position);
  // Try the modern clipboard API first; fall back to a textarea trick when
  // the document isn't focused or the API isn't available (e.g. file://).
  const finish = (ok) => showShareToast(ok ? "Link copied!" : "Copy failed — see URL bar", url, ok);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url)
      .then(() => finish(true))
      .catch(() => {
        history.replaceState(null, "", url);
        finish(false);
      });
  } else {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      finish(true);
    } catch {
      history.replaceState(null, "", url);
      finish(false);
    }
    document.body.removeChild(ta);
  }
  // Always update the address bar so the URL is at least visible.
  history.replaceState(null, "", url);
}

let shareToastTimer = null;
function showShareToast(message, url, ok) {
  let toast = document.querySelector("#shareToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "shareToast";
    toast.className = "share-toast";
    document.body.appendChild(toast);
  }
  const truncated = url && url.length > 64 ? `${url.slice(0, 60)}…` : url;
  toast.innerHTML = `<strong>${escapeHtml(message)}</strong>${truncated ? `<code>${escapeHtml(truncated)}</code>` : ""}`;
  toast.classList.toggle("is-error", !ok);
  toast.classList.add("is-visible");
  if (shareToastTimer) window.clearTimeout(shareToastTimer);
  shareToastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2600);
}

function loadPositionFromHashOnInit() {
  const hash = location.hash || "";
  const match = hash.match(/^#p=([A-Za-z0-9_\-]+)/);
  if (!match) return false;
  const decoded = decodeHashToPosition(match[1]);
  if (!decoded) return false;
  // Defer until after init has placed initial preset; setPosition handles
  // normalize + render + analyze.
  setPosition(decoded, true);
  return true;
}

// ── Keyboard Shortcuts ──
// Opens with `?` (or `/`) and dispatches actions to the same handlers used by
// the toolbar buttons. Inputs/textareas are skipped so typing in JSON editor
// doesn't trigger mode flips.

const KEYBOARD_SHORTCUTS = [
  {
    section: "Mode",
    items: [
      { keys: ["E"], label: "Create Mode", action: () => setMode("edit") },
      { keys: ["P"], label: "Play Mode", action: () => setMode("play") },
      { keys: ["A"], label: "Auto Mode", action: () => setMode("auto") },
      { keys: ["T"], label: "Cycle theme (auto / light / dark)", action: () => cycleTheme() },
      { keys: ["?"], label: "Open this shortcuts cheatsheet", action: () => openShortcuts() },
      { keys: ["Esc"], label: "Close shortcuts / popups", action: () => closeShortcuts() },
    ],
  },
  {
    section: "Create",
    items: [
      { keys: ["1"], label: "Edge tool (main)", action: () => setTool("edge") },
      { keys: ["2"], label: "Node tool", action: () => setTool("node") },
      { keys: ["3"], label: "Connection tool", action: () => setTool("connection") },
      { keys: ["4"], label: "Delete tool", action: () => setTool("delete") },
      { keys: ["Delete", "Backspace"], label: "Delete selected node / edge", action: () => deleteSelected() },
      { keys: ["B"], label: "Set edge color: Blue", action: () => { state.edgeColor = "blue"; render(); } },
      { keys: ["R"], label: "Set edge color: Red", action: () => { state.edgeColor = "red"; render(); } },
      { keys: ["G"], label: "Set edge color: Green", action: () => { state.edgeColor = "green"; render(); } },
      { keys: ["N"], label: "Random position", action: () => { if (refs.randomButton) refs.randomButton.click(); } },
      { keys: ["C"], label: "Clear board", action: () => { if (refs.clearButton) refs.clearButton.click(); } },
    ],
  },
  {
    section: "Play / Replay",
    items: [
      // Bind the real KeyboardEvent.key values; `display` is what the cheatsheet shows.
      { keys: ["ArrowLeft"], display: ["←"], label: "Step back through history", action: () => scrubPrev() },
      { keys: ["ArrowRight"], display: ["→"], label: "Step forward / to live", action: () => scrubNext() },
      { keys: ["End"], label: "Jump to live state", action: () => scrubLive() },
    ],
  },
  {
    section: "Diagnostics",
    items: [
      { keys: ["Shift+T"], label: "Run Self-Test", action: () => { if (refs.runTestsButton) refs.runTestsButton.click(); } },
    ],
  },
];

function renderShortcuts() {
  if (!refs.shortcutsBody) return;
  const sections = KEYBOARD_SHORTCUTS.map((s) => {
    const rows = s.items.map((item) => {
      const keysHtml = (item.display ?? item.keys).map((k) => `<kbd>${escapeHtml(k)}</kbd>`).join(" or ");
      return `<div class="shortcut-row"><span class="shortcut-keys">${keysHtml}</span><span class="shortcut-label">${escapeHtml(item.label)}</span></div>`;
    }).join("");
    return `<div class="shortcut-section"><h3>${escapeHtml(s.section)}</h3><div class="shortcut-rows">${rows}</div></div>`;
  }).join("");
  refs.shortcutsBody.innerHTML = sections;
}

function openShortcuts() {
  if (!refs.shortcutsOverlay) return;
  refs.shortcutsOverlay.style.display = "flex";
}

function closeShortcuts() {
  if (!refs.shortcutsOverlay) return;
  refs.shortcutsOverlay.style.display = "none";
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function handleGlobalKeydown(ev) {
  if (isTypingTarget(ev.target)) return;
  // Undo / redo while editing in Create mode (Ctrl/Cmd+Z, Ctrl+Y or Ctrl+Shift+Z).
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && state.mode === "edit") {
    const key = ev.key.toLowerCase();
    if (key === "z" && !ev.shiftKey) { ev.preventDefault(); undoCreate(); return; }
    if (key === "y" || (key === "z" && ev.shiftKey)) { ev.preventDefault(); redoCreate(); return; }
  }
  // Never claim browser/OS chords. Without this the single-letter bindings below
  // match on the letter alone and swallow Ctrl+P (print), Ctrl+R (reload),
  // Ctrl+A (select all) in every mode except Create.
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  // Build a normalized key descriptor: "Shift+T" or "?" etc.
  const k = ev.key;
  const shift = ev.shiftKey;
  const target = (shift && k.length === 1) ? `Shift+${k.toUpperCase()}` : k;
  // Special handling for certain keys
  if (k === "?" || (shift && k === "/")) { ev.preventDefault(); openShortcuts(); return; }
  if (k === "Escape") { ev.preventDefault(); closeShortcuts(); return; }

  // Search through KEYBOARD_SHORTCUTS for a matching binding
  for (const section of KEYBOARD_SHORTCUTS) {
    for (const item of section.items) {
      // The case-insensitive fallback must not run while Shift is held, or a
      // plain "T" binding would match Shift+T and shadow the real "Shift+T" one.
      if (item.keys.some((bind) => bind === target || (!shift && bind.toLowerCase() === k.toLowerCase()))) {
        ev.preventDefault();
        try { item.action(); } catch { /* ignore handler errors */ }
        return;
      }
    }
  }
}

// ── Roadmap ──
// In-app capability matrix. Categories are rendered as colored badges; each
// item has a one-line description. Updated whenever feature support changes.

const ROADMAP_DATA = [
  {
    status: "done",
    label: "Fully Supported",
    badge: "✓",
    description: "Implemented end-to-end with regression-tested behavior.",
    items: [
      { name: "Red / Blue / Green ruleset", note: "Standard Red-Blue-Green Hackenbush with ground-support cascade pruning." },
      { name: "Cold positions → exact surreal numbers", note: "Day-by-day construction path shown in Deep Analysis." },
      { name: "Green bamboo → nimbers", note: "Sprague-Grundy via mex; *n recognized symbolically." },
      { name: "Switches", note: "{a | b} with a > b detected; mean and temperature reported." },
      { name: "Named short games", note: "*, *2+, ↑, ↓, ↑*, ⇑, ⇓, tiny(n), miny(n) recognized in display." },
      { name: "Component decomposition + sum", note: "Independent subgraphs solved separately and combined; transfinite-aware." },
      { name: "Canonical position hashing", note: "Weisfeiler-Lehman color refinement de-duplicates isomorphic subpositions in the memo (~17× state reduction on symmetric positions)." },
      { name: "Stable 'no-fall' edges", note: "Experimental anchor-style extension; tagged in displays." },
      { name: "Infinite edges → ω, -ω, ω+n, ω-n, ω·n, ω²", note: "Pattern-matched from edge topology with an `infinite` attribute." },
      { name: "Grass (parallel infinite green) → ω*[n]", note: "Multiple infinite green stalks combine via a stalk-count rule." },
      { name: "Loopy games (on / off / over / under / dud)", note: "Real arithmetic with `loop: true` edge attribute. Sum, compare, display, outcome." },
      { name: "Thermograph plot", note: "SVG plot of left/right walls vs temperature. Frozen vertical for cold numbers; V-shape for switches." },
      { name: "46 cut-edge animations", note: "Physical (Drop, Shatter, Rope Snap, Marble Roll…), painterly (Van Gogh, Dali, Chirico, Klee, Kandinsky), six motion styles that borrow a way of moving rather than a look (Jelly, Mobile, Whiplash, Bauhaus, Butoh, Suprematist) and five organic ones (Breath, Wither, Tide, Murmuration, Bloom), plus shape-locked variants. The eleven newest are unit-tested for movement, cleanup and prefers-reduced-motion." },
      { name: "Painterly board styles", note: "Whole-board treatments borrowing a painter's spatial logic rather than their subject: Kandinsky (drifting circles and diagonals), Malevich (flat suprematist void, all lighting removed) and Chirico (low sun, hard horizon, long raking shadows cast in one constant direction). Pure CSS on a single layer; the drift stops under prefers-reduced-motion." },
      { name: "Light + dark theme", note: "Full palette flip via `prefers-color-scheme` and explicit toggle. Dark mode applies per-color glow filter to edges." },
      { name: "Self-test suite", note: "88 in-app cases across 14 categories (Numbers, Nimbers, Composites, Hot, Transfinite, Loopy, Thermograph, Regression, Structural, Gallery, Construction, Sign-Expansion, Atomic-Weight, URL round-trips). Coverage is thinnest on Hot/Composites — the engine's weakest areas." },
      { name: "Auto-play / AI vs AI", note: "Speed control (Fast / Normal / Slow). Win banner duration scales with speed." },
      { name: "Multi-edge curving", note: "Parallel edges between same node pair always curve to distinct sides; chain after cutting an infinite edge bulges to avoid sibling overlap." },
      { name: "Floating vertex visual cue", note: "Non-ground vertices with no incident edges render as faded dashed circles." },
      { name: "Component thumbnails", note: "Mini-SVG of each independent component shown in Deep Analysis." },
      { name: "Undo / redo in Create mode", note: "History stack with Ctrl+Z / Ctrl+Y, reset on load." },
      { name: "Random position generator", note: "Random button in Create; also seeds Auto mode." },
      { name: "Replay scrubber", note: "Step back/forward through a match, jump to the first move or to live. Playing from a reverted point branches the timeline and discards the old future." },
      { name: "Sign-expansion view", note: "Conway's L/R binary string shown alongside the dyadic fraction." },
      { name: "Keyboard shortcuts cheatsheet", note: "Press ? for the full binding list; tool, mode and theme keys included." },
      { name: "Off-thread solving for heavy positions", note: "Boss-tier positions solve in a Web Worker behind a Solve button, with a live state counter and a Cancel button, so the page never freezes." },
      { name: "Curated difficulty tiers", note: "Complex / Boss / Paper Tigers. The split is enforced by a test: every Boss game must have no cheap tell (no keystone edge, no blue/red mirror) and every Paper Tiger must have one." },
      { name: "Fusion Principle (Green Hackenbush)", note: "An all-green component is impartial, so its value is one nimber. Fusion contracts every 2-edge-connected component to a point, turns swallowed edges into loops, and applies the Colon Principle — replacing an exponential search with a graph walk. Verified the only way that counts: for each position P claiming *n, P + bamboo(n) is checked to be 0, across the curated library and 25 random green graphs." },
      { name: "Misère play (impartial positions)", note: "Same board, last player to move loses. Computed exactly by recursion over the whole position — never by combining components, because misère Grundy values do NOT nim-add. Verified against the classical misère Nim theorem across 16 heap configurations. Scope is deliberately limited to what is exactly computable: no genus symbol and no misère quotient is claimed." },
      { name: "Rigor colour coding", note: "Every value is badged with how much weight it carries: green Proved (reduced by a theorem), teal Exact (solved, and canonical for finite games), amber Not simplified (a fail-open signal only — no shipped position reaches it; it fires if the simplifier hits its guard and returns an unreduced form rather than a wrong one), red Heuristic (pattern-matched — transfinite, loopy, or unscored options). Hover any badge for the reason." },
      { name: "Canonical form (domination + reversibility)", note: "Every finite short game is reduced to its unique simplest name: dominated options removed, reversible options bypassed through the opponent's best reply. The worst displayed value fell from 4,024 characters to 17. Locked by the invariant that no outcome and no search size changed across the whole library, by G + (−G) = 0 fuzzing, and by guards that {1|1} and ↑* must NOT over-simplify." },
      { name: "Chord diagrams", note: "Extra Analysis renders the position as a ring of connections (nodes on the rim, edges as ribbons coloured by who may cut them) or as a distribution of where each side's moves lead. Stays readable on dense meshes where the board itself becomes a tangle." },
      { name: "Live reasoning walk", note: "Optional stepped derivation: prune, split into components, add them, branch, then a classification ladder (impartial? cold? hot? infinitesimal?) with the taken rung highlighted, plus a one-hop branch fan of both sides' options." },
    ],
  },
  {
    status: "partial",
    label: "Partially Supported",
    badge: "⚠",
    description: "Works in common cases but with documented gaps or fallbacks.",
    items: [
      { name: "Multi-infinite mixed with finite edges in one component", note: "Bails the shallow heuristic and falls back to general recursion. May produce a general-game form rather than a clean transfinite number." },
      { name: "Mixed-color infinite flowers", note: "Tagged `approximate`; move-by-move scoring is suppressed." },
      { name: "ω² detection", note: "Only recognizes a strict trunk + branches topology. ω²·n, ω² + ω, etc. not derived." },
      { name: "Hot positions — none found", note: "Measured, not assumed: no position anywhere in this app has a positive temperature. Every entry in the Hot Games category, and 3,398 randomly generated mixed boards, come out at temperature 0 — the partisan options keep resolving to infinitesimals, and `{ X | X }` is a tepid form, not a switch. Whether Blue-Red-Green Hackenbush can be hot at these sizes is unresolved here; the thermograph code has simply never had a switch to draw. Until one exists, the cooling sweep and any temperature-guided play have nothing to work with." },
      { name: "Loopy game arithmetic", note: "Five named values plus shifts. Doesn't capture every subtle case from Conway's loopy theory (e.g. `{ on | over }` → falls back to dominance)." },
      { name: "Performance on dense post-infinite-cut positions", note: "Boss-tier positions solve off-thread, but every other analysis — each Create edit, each move in Play, Auto mode — is still synchronous on the UI thread, so a large chain can feel slow." },
    ],
  },
  {
    status: "planned",
    label: "Doable, Not Yet Implemented",
    badge: "🚧",
    description: "Reasonable scope; planned for upcoming iterations.",
    items: [
      { name: "Touch / mobile-optimized interactions", note: "Drag-to-draw and the long-press cut slider now work on touch, but tap targets and the fixed 980×620 board are still tuned for a desktop pointer." },
      { name: "Deeper atomic-weight / uptimal arithmetic", note: "The atomic weight itself is computed and shown as a chip; what's missing is full uptimal arithmetic — distinguishing `↑↑` from `↑+↑` beyond pattern matching." },
      { name: "Keyboard-playable board", note: "The board SVG has no focusable edges, so a whole game can't yet be played without a pointer." },
    ],
  },
  {
    status: "out-of-scope",
    label: "Hard / Out of Scope",
    badge: "❌",
    description: "Real research projects or large refactors. Documented for completeness.",
    items: [
      { name: "General loopy game solver", note: "Beyond named values — full loopy theory with arbitrary recursive cycles is research-level." },
      { name: "Deep transfinite arithmetic past ω·n / ω + n", note: "Conway normal form with arbitrary nested ordinals." },
      { name: "Full thermal solver for arbitrary hot compounds", note: "Beyond simple switches; would need full thermograph algebra in the solver." },
      { name: "Loopy interpretation of graph cycles", note: "Cycles in the ordinary graph are still treated as plain Hackenbush (which is correct — Hackenbush with cycles is still terminating). Requires explicit `loop: true` edges to invoke loopy semantics." },
      { name: "Accessibility audit", note: "ARIA labels, full keyboard nav, screen-reader testing." },
    ],
  },
];

function renderRoadmap() {
  if (!refs.roadmapBody) return;
  const sections = ROADMAP_DATA.map((cat) => {
    const items = cat.items.map((it) => `
      <li class="roadmap-item">
        <strong>${escapeHtml(it.name)}</strong>
        <span class="roadmap-note">${escapeHtml(it.note)}</span>
      </li>`).join("");
    return `
      <div class="roadmap-category roadmap-${cat.status}">
        <div class="roadmap-category-header">
          <span class="roadmap-category-badge">${cat.badge}</span>
          <div class="roadmap-category-title">
            <strong>${escapeHtml(cat.label)}</strong>
            <span>${escapeHtml(cat.description)}</span>
          </div>
          <span class="roadmap-category-count">${cat.items.length}</span>
        </div>
        <ul class="roadmap-list">${items}</ul>
      </div>`;
  }).join("");
  refs.roadmapBody.innerHTML = sections;
}

function toggleRoadmap() {
  if (!refs.roadmapBody || !refs.roadmapToggle) return;
  const expanded = refs.roadmapToggle.getAttribute("aria-expanded") !== "false";
  if (expanded) {
    refs.roadmapBody.style.display = "none";
    refs.roadmapToggle.setAttribute("aria-expanded", "false");
    refs.roadmapToggle.textContent = "Show";
  } else {
    refs.roadmapBody.style.display = "";
    refs.roadmapToggle.setAttribute("aria-expanded", "true");
    refs.roadmapToggle.textContent = "Hide";
  }
}

// ── Self-Test Suite ──
// A compact regression harness with known-good expected values. Users can run
// this from the "Run Self-Test" button in the Actions toolbar to confirm the
// engine produces the expected labels / outcomes on a span of canonical
// positions. Each case returns a bool indicating pass.

function _testStalk(colors, prefix = "t") {
  const nodes = [{ id: `${prefix}-g`, ground: true, x: 500, y: 540 }];
  const edges = [];
  let prev = `${prefix}-g`;
  colors.forEach((c, i) => {
    const nid = `${prefix}-n${i}`;
    nodes.push({ id: nid, ground: false, x: 500, y: 500 - (i * 60) });
    edges.push({ id: `${prefix}-e${i}`, a: prev, b: nid, color: c, stable: false });
    prev = nid;
  });
  return { nodes, edges };
}

function _testCombine(...parts) {
  return { nodes: parts.flatMap((p) => p.nodes), edges: parts.flatMap((p) => p.edges) };
}

function _testInfEdge(color, prefix = "i") {
  return {
    nodes: [
      { id: `${prefix}-g`, ground: true, x: 500, y: 540 },
      { id: `${prefix}-t`, ground: false, x: 500, y: 200 },
    ],
    edges: [{
      id: `${prefix}-e`,
      a: `${prefix}-g`,
      b: `${prefix}-t`,
      color,
      stable: false,
      infinite: true,
      pattern: "stalk",
    }],
  };
}

function getSelfTestCases() {
  const B = EDGE_COLORS.LEFT;
  const R = EDGE_COLORS.RIGHT;
  const G = EDGE_COLORS.NEUTRAL;
  return [
    // --- Numbers ---
    { category: "Numbers", name: "Empty position = 0",
      position: { nodes: [{ id: "g", ground: true, x: 0, y: 0 }], edges: [] },
      expected: "0",
      check: (v) => v.number === "0" },
    { category: "Numbers", name: "Single blue = 1",
      position: _testStalk([B]), expected: "1",
      check: (v) => v.kind === "number" && v.number === "1" },
    { category: "Numbers", name: "Single red = -1",
      position: _testStalk([R]), expected: "-1",
      check: (v) => v.kind === "number" && v.number === "-1" },
    { category: "Numbers", name: "Two blues = 2",
      position: _testStalk([B, B]), expected: "2",
      check: (v) => v.kind === "number" && v.number === "2" },
    { category: "Numbers", name: "Blue over red = 1/2",
      position: _testStalk([B, R]), expected: "1/2",
      check: (v) => v.kind === "number" && v.number === "1/2" },
    { category: "Numbers", name: "Red over blue = -1/2",
      position: _testStalk([R, B]), expected: "-1/2",
      check: (v) => v.kind === "number" && v.number === "-1/2" },
    { category: "Numbers", name: "B,R,B = 3/4",
      position: _testStalk([B, R, B]), expected: "3/4",
      check: (v) => v.kind === "number" && v.number === "3/4" },
    { category: "Numbers", name: "B,R,R = 1/4",
      position: _testStalk([B, R, R]), expected: "1/4",
      check: (v) => v.kind === "number" && v.number === "1/4" },
    { category: "Numbers", name: "B,R,B,R = 5/8",
      position: _testStalk([B, R, B, R]), expected: "5/8",
      check: (v) => v.kind === "number" && v.number === "5/8" },

    // --- Nimbers ---
    { category: "Nimbers", name: "Single green = *",
      position: _testStalk([G]), expected: "*",
      check: (v) => v.label === "*" && v.kind === "nimber" },
    { category: "Nimbers", name: "G,G = *2",
      position: _testStalk([G, G]), expected: "*2",
      check: (v) => v.label === "*2" && v.kind === "nimber" },
    { category: "Nimbers", name: "G,G,G = *3",
      position: _testStalk([G, G, G]), expected: "*3",
      check: (v) => v.label === "*3" && v.kind === "nimber" },
    { category: "Nimbers", name: "*3 + *1 = *2 (Sprague-Grundy XOR)",
      position: _testCombine(_testStalk([G, G, G], "a"), _testStalk([G], "b")),
      expected: "*2",
      check: (v) => v.label === "*2" },

    // --- Composites ---
    { category: "Composites", name: "1 + (-1) = 0",
      position: _testCombine(_testStalk([B], "a"), _testStalk([R], "b")),
      expected: "0",
      check: (v) => v.number === "0" },
    { category: "Composites", name: "1/2 + 1/2 = 1",
      position: _testCombine(_testStalk([B, R], "a"), _testStalk([B, R], "b")),
      expected: "1",
      check: (v) => v.number === "1" },

    // --- Hot / switch ---
    { category: "Hot", name: "Green fork = first-player win (all-small, temperature 0 — not hot)",
      position: {
        nodes: [
          { id: "g", ground: true, x: 0, y: 0 },
          { id: "n0", ground: false, x: 0, y: 0 },
          { id: "n1", ground: false, x: 0, y: 0 },
          { id: "n2", ground: false, x: 0, y: 0 },
        ],
        edges: [
          { id: "e0", a: "g", b: "n0", color: G, stable: false },
          { id: "e1", a: "n0", b: "n1", color: B, stable: false },
          { id: "e2", a: "n0", b: "n2", color: R, stable: false },
        ],
      },
      expected: "fuzzy, outcome N (first-player wins)",
      check: (v) => v.relationToZero === "fuzzy" && v.outcomeClass === "N" },
    { category: "Hot", name: "Half plus star = { 1/2 | 1/2 } (tepid: that is 1/2 + *, temperature 0)",
      position: _testCombine(_testStalk([B, R], "a"), _testStalk([G], "b")),
      expected: "mean 1/2, temperature 0",
      check: (v) => v.kind === "switch" || v.label.includes("1/2") },

    // --- Infinite / transfinite ---
    { category: "Transfinite", name: "Infinite blue = ω",
      position: _testInfEdge(B), expected: "ω",
      check: (v) => v.label === "ω" },
    { category: "Transfinite", name: "Infinite red = -ω",
      position: _testInfEdge(R), expected: "-ω",
      check: (v) => v.label === "-ω" },
    { category: "Transfinite", name: "Infinite green = ω*",
      position: _testInfEdge(G), expected: "ω*",
      check: (v) => v.label === "ω*" },
    { category: "Transfinite", name: "ω + (-1) = ω-1",
      position: _testCombine(_testInfEdge(B, "a"), _testStalk([R], "b")),
      expected: "ω-1",
      check: (v) => v.label === "ω-1" },
    { category: "Transfinite", name: "ω + ω = 2ω",
      position: _testCombine(_testInfEdge(B, "a"), _testInfEdge(B, "b")),
      expected: "2ω",
      check: (v) => v.label === "2ω" },

    // --- Regression guards (bugs we fixed) ---
    { category: "Regression", name: "Bridged twin ω's ≠ plain ω (bug A fix)",
      position: {
        nodes: [
          { id: "g0", ground: true, x: 0, y: 0 },
          { id: "g1", ground: true, x: 0, y: 0 },
          { id: "t0", ground: false, x: 0, y: 0 },
          { id: "t1", ground: false, x: 0, y: 0 },
        ],
        edges: [
          { id: "i0", a: "g0", b: "t0", color: B, stable: false, infinite: true, pattern: "stalk" },
          { id: "br", a: "t0", b: "t1", color: B, stable: false },
          { id: "i1", a: "g1", b: "t1", color: B, stable: false, infinite: true, pattern: "stalk" },
        ],
      },
      expected: "not ω and gt 0",
      check: (v) => v.label !== "ω" && v.relationToZero === "gt" },
    { category: "Regression", name: "Fan of 2 inf-blues on finite stem ≠ 2ω (bug A fix)",
      position: {
        nodes: [
          { id: "g", ground: true, x: 0, y: 0 },
          { id: "h", ground: false, x: 0, y: 0 },
          { id: "t0", ground: false, x: 0, y: 0 },
          { id: "t1", ground: false, x: 0, y: 0 },
        ],
        edges: [
          { id: "stem", a: "g", b: "h", color: B, stable: false },
          { id: "i0", a: "h", b: "t0", color: B, stable: false, infinite: true, pattern: "stalk" },
          { id: "i1", a: "h", b: "t1", color: B, stable: false, infinite: true, pattern: "stalk" },
        ],
      },
      expected: "not 2ω and gt 0",
      check: (v) => v.label !== "2ω" && v.relationToZero === "gt" },
    { category: "Regression", name: "Grass-3 + 1 preserves the finite (bug C fix)",
      position: _testCombine(
        {
          nodes: [
            { id: "gg", ground: true, x: 0, y: 0 },
            { id: "a", ground: false, x: 0, y: 0 },
            { id: "b", ground: false, x: 0, y: 0 },
            { id: "c", ground: false, x: 0, y: 0 },
          ],
          edges: [
            { id: "g1", a: "gg", b: "a", color: G, stable: false, infinite: true, pattern: "grass" },
            { id: "g2", a: "gg", b: "b", color: G, stable: false, infinite: true, pattern: "grass" },
            { id: "g3", a: "gg", b: "c", color: G, stable: false, infinite: true, pattern: "grass" },
          ],
        },
        _testStalk([B], "bl")
      ),
      expected: "not bare ω*[3 stalks]",
      check: (v) => v.label !== "ω*[3 stalks]" },

    // --- Preset gallery sanity checks ---
    { category: "Gallery", name: "Half preset = 1/2", presetId: "half", expected: "1/2",
      check: (v) => v.number === "1/2" },
    { category: "Gallery", name: "Star preset = *", presetId: "star", expected: "*",
      check: (v) => v.label === "*" },
    { category: "Gallery", name: "Quarter preset = 1/4", presetId: "quarter", expected: "1/4",
      check: (v) => v.number === "1/4" },
    { category: "Gallery", name: "Grass-5 preset = ω*[5 stalks]", presetId: "grass-5", expected: "ω*[5 stalks]",
      check: (v) => v.label === "ω*[5 stalks]" },
    { category: "Gallery", name: "Omega preset = ω", presetId: "omega", expected: "ω",
      check: (v) => v.label === "ω" },
    { category: "Gallery", name: "Omega+3 preset = ω+3", presetId: "omega-plus-3", expected: "ω+3",
      check: (v) => v.label === "ω+3" },
    { category: "Gallery", name: "Omega² preset = ω²", presetId: "omega-squared", expected: "ω²",
      check: (v) => v.label === "ω²" },
    { category: "Gallery", name: "Balanced Marathon = 0 (second-player win)",
      presetId: "balanced-marathon", expected: "0",
      check: (v) => v.number === "0" && v.relationToZero === "eq" },
    { category: "Gallery", name: "One Eighth preset = 1/8",
      presetId: "one-eighth", expected: "1/8",
      check: (v) => v.kind === "number" && v.number === "1/8" },
    { category: "Gallery", name: "Red Three preset = -3 (mirror of Blue Three)",
      presetId: "red-three", expected: "-3",
      check: (v) => v.kind === "number" && v.number === "-3" && v.relationToZero === "lt" },
    { category: "Gallery", name: "Mixed Trio preset = 5/4 (1 + 1/2 - 1/4)",
      presetId: "mixed-trio", expected: "5/4",
      check: (v) => v.kind === "number" && v.number === "5/4" },
    { category: "Gallery", name: "Fraction Cascade preset = 7/8 (1/2 + 1/4 + 1/8)",
      presetId: "fraction-cascade", expected: "7/8",
      check: (v) => v.kind === "number" && v.number === "7/8" },
    { category: "Gallery", name: "Tight Race preset = 1/2 (2 + (-2) + 1/2 cancellation)",
      presetId: "tight-race", expected: "1/2",
      check: (v) => v.kind === "number" && v.number === "1/2" && v.relationToZero === "gt" },
    { category: "Gallery", name: "Mirror Twin preset = 0 (5/8 + (-5/8) cancellation)",
      presetId: "mirror-twin", expected: "0",
      check: (v) => v.kind === "number" && v.number === "0" && v.relationToZero === "eq" },
    { category: "Gallery", name: "Twin Greens preset = 0 (*3 + *3 = 0)",
      presetId: "twin-greens", expected: "0",
      check: (v) => v.number === "0" || v.label === "0" },
    { category: "Gallery", name: "Nimber Symphony preset = 0 (*3 ⊕ *5 ⊕ *6 = 0)",
      presetId: "nimber-symphony", expected: "0",
      check: (v) => v.number === "0" || v.label === "0" },
    { category: "Gallery", name: "Nimber Cascade preset = *7 (1+2+4 XOR)",
      presetId: "nimber-cascade", expected: "*7",
      check: (v) => v.label === "*7" && v.kind === "nimber" },
    { category: "Gallery", name: "Long Cold Race preset = 0 (4 blue + 4 red cancel)",
      presetId: "long-cold-race", expected: "0",
      check: (v) => v.number === "0" && v.relationToZero === "eq" },

    // --- Construction path / Sign expansion ---
    { category: "Construction", name: "Construction path is bounded (5/8 born day 4)",
      position: _testStalk([B, R, B, R]),
      expected: "constructionPath length ≤ 6",
      check: (v) => Array.isArray(v.constructionPath) && v.constructionPath.length >= 1 && v.constructionPath.length <= 6 },
    { category: "Construction", name: "Construction path final value matches number",
      position: _testStalk([B, R]),
      expected: "last step.value = '1/2'",
      check: (v) => v.constructionPath && v.constructionPath[v.constructionPath.length - 1].value === "1/2" },
    { category: "Construction", name: "Construction birthday matches path length",
      position: _testStalk([B, R, B]),
      expected: "birthday = path length - 1 (day count)",
      check: (v) => Number.isInteger(v.birthday) && v.constructionPath && v.birthday === v.constructionPath[v.constructionPath.length - 1].day },

    // --- Sign expansion (Conway's L/R binary) ---
    { category: "SignExpansion", name: "Sign expansion of 1 = '+'",
      position: _testStalk([B]),
      expected: "+",
      check: (v) => v.signExpansion === "+" },
    { category: "SignExpansion", name: "Sign expansion of 1/2 = '+-'",
      position: _testStalk([B, R]),
      expected: "+-",
      check: (v) => v.signExpansion === "+-" },
    { category: "SignExpansion", name: "Sign expansion of 3/4 = '+-+'",
      position: _testStalk([B, R, B]),
      expected: "+-+",
      check: (v) => v.signExpansion === "+-+" },
    { category: "SignExpansion", name: "Sign expansion of 1/4 = '+--'",
      position: _testStalk([B, R, R]),
      expected: "+--",
      check: (v) => v.signExpansion === "+--" },
    { category: "SignExpansion", name: "Sign expansion of 5/8 = '+-+-'",
      position: _testStalk([B, R, B, R]),
      expected: "+-+-",
      check: (v) => v.signExpansion === "+-+-" },
    { category: "SignExpansion", name: "Sign expansion of -1 = '-'",
      position: _testStalk([R]),
      expected: "-",
      check: (v) => v.signExpansion === "-" },
    { category: "SignExpansion", name: "Sign expansion of 0 = '' (empty)",
      position: _testCombine(_testStalk([B], "a"), _testStalk([R], "b")),
      expected: "(empty)",
      check: (v) => v.signExpansion === "" || v.signExpansion === null },

    // --- Atomic weight ---
    { category: "AtomicWeight", name: "Atomic weight of 0 = 0",
      position: { nodes: [{ id: "g", ground: true, x: 0, y: 0 }], edges: [] },
      expected: "0",
      check: (v) => v.atomicWeight === 0 },
    { category: "AtomicWeight", name: "Atomic weight of * = 0",
      position: _testStalk([G]),
      expected: "0",
      check: (v) => v.atomicWeight === 0 },
    { category: "AtomicWeight", name: "Atomic weight of *2 = 0",
      position: _testStalk([G, G]),
      expected: "0",
      check: (v) => v.atomicWeight === 0 },
    { category: "AtomicWeight", name: "Atomic weight of integer 1 = null (not all-small)",
      position: _testStalk([B]),
      expected: "null",
      check: (v) => v.atomicWeight === null || v.atomicWeight === undefined },

    // --- Multi-edge + floating + chain-curve visual invariants ---
    // These use the analyzer as a spec: even though the user sees a visual
    // defect, the engine's normalization must treat these cleanly.
    { category: "Structural", name: "Parallel 2 blues between same nodes = 2",
      position: {
        nodes: [
          { id: "g", ground: true, x: 0, y: 0 },
          { id: "t", ground: false, x: 0, y: 0 },
        ],
        edges: [
          { id: "e0", a: "g", b: "t", color: B, stable: false },
          { id: "e1", a: "g", b: "t", color: B, stable: false },
        ],
      },
      expected: "2",
      check: (v) => v.number === "2" },
    { category: "Structural", name: "Parallel opposite-direction edges still = 2",
      position: {
        nodes: [
          { id: "g", ground: true, x: 0, y: 0 },
          { id: "t", ground: false, x: 0, y: 0 },
        ],
        edges: [
          { id: "e0", a: "g", b: "t", color: B, stable: false },
          { id: "e1", a: "t", b: "g", color: B, stable: false },
        ],
      },
      expected: "2",
      check: (v) => v.number === "2" },
    { category: "Structural", name: "Floating non-ground vertex doesn't break analysis",
      position: {
        nodes: [
          { id: "g", ground: true, x: 0, y: 0 },
          { id: "t", ground: false, x: 0, y: 0 },
          { id: "lonely", ground: false, x: 0, y: 0 },
        ],
        edges: [
          { id: "e0", a: "g", b: "t", color: B, stable: false },
        ],
      },
      expected: "1 (lonely pruned)",
      check: (v) => v.number === "1" },
    { category: "Structural", name: "Chain of 3 blue segments = 3",
      position: _testStalk([B, B, B]),
      expected: "3",
      check: (v) => v.number === "3" },
    { category: "Structural", name: "Self-loop edge prunes cleanly",
      position: {
        nodes: [
          { id: "g", ground: true, x: 0, y: 0 },
          { id: "t", ground: false, x: 0, y: 0 },
        ],
        edges: [
          { id: "stem", a: "g", b: "t", color: B, stable: false },
          { id: "loop", a: "t", b: "t", color: B, stable: false },
        ],
      },
      expected: "no crash",
      check: (v) => v.relationToZero !== undefined },
    { category: "Structural", name: "Empty-then-node (floating ground) = 0",
      position: { nodes: [
        { id: "g", ground: true, x: 0, y: 0 },
        { id: "g2", ground: true, x: 0, y: 0 },
      ], edges: [] },
      expected: "0",
      check: (v) => v.number === "0" },

    // --- Loopy games ---
    { category: "Loopy", name: "Blue loop edge = on",
      position: {
        nodes: [
          { id: "g", ground: true, x: 0, y: 0 },
          { id: "t", ground: false, x: 0, y: 0 },
        ],
        edges: [{ id: "e", a: "g", b: "t", color: B, stable: false, loop: true }],
      },
      expected: "on",
      check: (v) => v.kind === "loopy" && v.label === "on" && v.relationToZero === "gt" },
    { category: "Loopy", name: "Red loop edge = off",
      position: {
        nodes: [
          { id: "g", ground: true, x: 0, y: 0 },
          { id: "t", ground: false, x: 0, y: 0 },
        ],
        edges: [{ id: "e", a: "g", b: "t", color: R, stable: false, loop: true }],
      },
      expected: "off",
      check: (v) => v.kind === "loopy" && v.label === "off" && v.relationToZero === "lt" },
    { category: "Loopy", name: "Green loop edge = dud (draw)",
      position: {
        nodes: [
          { id: "g", ground: true, x: 0, y: 0 },
          { id: "t", ground: false, x: 0, y: 0 },
        ],
        edges: [{ id: "e", a: "g", b: "t", color: G, stable: false, loop: true }],
      },
      expected: "dud",
      check: (v) => v.kind === "loopy" && v.label === "dud" && v.relationToZero === "draw" },
    { category: "Loopy", name: "on + off = dud (stalemate)",
      presetId: "loopy-on-off",
      expected: "dud",
      check: (v) => v.kind === "loopy" && v.label === "dud" },
    { category: "Loopy", name: "over + under = 0 (cancel)",
      presetId: "loopy-over-under",
      expected: "0",
      check: (v) => v.number === "0" || (v.kind === "loopy" && v.label === "dud") },
    { category: "Loopy", name: "on + finite blue = on (still Blue-dominant)",
      position: _testCombine(
        {
          nodes: [
            { id: "gg", ground: true, x: 0, y: 0 },
            { id: "tt", ground: false, x: 0, y: 0 },
          ],
          edges: [{ id: "ln", a: "gg", b: "tt", color: B, stable: false, loop: true }],
        },
        _testStalk([B], "b")
      ),
      expected: "on+1",
      check: (v) => v.kind === "loopy" && v.label === "on+1" && v.relationToZero === "gt" },
    { category: "Loopy", name: "over is > 0",
      position: {
        nodes: [
          { id: "g", ground: true, x: 0, y: 0 },
          { id: "t", ground: false, x: 0, y: 0 },
        ],
        edges: [{ id: "e", a: "g", b: "t", color: B, stable: false, loop: true, loopKind: "over" }],
      },
      expected: "over, gt 0",
      check: (v) => v.kind === "loopy" && v.label === "over" && v.relationToZero === "gt" },
    { category: "Loopy", name: "under is < 0",
      position: {
        nodes: [
          { id: "g", ground: true, x: 0, y: 0 },
          { id: "t", ground: false, x: 0, y: 0 },
        ],
        edges: [{ id: "e", a: "g", b: "t", color: R, stable: false, loop: true, loopKind: "under" }],
      },
      expected: "under, lt 0",
      check: (v) => v.kind === "loopy" && v.label === "under" && v.relationToZero === "lt" },
    { category: "Loopy", name: "Loopy On preset = on",
      presetId: "loopy-on", expected: "on",
      check: (v) => v.kind === "loopy" && v.label === "on" },
    { category: "Loopy", name: "Loopy Dud preset = dud (draw outcome)",
      presetId: "loopy-dud", expected: "dud",
      check: (v) => v.kind === "loopy" && v.outcomeClass === "D" },

    // --- Loopy + Transfinite domination ---
    // Regression tests for a bug where multi-component sums of (general short
    // game) + (ω) + (over/under loop) silently dropped the ω contribution.
    // The intermediate sum (general + ω) loses its `infinite` flag, then the
    // next sumGames(compound, loopy) hits the "loopy + general" branch which
    // returns just the loopy value — making the engine report Blue is losing
    // when ω clearly dominates over/under.
    { category: "Loopy", name: "ω + under = ω (transfinite dominates loopy infinitesimal)",
      position: _testCombine(
        _testInfEdge(B, "om"),
        {
          nodes: [
            { id: "u-g", ground: true, x: 0, y: 0 },
            { id: "u-t", ground: false, x: 0, y: 0 },
          ],
          edges: [{ id: "u-e", a: "u-g", b: "u-t", color: R, stable: false, loop: true, loopKind: "under" }],
        },
      ),
      expected: "ω, gt 0",
      check: (v) => v.relationToZero === "gt" && (v.label === "ω" || v.kind === "infinite") },
    { category: "Loopy", name: "Green-fork + ω + under = Blue wins (ω dominates the loopy)",
      position: _testCombine(
        // Mini green-fork: ground → junction (green), junction → tip-blue (blue), junction → tip-red (red)
        {
          nodes: [
            { id: "f-g", ground: true, x: 0, y: 0 },
            { id: "f-j", ground: false, x: 0, y: 0 },
            { id: "f-tb", ground: false, x: 0, y: 0 },
            { id: "f-tr", ground: false, x: 0, y: 0 },
          ],
          edges: [
            { id: "f-eg", a: "f-g", b: "f-j", color: G, stable: false },
            { id: "f-eb", a: "f-j", b: "f-tb", color: B, stable: false },
            { id: "f-er", a: "f-j", b: "f-tr", color: R, stable: false },
          ],
        },
        _testInfEdge(B, "om"),
        {
          nodes: [
            { id: "u-g", ground: true, x: 0, y: 0 },
            { id: "u-t", ground: false, x: 0, y: 0 },
          ],
          edges: [{ id: "u-e", a: "u-g", b: "u-t", color: R, stable: false, loop: true, loopKind: "under" }],
        },
      ),
      expected: "Blue wins (gt)",
      check: (v) => v.relationToZero === "gt" },
    { category: "Loopy", name: "ω + over = ω (transfinite dominates positive loopy infinitesimal)",
      position: _testCombine(
        _testInfEdge(B, "om"),
        {
          nodes: [
            { id: "ov-g", ground: true, x: 0, y: 0 },
            { id: "ov-t", ground: false, x: 0, y: 0 },
          ],
          edges: [{ id: "ov-e", a: "ov-g", b: "ov-t", color: B, stable: false, loop: true, loopKind: "over" }],
        },
      ),
      expected: "ω, gt 0",
      check: (v) => v.relationToZero === "gt" && (v.label === "ω" || v.kind === "infinite") },
    { category: "Loopy", name: "ω + on = on (perpetual loop dominates transfinite)",
      position: _testCombine(
        _testInfEdge(B, "om"),
        {
          nodes: [
            { id: "on-g", ground: true, x: 0, y: 0 },
            { id: "on-t", ground: false, x: 0, y: 0 },
          ],
          edges: [{ id: "on-e", a: "on-g", b: "on-t", color: B, stable: false, loop: true }],
        },
      ),
      expected: "on, gt 0",
      check: (v) => v.relationToZero === "gt" && v.kind === "loopy" && v.label === "on" },

    // --- Thermograph ---
    { category: "Thermograph", name: "Cold number 1/2 has thermograph (frozen vertical)",
      position: _testStalk([B, R]),
      expected: "thermograph with temp = -1, mean ≈ 0.5",
      check: (v) => v.thermograph && Math.abs(v.thermograph.mean - 0.5) < 1e-6 && v.thermograph.temperature === -1 },
    { category: "Thermograph", name: "Integer 2 has cold thermograph at x = 2",
      position: _testStalk([B, B]),
      expected: "frozen at 2",
      check: (v) => v.thermograph && Math.abs(v.thermograph.mean - 2) < 1e-6 && v.thermograph.temperature === -1 },
    { category: "Thermograph", name: "Negative integer -1 has cold thermograph at -1",
      position: _testStalk([R]),
      expected: "frozen at -1",
      check: (v) => v.thermograph && Math.abs(v.thermograph.mean - (-1)) < 1e-6 && v.thermograph.temperature === -1 },
    { category: "Thermograph", name: "Half plus star has thermograph with mean 0.5",
      presetId: "half-plus-star",
      expected: "mean ≈ 0.5",
      check: (v) => v.thermograph && Math.abs(v.thermograph.mean - 0.5) < 1e-3 },
    { category: "Thermograph", name: "Two plus star has thermograph with mean 2",
      presetId: "two-plus-star",
      expected: "mean ≈ 2",
      check: (v) => v.thermograph && Math.abs(v.thermograph.mean - 2) < 1e-3 },
    { category: "Thermograph", name: "Loopy / infinite games skip thermograph",
      presetId: "omega",
      expected: "thermograph absent",
      check: (v) => v.thermograph == null },
    { category: "Thermograph", name: "Thermograph has both walls as ordered points",
      position: _testStalk([B, R]),
      expected: "leftWall + rightWall arrays, ordered by t",
      check: (v) => Array.isArray(v.thermograph?.leftWall) && Array.isArray(v.thermograph?.rightWall) && v.thermograph.leftWall.every((p, i, a) => i === 0 || p.t >= a[i - 1].t) },

    // --- Shareable URL round-trip ---
    { category: "ShareableURL", name: "Encode/decode round-trip preserves a stalk",
      position: _testStalk([B, R]),
      expected: "round-trip identical structure",
      check: () => {
        const original = _testStalk([B, R]);
        const encoded = encodePositionToHash(original);
        const decoded = decodeHashToPosition(encoded);
        if (!decoded) return false;
        return decoded.nodes.length === original.nodes.length &&
               decoded.edges.length === original.edges.length &&
               decoded.edges.every((e, i) => e.color === original.edges[i].color && e.a === original.edges[i].a && e.b === original.edges[i].b);
      } },
    { category: "ShareableURL", name: "Round-trip preserves stable + infinite + loop attributes",
      position: { nodes: [{ id: "g", ground: true, x: 0, y: 0 }], edges: [] },
      expected: "all flags preserved",
      check: () => {
        const original = {
          nodes: [{ id: "g", ground: true, x: 100, y: 200 }, { id: "t", ground: false, x: 300, y: 400 }],
          edges: [{ id: "e", a: "g", b: "t", color: B, stable: true, infinite: true, loop: true, loopKind: "over" }],
        };
        const encoded = encodePositionToHash(original);
        const decoded = decodeHashToPosition(encoded);
        if (!decoded || decoded.edges.length !== 1) return false;
        const e = decoded.edges[0];
        return e.stable === true && e.infinite === true && e.loop === true && e.loopKind === "over";
      } },
    { category: "ShareableURL", name: "Decoding garbage returns null (no crash)",
      position: { nodes: [], edges: [] },
      expected: "null on invalid input",
      check: () => decodeHashToPosition("not-real-base64!!!") === null && decodeHashToPosition("") === null },
    { category: "ShareableURL", name: "Encoded chars are URL-safe (no + / =)",
      position: _testStalk([B, R, B, R]),
      expected: "alphabet within [A-Za-z0-9_-]",
      check: () => {
        const enc = encodePositionToHash(_testStalk([B, R, B, R]));
        return /^[A-Za-z0-9_\-]+$/.test(enc);
      } },
  ];
}

function runSelfTests() {
  if (!refs.selfTestPanel) return;
  refs.selfTestPanel.style.display = "block";
  refs.selfTestSummary.textContent = "Running…";
  refs.selfTestList.innerHTML = "";

  const cases = getSelfTestCases();
  const results = [];
  const presets = exampleLibrary();

  for (const testCase of cases) {
    const t0 = performance.now();
    let actual = null;
    let label = "(n/a)";
    let pass = false;
    let error = null;
    try {
      let position = testCase.position;
      if (testCase.presetId) {
        const preset = presets.find((p) => p.id === testCase.presetId);
        if (!preset || !preset.position) {
          throw new Error(`preset '${testCase.presetId}' not found or not loadable`);
        }
        position = clonePosition(preset.position);
      }
      const analysis = analyzePosition(position, undefined, { verbose: false });
      actual = analysis.value;
      label = actual.label ?? actual.number ?? "(no label)";
      pass = Boolean(testCase.check(actual));
    } catch (err) {
      error = err?.message || String(err);
    }
    const elapsed = Math.round(performance.now() - t0);
    results.push({
      category: testCase.category,
      name: testCase.name,
      expected: testCase.expected,
      actual: label,
      pass,
      error,
      elapsed,
    });
  }

  const passCount = results.filter((r) => r.pass).length;
  const total = results.length;
  const totalTime = results.reduce((s, r) => s + r.elapsed, 0);
  refs.selfTestSummary.innerHTML = `
    <div class="self-test-stats">
      <strong class="${passCount === total ? "all-pass" : "some-fail"}">${passCount}/${total}</strong> passed
      <span class="meta-chip">${totalTime}ms total</span>
    </div>`;

  const byCategory = new Map();
  for (const r of results) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category).push(r);
  }

  const rows = [];
  for (const [cat, list] of byCategory.entries()) {
    const catPass = list.filter((r) => r.pass).length;
    rows.push(`<div class="self-test-category">
      <h3>${escapeHtml(cat)} <span class="meta-chip">${catPass}/${list.length}</span></h3>
      <ul>${list.map((r) => `
        <li class="self-test-row ${r.pass ? "is-pass" : "is-fail"}">
          <span class="self-test-indicator">${r.pass ? "✓" : "✗"}</span>
          <div class="self-test-body">
            <strong>${escapeHtml(r.name)}</strong>
            <div class="self-test-line">
              <span class="self-test-label">Expected:</span>
              <code>${escapeHtml(String(r.expected))}</code>
            </div>
            <div class="self-test-line">
              <span class="self-test-label">Actual:</span>
              <code>${escapeHtml(String(r.actual))}</code>
            </div>
            ${r.error ? `<div class="self-test-error">${escapeHtml(r.error)}</div>` : ""}
            <span class="self-test-meta">${r.elapsed}ms</span>
          </div>
        </li>`).join("")}
      </ul>
    </div>`);
  }
  refs.selfTestList.innerHTML = rows.join("");

  if (refs.selfTestPanel.scrollIntoView) {
    refs.selfTestPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ── Wire Events ──

function wireEvents() {
  refs.modeToggle.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (btn) setMode(btn.dataset.mode);
  });

  refs.toolButtons.addEventListener("click", (e) => {
    const tb = e.target.closest("[data-tool]");
    if (tb) setTool(tb.dataset.tool);
  });

  refs.colorButtons.addEventListener("click", (e) => {
    const cb = e.target.closest("[data-color]");
    if (!cb) return;
    state.edgeColor = cb.dataset.color;
    // If an edge is selected in Create mode, recolor it in place.
    if (state.mode === "edit" && state.selectedEdgeId) {
      const edge = state.position.edges.find((ed) => ed.id === state.selectedEdgeId);
      if (edge) { edge.color = cb.dataset.color; render(); scheduleAnalysis(false); recordCreateHistory(); return; }
    }
    renderControls();
  });

  refs.turnButtons.addEventListener("click", (e) => {
    const sb = e.target.closest("[data-side]");
    if (sb) { state.sideToMove = sb.dataset.side; render(); }
  });

  refs.playerSideButtons.addEventListener("click", (e) => {
    const pb = e.target.closest("[data-player-side]");
    if (pb) { state.play.userSide = pb.dataset.playerSide; render(); }
  });

  refs.startingSideButtons.addEventListener("click", (e) => {
    const sb = e.target.closest("[data-starting-side]");
    if (sb) {
      state.play.startingSide = sb.dataset.startingSide;
      if (!isPlayActive()) state.sideToMove = state.play.startingSide;
      render();
    }
  });

  // Header quick toggles (Play). "You play" picks your side; flipping it keeps
  // the "you move first" relationship stable. "You move first" sets who starts.
  if (refs.quickUserSide) {
    refs.quickUserSide.addEventListener("click", (e) => {
      const b = e.target.closest("[data-quick-side]");
      if (!b) return;
      const wasYouFirst = state.play.startingSide === state.play.userSide;
      state.play.userSide = b.dataset.quickSide;
      state.play.startingSide = wasYouFirst ? state.play.userSide : otherSide(state.play.userSide);
      // Mid-match: restart the same game with the new side. Otherwise just sync.
      if (isPlayActive()) { restartPlaySession(); return; }
      state.sideToMove = state.play.startingSide;
      render();
    });
  }
  if (refs.quickFirstToggle) {
    refs.quickFirstToggle.addEventListener("click", () => {
      const youFirst = state.play.startingSide === state.play.userSide;
      state.play.startingSide = youFirst ? otherSide(state.play.userSide) : state.play.userSide;
      if (isPlayActive()) { restartPlaySession(); return; }
      state.sideToMove = state.play.startingSide;
      render();
    });
  }

  refs.stableToggle.addEventListener("change", () => { state.stableEdge = refs.stableToggle.checked; });

  if (refs.edgeInfoToggle) {
    refs.edgeInfoToggle.addEventListener("change", () => {
      state.showEdgeInfo = refs.edgeInfoToggle.checked;
      updateEdgeTooltip();
    });
  }

  if (refs.verboseToggle) {
    refs.verboseToggle.addEventListener("change", () => {
      state.showVerbose = refs.verboseToggle.checked;
      // Verbose toggling shouldn't return a cached non-verbose result.
      clearAnalysisCache();
      scheduleAnalysis(true);
    });
  }

  if (refs.showSuggestionsToggle) {
    refs.showSuggestionsToggle.addEventListener("change", () => {
      state.showSuggestions = refs.showSuggestionsToggle.checked;
      if (!state.showSuggestions) state.showMoveDetails = false;
      render();
    });
  }

  if (refs.tellMeMoreButton) {
    refs.tellMeMoreButton.addEventListener("click", () => {
      state.showMoveDetails = !state.showMoveDetails;
      refs.tellMeMoreButton.textContent = state.showMoveDetails ? "Hide Details" : "Tell Me More";
      render();
    });
  }

  refs.playSuggestedButton.addEventListener("click", playSuggestedMove);
  if (refs.startMatchButton) refs.startMatchButton.addEventListener("click", beginPlaySession);
  if (refs.createStartButton) {
    refs.createStartButton.addEventListener("click", () => { beginPlaySession(); setMode("play"); });
  }
  refs.restartMatchButton.addEventListener("click", restartPlaySession);
  refs.endMatchButton.addEventListener("click", () => { endPlaySession(); setMode("edit"); });
  if (refs.undoButton) refs.undoButton.addEventListener("click", undoCreate);
  if (refs.redoButton) refs.redoButton.addEventListener("click", redoCreate);
  refs.clearButton.addEventListener("click", () => { clearInkMarks(); setPosition(emptyPosition(), true); });
  if (refs.randomButton) {
    refs.randomButton.addEventListener("click", () => {
      // Smart roll: keep re-rolling until we get a non-trivial position
      // (≥ 2★ complexity or non-integer value or multi-component).
      setPosition(generateInterestingPuzzle(), true);
    });
  }
  if (refs.playNewPuzzleButton) {
    refs.playNewPuzzleButton.addEventListener("click", () => {
      // Same generator; if we're in an active match, end it first so the
      // new position is staged cleanly.
      if (state.play.active) {
        endPlaySession();
      }
      setPosition(generateInterestingPuzzle(), true);
    });
  }
  if (refs.hardPuzzleButton) {
    refs.hardPuzzleButton.addEventListener("click", () => {
      setPosition(generateChallengingPuzzle(), true);
    });
  }
  if (refs.playHardPuzzleButton) {
    refs.playHardPuzzleButton.addEventListener("click", () => {
      if (state.play.active) endPlaySession();
      setPosition(generateChallengingPuzzle(), true);
    });
  }
  if (refs.aiStrengthSelect) {
    refs.aiStrengthSelect.addEventListener("change", (ev) => {
      state.aiStrength = ev.target.value;
      savePrefs();
    });
  }
  // Two checkboxes (one per mode) drive the same showMoveValues flag and stay
  // in sync with each other.
  const onShowMoveValuesChange = (ev) => {
    state.showMoveValues = !!ev.target.checked;
    if (refs.showMoveValuesToggle && refs.showMoveValuesToggle !== ev.target) {
      refs.showMoveValuesToggle.checked = state.showMoveValues;
    }
    if (refs.showMoveValuesTogglePlay && refs.showMoveValuesTogglePlay !== ev.target) {
      refs.showMoveValuesTogglePlay.checked = state.showMoveValues;
    }
    renderBoard();
    savePrefs();
  };
  if (refs.showMoveValuesToggle) {
    refs.showMoveValuesToggle.addEventListener("change", onShowMoveValuesChange);
  }
  if (refs.showMoveValuesTogglePlay) {
    refs.showMoveValuesTogglePlay.addEventListener("change", onShowMoveValuesChange);
  }
  if (refs.shareButton) {
    refs.shareButton.addEventListener("click", copyShareUrl);
  }
  refs.dumpJsonButton.addEventListener("click", dumpJson);
  refs.loadJsonButton.addEventListener("click", loadJson);
  if (refs.runTestsButton) {
    refs.runTestsButton.addEventListener("click", runSelfTests);
  }
  if (refs.roadmapToggle) {
    refs.roadmapToggle.addEventListener("click", toggleRoadmap);
  }
  if (refs.shortcutsBtn) refs.shortcutsBtn.addEventListener("click", openShortcuts);
  if (refs.shortcutsClose) refs.shortcutsClose.addEventListener("click", closeShortcuts);
  if (refs.shortcutsOverlay) {
    refs.shortcutsOverlay.addEventListener("click", (ev) => {
      if (ev.target === refs.shortcutsOverlay) closeShortcuts();
    });
  }
  if (refs.chordModeButtons) {
    refs.chordModeButtons.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-chord]");
      if (!btn) return;
      state.chordMode = btn.dataset.chord;
      state.extraSignature = null;
      savePrefs();
      renderExtraAnalysis();
    });
  }
  if (refs.reasoningToggle) {
    refs.reasoningToggle.addEventListener("click", () => {
      state.liveReasoning = !state.liveReasoning;
      state.extraSignature = null;
      savePrefs();
      renderExtraAnalysis();
    });
  }
  document.addEventListener("keydown", handleGlobalKeydown);

  // Auto mode controls
  if (refs.autoNewGameButton) {
    refs.autoNewGameButton.addEventListener("click", startAutoGame);
  }
  if (refs.autoPauseButton) {
    refs.autoPauseButton.addEventListener("click", pauseAutoMode);
  }
  if (refs.autoStopButton) {
    refs.autoStopButton.addEventListener("click", stopAutoMode);
  }
  if (refs.autoSpeedSelect) {
    refs.autoSpeedSelect.addEventListener("change", () => {
      state.auto.speed = parseInt(refs.autoSpeedSelect.value, 10);
    });
  }

  // Animation mode buttons (all groups)
  document.querySelectorAll(".anim-mode-group").forEach((group) => {
    group.addEventListener("click", (e) => {
      const animBtn = e.target.closest("[data-anim]");
      if (animBtn) {
        state.animationMode = animBtn.dataset.anim;
        render();
        savePrefs();
        return;
      }
      // Visual style buttons live in the same anim-mode-group container so the
      // existing "is-active" highlight logic can be reused. We just route the
      // click to the right state field by data-attribute.
      //
      // IMPORTANT: scope `closest()` to BUTTONS, not bare attribute selectors.
      // applyVisualStyles() sets data-node-style on <html>, which a bare
      // `[data-node-style]` closest() match would walk up to and falsely
      // claim, hijacking the edge-style branch.
      const nodeBtn = e.target.closest("button[data-node-style]");
      if (nodeBtn) {
        state.nodeStyle = nodeBtn.dataset.nodeStyle;
        applyVisualStyles();
        renderControls();
        savePrefs();
        return;
      }
      const edgeBtn = e.target.closest("button[data-edge-style]");
      if (edgeBtn) {
        state.edgeStyle = edgeBtn.dataset.edgeStyle;
        applyVisualStyles();
        renderControls();
        savePrefs();
        return;
      }
      const boardBtn = e.target.closest("button[data-board-style]");
      if (boardBtn) {
        state.boardStyle = boardBtn.dataset.boardStyle;
        applyVisualStyles();
        renderControls();
        savePrefs();
      }
    });
  });

  // Foldable effect/style controls: a "More effects" toggle reveals/hides the
  // folded groups (Cut FX list, Shape-Locked, Visuals) in the same toolbar row.
  document.querySelectorAll(".fx-fold-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const row = btn.closest(".toolbar-row");
      if (!row) return;
      const foldables = [...row.querySelectorAll(".fx-foldable")];
      const willShow = foldables.some((el) => el.classList.contains("fx-hidden"));
      foldables.forEach((el) => el.classList.toggle("fx-hidden", !willShow));
      btn.setAttribute("aria-expanded", willShow ? "true" : "false");
      btn.textContent = willShow ? "Fewer effects" : "More effects";
    });
  });

  // Ink-mark persistence dropdowns (one per mode panel) stay in sync.
  document.querySelectorAll(".ink-mark-select").forEach((sel) => {
    sel.value = state.inkMarkMode;
    sel.addEventListener("change", () => {
      state.inkMarkMode = sel.value;
      document.querySelectorAll(".ink-mark-select").forEach((s) => { s.value = state.inkMarkMode; });
      savePrefs();
    });
  });

  refs.boardSvg.addEventListener("pointerdown", handleBoardPointerDown);
  refs.boardSvg.addEventListener("pointermove", handleBoardPointerMove);
  refs.boardSvg.addEventListener("pointerup", handleBoardPointerUp);
  refs.boardSvg.addEventListener("pointercancel", cancelBoardDrag);
  refs.boardSvg.addEventListener("pointerleave", () => {
    if (!state.dragging && setHoveredEdge(null)) renderBoard();
  });

  refs.boardSvg.addEventListener("contextmenu", (event) => {
    const edgeTarget = event.target.closest("[data-edge-id]");
    if (!edgeTarget) return;
    const edgeId = edgeTarget.dataset.edgeId;
    const edge = state.position.edges.find((e) => e.id === edgeId);
    if (!edge || !edge.infinite) return;
    // Auto mode is engine-driven — never hand-cut there.
    if (state.mode === "auto") return;
    // In a live match, only the side to move may cut, and only a playable edge,
    // so the precise cut can't bypass the game rules.
    if (isPlayActive() && (state.play.winner || !isUserTurn() || !edgeLooksPlayableFor(state.play.userSide, edge))) return;
    event.preventDefault();
    showInfiniteSlider(edge, event.clientX, event.clientY);
  });

  // Moves click/hover — edit mode panels
  for (const el of [refs.leftRecommendation, refs.rightRecommendation, refs.leftMoves, refs.rightMoves]) {
    el.addEventListener("click", handleMovesClick);
    el.addEventListener("mouseover", handleMovesHover);
    el.addEventListener("mouseleave", () => { if (setHoveredEdge(null)) renderBoard(); });
  }

  // Moves click/hover — play mode panels
  for (const el of [refs.playLeftRecommendation, refs.playRightRecommendation, refs.playLeftMoves, refs.playRightMoves]) {
    if (!el) continue;
    el.addEventListener("click", handleMovesClick);
    el.addEventListener("mouseover", handleMovesHover);
    el.addEventListener("mouseleave", () => { if (setHoveredEdge(null)) renderBoard(); });
  }

  refs.presetList.addEventListener("click", handlePresetClick);

  // Games library: search, category master selection, fold toggle.
  if (refs.librarySearch) {
    refs.librarySearch.addEventListener("input", () => filterLibrary());
  }
  if (refs.libMaster) {
    refs.libMaster.addEventListener("click", (e) => {
      const cb = e.target.closest("[data-category-select]");
      if (cb) selectCategory(cb.dataset.categorySelect);
    });
  }
  if (refs.libFoldBtn) {
    refs.libFoldBtn.addEventListener("click", () => {
      state.libraryCollapsed = !state.libraryCollapsed;
      renderControls();
      savePrefs();
    });
  }

  // Dismiss infinite slider on outside click
  document.addEventListener("pointerdown", (event) => {
    if (infSlider && !infSlider.el.contains(event.target)) {
      hideInfiniteSlider();
    }
  });
}

// ── Init ──

// Theme: tri-state preference (auto / light / dark). Persists to localStorage and
// follows the OS in "auto" mode. Runs before first render so nothing flashes in
// the wrong palette.
const THEME_STORAGE_KEY = "hackenbush-theme";
const THEME_CYCLE = ["auto", "light", "dark"];

function getStoredTheme() {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_CYCLE.includes(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

function persistTheme(theme) {
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* ignore */ }
}

// ── Preference persistence ──
// Remember the user's display/play choices across reloads (mirrors the theme
// persistence). Loaded once before first render; saved whenever one changes.
const PREFS_STORAGE_KEY = "hackenbush-prefs";

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_STORAGE_KEY) || "null");
    if (!p || typeof p !== "object") return;
    if (typeof p.animationMode === "string") state.animationMode = p.animationMode;
    if (typeof p.inkMarkMode === "string") state.inkMarkMode = p.inkMarkMode;
    if (typeof p.nodeStyle === "string") state.nodeStyle = p.nodeStyle;
    if (typeof p.edgeStyle === "string") state.edgeStyle = p.edgeStyle;
    if (typeof p.aiStrength === "string") state.aiStrength = p.aiStrength;
    if (typeof p.showMoveValues === "boolean") state.showMoveValues = p.showMoveValues;
    if (typeof p.libraryCollapsed === "boolean") state.libraryCollapsed = p.libraryCollapsed;
    if (typeof p.chordMode === "string") state.chordMode = p.chordMode;
    if (typeof p.liveReasoning === "boolean") state.liveReasoning = p.liveReasoning;
    if (typeof p.boardStyle === "string") state.boardStyle = p.boardStyle;
  } catch { /* ignore */ }
}

function savePrefs() {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({
      animationMode: state.animationMode,
      inkMarkMode: state.inkMarkMode,
      nodeStyle: state.nodeStyle,
      edgeStyle: state.edgeStyle,
      aiStrength: state.aiStrength,
      showMoveValues: state.showMoveValues,
      libraryCollapsed: state.libraryCollapsed,
      chordMode: state.chordMode,
      liveReasoning: state.liveReasoning,
      boardStyle: state.boardStyle,
    }));
  } catch { /* ignore */ }
}

// Sync the form controls that render() doesn't already drive from state.
function syncPrefControls() {
  if (refs.aiStrengthSelect) refs.aiStrengthSelect.value = state.aiStrength;
  if (refs.showMoveValuesToggle) refs.showMoveValuesToggle.checked = state.showMoveValues;
  if (refs.showMoveValuesTogglePlay) refs.showMoveValuesTogglePlay.checked = state.showMoveValues;
  document.querySelectorAll(".ink-mark-select").forEach((s) => { s.value = state.inkMarkMode; });
}

// Apply node/edge visual styles by setting data-attrs on the document root;
// CSS rules scoped to those attrs override the default `.node-body` /
// `.edge-main` styling. Cheap (no SVG re-render needed).
function applyVisualStyles() {
  const root = document.documentElement;
  root.dataset.nodeStyle = state.nodeStyle ?? "sphere";
  root.dataset.edgeStyle = state.edgeStyle ?? "solid";
  root.dataset.boardStyle = state.boardStyle ?? "none";
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const effective = theme === "auto" ? (prefersDark ? "dark" : "light") : theme;
  root.classList.toggle("theme-dark", effective === "dark");
  if (refs.themeToggle) {
    const label = refs.themeToggle.querySelector(".theme-toggle-label");
    if (label) {
      label.textContent = theme === "auto" ? `Auto (${effective})` : theme[0].toUpperCase() + theme.slice(1);
    }
  }
  // Board uses CSS-variable-bound SVG gradients, so a re-render keeps the
  // node labels/markers in sync with whichever theme just took effect.
  if (typeof renderBoard === "function") renderBoard();
}

function cycleTheme() {
  const current = getStoredTheme();
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
  persistTheme(next);
  applyTheme(next);
}

function initTheme() {
  applyTheme(getStoredTheme());
  if (refs.themeToggle) refs.themeToggle.addEventListener("click", cycleTheme);
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => { if (getStoredTheme() === "auto") applyTheme("auto"); };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}

function init() {
  loadPrefs();
  initTheme();
  applyVisualStyles();
  // Edge tooltip + dashed connector use position:fixed to land at viewport
  // coordinates. But the .board-panel section has a `rise-in` animation that
  // applies a `transform`, and when ANY ancestor has transform/filter/etc.,
  // `position:fixed` is computed relative to that ancestor instead of the
  // viewport — pushing the tooltip "off by half a screen". We work around it
  // by promoting both elements to direct children of <body>.
  if (refs.edgeTooltip && refs.edgeTooltip.parentElement !== document.body) {
    document.body.appendChild(refs.edgeTooltip);
  }
  if (refs.tooltipConnector && refs.tooltipConnector.parentElement !== document.body) {
    document.body.appendChild(refs.tooltipConnector);
  }
  renderPresets();
  renderRoadmap();
  renderShortcuts();
  wireEvents();
  syncPrefControls();
  // Try to load a position from URL hash before rendering the default preset.
  const loadedFromHash = loadPositionFromHashOnInit();
  if (!loadedFromHash) {
    render();
    scheduleAnalysis(true);
  }
}

init();
