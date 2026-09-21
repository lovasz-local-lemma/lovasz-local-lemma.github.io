/* Keep the source app's renderer sizing in step with wrapped controls. */
(() => {
  if (typeof ResizeObserver !== 'function') return;
  let scheduled = false;
  const previous = new WeakMap();
  const observer = new ResizeObserver(entries => {
    let changed = false;
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) continue;
      const size = `${width.toFixed(2)}:${height.toFixed(2)}`;
      if (previous.get(entry.target) === size) continue;
      previous.set(entry.target, size);
      changed = true;
    }
    if (!changed || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      window.dispatchEvent(new Event('resize'));
    });
  });
  for (const id of ['sim-canvas-wrapper', 'phase-canvas-wrapper']) {
    const wrapper = document.getElementById(id);
    if (wrapper) observer.observe(wrapper);
  }
})();
