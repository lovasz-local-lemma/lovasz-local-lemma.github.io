(() => {
  'use strict';
  const capture = document.getElementById('fortune-capture');
  const preview = document.getElementById('workbench-preview');
  if (!capture || !preview) return;
  function showCapture() {
    const ready = capture.complete && capture.naturalWidth > 0;
    capture.hidden = !ready;
    preview.querySelector('.preview-schematic').toggleAttribute('hidden', ready);
    preview.querySelector('[data-schematic-caption]').hidden = ready;
    preview.querySelector('[data-capture-caption]').hidden = !ready;
  }
  capture.addEventListener('load', showCapture);
  capture.addEventListener('error', showCapture);
  showCapture();
})();
