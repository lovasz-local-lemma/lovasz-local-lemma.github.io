(function initCanvasAspect() {
  "use strict";

  // Every canvas displays at the aspect ratio it actually drew into.
  //
  // A canvas has intrinsic dimensions from its width/height attributes, and all of this app's
  // drawing code works in that space -- drawCaptureMap, for one, places a camera ring with
  // ctx.arc, which is a true circle in backing-store coordinates. If CSS then displays the
  // element at a different ratio the browser rescales that drawing non-uniformly: the circle
  // becomes an ellipse, a wide chart gets squeezed into a square, and a square image is
  // stretched sideways. Nothing errors, and the picture is simply wrong.
  //
  // The stylesheet forces a display ratio on canvases in twenty places, one per grid. Several
  // match the canvases in that grid and several do not, and any canvas later added to one of
  // those grids at a different size is silently distorted -- the same drift that comes from
  // stating a fact in two places and hoping they stay in step.
  //
  // So the ratio is taken from the canvas itself rather than from a table that has to be kept
  // true. An inline style wins over the stylesheet, this cannot go stale, and a canvas that
  // wants a different shape should change its backing store, which is also the only way to
  // change what it can actually draw.
  //
  // Canvases whose CSS pins an explicit height are unaffected: with both axes definite the
  // aspect ratio is ignored. Those stay as they were rather than regressing.

  function lock(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return;
    const wanted = width + " / " + height;
    if (canvas.style.aspectRatio !== wanted) canvas.style.aspectRatio = wanted;
  }

  function lockAll(root) {
    const scope = root && root.querySelectorAll ? root : document;
    if (scope.tagName === "CANVAS") { lock(scope); return; }
    scope.querySelectorAll("canvas").forEach(lock);
  }

  function start() {
    lockAll(document);

    if (typeof MutationObserver === "undefined") return;
    // Watch only width and height. Observing every attribute would see the style write this
    // makes and re-enter forever.
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes") lock(record.target);
        else for (const node of record.addedNodes) {
          if (node.nodeType === 1) lockAll(node);
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["width", "height"]
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
