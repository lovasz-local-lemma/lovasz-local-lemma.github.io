// Off-main-thread Hackenbush solver.
//
// Heavy "boss" positions can take seconds to solve; running that on the main
// thread freezes the page. This worker runs the full analysis on a background
// thread, streams a live progress count, and returns the complete analysis.
// postMessage uses structured clone, which preserves the analysis verbatim
// (including the BigInt nimber/atomic-weight values that JSON cannot encode).
import { analyzePosition } from "./engine.js?v=13";

self.onmessage = (event) => {
  const { position, limits } = event.data || {};
  const start = Date.now();
  let lastPost = 0;
  try {
    const analysis = analyzePosition(position, limits, {
      onProgress: (states) => {
        // Throttle to ~10 posts/sec so progress never floods the main thread.
        const now = Date.now();
        if (now - lastPost >= 100) {
          lastPost = now;
          self.postMessage({ type: "progress", states, elapsed: now - start });
        }
      },
    });
    self.postMessage({ type: "done", analysis, elapsed: Date.now() - start });
  } catch (err) {
    self.postMessage({
      type: "error",
      name: (err && err.name) || "Error",
      message: (err && err.message) || String(err),
      elapsed: Date.now() - start,
    });
  }
};
