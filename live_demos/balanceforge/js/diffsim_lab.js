// diffsim_lab.js — opens the "Differentiable Lab" panel inside the main app.
//
// Deliberately ISOLATED: the differentiable backends (exact-gradient neural +
// analytic LQR) are a different paradigm from the population trainer (single
// policy / closed-form solve, own physics + display), so rather than deep-wiring
// them into runOneGeneration + the display loop (which risks the existing modes),
// the lab lives in an IFRAME of diffsim-balance.html. The iframe is its own
// document — a bug in it cannot touch app.js or the trainer. This module only
// wires the open/close button; it acts on its own elements and no others.

(function () {
  'use strict';
  function init() {
    var btn = document.getElementById('diffsimLabBtn');
    var overlay = document.getElementById('diffsimLab');
    var frame = document.getElementById('dlFrame');
    var closeBtn = document.getElementById('dlClose');
    if (!btn || !overlay || !frame) return;   // markup absent → do nothing
    function open() {
      if (!frame.getAttribute('src')) frame.setAttribute('src', 'diffsim-balance.html'); // lazy-load
      overlay.classList.remove('hidden');
    }
    function hide() { overlay.classList.add('hidden'); }
    btn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', hide);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) hide(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.classList.contains('hidden')) hide();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
