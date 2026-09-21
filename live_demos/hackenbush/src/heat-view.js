// Display helpers only: analysis retains its exact rational values. Converting
// a label for a visual meter must not turn "1/2" into 1 via parseFloat.
export function numericTemperature(value) {
  const label = String(value.temperature ?? "").trim();
  const fraction = label.match(/^([+-]?\d+)\s*\/\s*(\d+)$/);
  const number = fraction ? Number(fraction[1]) / Number(fraction[2]) : label ? Number(label) : NaN;
  return Number.isFinite(number) ? number : null;
}

export function autoHeatSummary(value) {
  const label = String(value.label ?? "0");
  let category = "Cold", className = "heat-cold", fill = 0.2, detail = label;
  if (value.kind === "number") {
    detail = label.length > 8 ? "complex" : label;
  } else if (value.kind === "loopy") {
    category = "Loopy"; className = "heat-warm"; fill = 0.6;
  } else if (value.kind === "switch" && value.temperature != null) {
    const temperature = numericTemperature(value);
    if (temperature === 0) {
      category = "Cool"; fill = 0.3; detail = `mean ${value.mean}`;
    } else if (temperature !== null) {
      category = temperature >= 1 ? "Hot" : "Warm";
      className = temperature >= 1 ? "heat-hot" : "heat-warm";
      fill = Math.max(0, Math.min(0.5 + temperature * 0.25, 1));
      detail = `m=${value.mean} t=${value.temperature}`;
    } else {
      category = "Switch"; className = "heat-warm"; fill = 0.4;
      detail = "temperature unresolved";
    }
  } else if (value.kind === "nimber") {
    category = "Fuzzy"; className = "heat-fuzzy"; fill = 0.5;
  } else if (value.kind === "infinitesimal") {
    category = "Infinitesimal"; fill = 0.15;
  } else if (value.kind === "infinite") {
    category = "Infinite"; className = "heat-infinite"; fill = 1;
  } else {
    if (value.outcomeClass === "N") { category = "Fuzzy"; className = "heat-fuzzy"; fill = 0.45; }
    else if (value.outcomeClass === "L" || value.outcomeClass === "R") { category = "Decided"; className = "heat-warm"; fill = 0.4; }
    else if (value.outcomeClass === "D") { category = "Draw"; className = "heat-warm"; fill = 0.55; }
    else { category = "General"; className = "heat-warm"; fill = 0.4; }
    detail = label.length > 12 ? `${label.slice(0, 12)}…` : label;
  }
  return { category, className, fill, detail };
}

const displays = new WeakMap();

export function clearAutoHeatDisplay(container) {
  if (container.childNodes.length) container.replaceChildren();
  displays.delete(container);
}

// Retain the actual meter node while values change. Replacing innerHTML on
// every analysis destroyed its previous width, so CSS could never interpolate.
// The width is categorical intensity, not a temperature scale across kinds.
export function updateAutoHeatDisplay(container, value, extraMarkup = "") {
  let elements = displays.get(container);
  if (!elements || !container.contains(elements.meter)) {
    const make = (className) => {
      const element = container.ownerDocument.createElement("div");
      element.className = className;
      return element;
    };
    const meter = make("auto-heat-meter");
    meter.title = "Category intensity; the exact value is shown alongside. Width is not a common temperature scale across categories.";
    const bar = make("auto-heat-bar");
    bar.setAttribute("aria-hidden", "true");
    const text = make("auto-heat-meter-text");
    const category = make("auto-heat-category");
    const detail = make("auto-heat-detail");
    text.append(category, detail);
    meter.append(bar, text);
    const extra = make("auto-heat-extras");
    container.replaceChildren(meter, extra);
    elements = { meter, bar, category, detail, extra, extraMarkup: null };
    displays.set(container, elements);
  }
  const summary = autoHeatSummary(value);
  elements.bar.className = `auto-heat-bar ${summary.className}`;
  elements.bar.style.width = `${summary.fill * 100}%`;
  elements.category.className = `auto-heat-category ${summary.className}`;
  elements.category.textContent = summary.category;
  elements.detail.textContent = summary.detail;
  if (extraMarkup !== elements.extraMarkup) {
    elements.extra.innerHTML = extraMarkup;
    elements.extraMarkup = extraMarkup;
  }
}
