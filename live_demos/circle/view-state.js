(function (root, factory) {
  "use strict";

  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RoundnessViewState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULTS = Object.freeze({
    specimen: "human",
    mode: "comprehensive",
    method: "fit",
    smoothing: 3,
    policy: "geometric",
  });
  var PRESETS = Object.freeze(["perfect", "human", "ellipse", "dent", "noisy", "trilobe", "roundedSquare", "openArc"]);
  var MODES = Object.freeze(["comprehensive", "explore"]);
  var METHODS = Object.freeze(["fit", "zone", "compactness", "curvature", "harmonics"]);
  var POLICIES = Object.freeze(["geometric", "arithmetic", "bottleneck"]);

  function allowed(value, values, fallback) {
    return values.indexOf(value) >= 0 ? value : fallback;
  }

  function smoothingValue(value) {
    if (value === null || value === undefined || value === "") return DEFAULTS.smoothing;
    var numeric = Math.round(Number(value));
    return Number.isFinite(numeric) ? Math.max(0, Math.min(10, numeric)) : DEFAULTS.smoothing;
  }

  function parse(search) {
    var params = new URLSearchParams(typeof search === "string" ? search : "");
    return {
      specimen: allowed(params.get("shape"), PRESETS, DEFAULTS.specimen),
      mode: allowed(params.get("view"), MODES, DEFAULTS.mode),
      method: allowed(params.get("method"), METHODS, DEFAULTS.method),
      smoothing: smoothingValue(params.get("scale")),
      policy: allowed(params.get("policy"), POLICIES, DEFAULTS.policy),
    };
  }

  function normalize(state) {
    state = state || {};
    return {
      specimen: allowed(state.specimen, PRESETS, DEFAULTS.specimen),
      mode: allowed(state.mode, MODES, DEFAULTS.mode),
      method: allowed(state.method, METHODS, DEFAULTS.method),
      smoothing: smoothingValue(state.smoothing),
      policy: allowed(state.policy, POLICIES, DEFAULTS.policy),
    };
  }

  function toSearch(state) {
    var normalized = normalize(state);
    var params = new URLSearchParams();
    params.set("shape", normalized.specimen);
    params.set("view", normalized.mode);
    params.set("method", normalized.method);
    params.set("scale", String(normalized.smoothing));
    params.set("policy", normalized.policy);
    return "?" + params.toString();
  }

  function toUrl(href, state) {
    var url = new URL(href);
    var normalized = normalize(state);
    url.searchParams.set("shape", normalized.specimen);
    url.searchParams.set("view", normalized.mode);
    url.searchParams.set("method", normalized.method);
    url.searchParams.set("scale", String(normalized.smoothing));
    url.searchParams.set("policy", normalized.policy);
    return url.toString();
  }

  function clearUrlState(href) {
    var url = new URL(href);
    ["shape", "view", "method", "scale", "policy"].forEach(function (key) { url.searchParams.delete(key); });
    return url.toString();
  }

  function isShareableSpecimen(specimen) {
    return PRESETS.indexOf(specimen) >= 0;
  }

  return {
    parse: parse,
    normalize: normalize,
    toSearch: toSearch,
    toUrl: toUrl,
    clearUrlState: clearUrlState,
    isShareableSpecimen: isShareableSpecimen,
    DEFAULTS: DEFAULTS,
    PRESETS: PRESETS,
    MODES: MODES,
    METHODS: METHODS,
    POLICIES: POLICIES,
  };
});
