/* Report real failures, never infer a crash from an intentionally paused frame. */
(() => {
  const report = message => {
    const text = String(message || 'The live renderer stopped.').slice(0, 240);
    if (document.body) document.body.dataset.labError = text;
    if (parent !== window) parent.postMessage({type:'portfolio-lab-error',message:text}, location.origin === 'null' ? '*' : location.origin);
  };
  window.addEventListener('error', event => {
    if (event.message) report(event.message);
  });
  window.addEventListener('unhandledrejection', event => report(event.reason?.message || event.reason));
  document.addEventListener('webglcontextlost', () => report('Graphics context lost. Reset can recreate the renderer.'), true);
})();
