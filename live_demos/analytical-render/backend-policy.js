(function (root) {
  'use strict';
  // These scenes exercise the common diffuse renderer instead of silently
  // substituting diffuse surfaces for the garage's GPU-only materials.
  const cpuScenes = ['studio', 'grazing', 'closeup', 'sweep', 'stack', 'trio', 'meshlights'];
  const defaults = { js: { renderScale: .5, samples: 2 }, wasm: { renderScale: 1, samples: 2 } };
  function supportsScene(backend, sceneId) {
    return backend === 'webgpu' || cpuScenes.includes(sceneId);
  }
  function cpuProfile(backend, current) {
    const budget = defaults[backend] || defaults.js;
    return { ...current,
      sceneId: supportsScene(backend, current.sceneId) ? current.sceneId : 'trio',
      renderScale: Math.min(current.renderScale || budget.renderScale, budget.renderScale),
      samples: Math.min(current.samples || budget.samples, budget.samples),
      targetFps: Math.min(current.targetFps || 30, 30), aaSamples: 1, aperture: 0, materialView: 0, mediumDensity: 0,
      mediumOnly: false, mediumAnimate: false, groundFlow: 0, extraFancy: false,
    };
  }
  const api = { cpuScenes, defaults, supportsScene, cpuProfile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BackendPolicy = api;
})(typeof window !== 'undefined' ? window : this);
