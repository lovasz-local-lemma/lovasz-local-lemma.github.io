// objective_filter.js
// The pure rule for whether an objective <option> is shown for the
// current setup. Lives in its own tiny module so it's loadable by BOTH
// the browser (index.html) and the Node smoke test (which does NOT load
// the DOM-bound app.js) — the same single-source pattern as
// chain_materials.js. app.js's refreshObjectiveOptions() applies this
// rule by toggling option.hidden; it never removes options (removing
// would break loadRunPreset's objectiveSelect.value assignment).
(function (BF) {
  // Show an objective id iff: show-all is on, OR the setup declared no
  // relevant list (→ all relevant), OR the id is in the list, OR the id
  // is the current selection (so a programmatic/preset selection outside
  // the list stays visible and selectable).
  function shouldShow(id, ctx) {
    ctx = ctx || {};
    if (ctx.showAll) return true;
    const list = ctx.relevantList;
    if (!list || !list.length) return true;
    if (list.indexOf(id) !== -1) return true;
    if (id === ctx.currentValue) return true;
    return false;
  }
  // Decide which objective should be SELECTED after a setup/filter change.
  // Keeps `current` when it's still valid (show-all, no list, or relevant).
  // When `current` is irrelevant under filtering, returns the setup default
  // (relevantList[0]) ONLY if autoDefault is true. autoDefault is FALSE at
  // the loadRunPreset tail so an explicitly-set preset objective outside the
  // relevant list (e.g. a double-pendulum preset using pendulum_neat_score)
  // is never clobbered to the default — shouldShow then keeps it visible via
  // its id===currentValue clause.
  function resolveSelection(ctx) {
    ctx = ctx || {};
    const current = ctx.current;
    const list = ctx.relevantList;
    if (ctx.showAll) return current;
    if (!list || !list.length) return current;
    if (list.indexOf(current) !== -1) return current;
    return ctx.autoDefault ? list[0] : current;
  }
  BF.objectiveFilter = { shouldShow, resolveSelection };
})(window.BF = window.BF || {});
