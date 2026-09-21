/* Shared clock for the two decorative photon-page canvases. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PhotonExteriorAnimation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function create(options) {
    const doc = options.document || document;
    const host = options.window || window;
    const motion = options.motion || host.matchMedia('(prefers-reduced-motion: reduce)');
    const requestFrame = options.requestFrame || host.requestAnimationFrame.bind(host);
    const cancelFrame = options.cancelFrame || host.cancelAnimationFrame.bind(host);
    const now = options.now || (() => performance.now());
    const interval = 1000 / (options.fps || 30);
    let queued = null;
    let previous = null;
    let dirty = true;
    let pageHidden = false;
    let destroyed = false;

    function visible() { return !doc.hidden && !pageHidden && !destroyed; }
    function animated() { return visible() && !motion.matches; }
    function schedule() {
      if (visible() && queued === null && (dirty || animated())) queued = requestFrame(tick);
    }
    function tick(timestamp) {
      queued = null;
      if (!visible()) { previous = null; return; }
      const elapsed = previous === null ? 0 : timestamp - previous;
      // A small tolerance avoids alternating 30/20 fps from floating-point RAF timestamps.
      if (dirty || previous === null || elapsed >= interval - 0.2) {
        const seconds = animated() ? Math.min(0.1, Math.max(0, elapsed / 1000)) : 0;
        previous = timestamp;
        dirty = false;
        options.draw(seconds);
      }
      schedule();
    }
    function invalidate() { dirty = true; schedule(); }
    function resync() {
      if (queued !== null) cancelFrame(queued);
      queued = null;
      previous = null; // Hidden time never advances the scene on resume.
      dirty = true;
      schedule();
    }
    function onPageHide() { pageHidden = true; resync(); }
    function onPageShow() { pageHidden = false; resync(); }
    doc.addEventListener('visibilitychange', resync);
    motion.addEventListener('change', resync);
    host.addEventListener('pagehide', onPageHide);
    host.addEventListener('pageshow', onPageShow);

    if (visible()) {
      previous = now();
      dirty = false;
      options.draw(0);
    }
    schedule();
    return {
      invalidate,
      destroy() {
        destroyed = true;
        if (queued !== null) cancelFrame(queued);
        queued = null;
        doc.removeEventListener('visibilitychange', resync);
        motion.removeEventListener('change', resync);
        host.removeEventListener('pagehide', onPageHide);
        host.removeEventListener('pageshow', onPageShow);
      }
    };
  }
  return { create };
});
