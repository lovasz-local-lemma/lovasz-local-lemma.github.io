// chain_materials.js
// Single source of truth for chain spring material presets. Loaded by
// BOTH the browser (index.html / smoke-test.js load list) AND the
// standalone Node gradient probes (chain-reach-adam-*.js boot), so the
// live evolutionary path and the diff-sim gradient path resolve IDENTICAL
// stiffness/damping for a given key. This is what keeps the
// evolutionary-vs-gradient comparison honest (cf. the v1 restLen vs
// restLength trap where two physics impls silently disagreed).
(function (BF) {
  // stiffness/damping are starting points, stable under semi-implicit
  // Euler at physicsDt = 1/120. Tuned by feel; this is the difficulty dial.
  const PRESETS = {
    rigid:   { label: 'Rigid (≈ rods)',   stiffness: 2000, damping: 20 },
    springy: { label: 'Springy (whip)',   stiffness: 400,  damping: 8  }, // v1 default
    elastic: { label: 'Elastic (bouncy)', stiffness: 120,  damping: 5  },
    rope:    { label: 'Rope (droopy)',    stiffness: 250,  damping: 25 },
  };
  const DEFAULT_KEY = 'springy';
  // Resolve a key to its preset; unknown keys fall back to the default so
  // the setup and the probes degrade identically.
  function resolve(key) {
    return PRESETS[key] || PRESETS[DEFAULT_KEY];
  }
  BF.chainMaterials = { presets: PRESETS, defaultKey: DEFAULT_KEY, resolve };
})(window.BF = window.BF || {});
