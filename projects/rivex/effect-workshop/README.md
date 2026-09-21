# Rive input → GPU/image-history processing → official Rive vector output

For direct animated path interception, see [Vector Signal](../vector-backend/index.html).
That separate renderer consumes original Rive cubic commands; this workshop's
beam deliberately consumes contours extracted from the rendered image.

All native sources were read from `C:/CCC_website_AIO/offline_projs/RIVX`.
The backup and the native project are unchanged by this browser pass.

## Implemented

- Real `scene3d_orbit.riv`: 600 distinct angle poses at its authored60 fps,
  17,060,805bytes, with fixed union bounds from its companion metadata.
  Starts at288°. Adjacent1/60-second pose validation finds18 distinct images.
  Rendering follows display refresh; observed fps is displayed, never invented.
- Original rosette:192 animated ordinary Rive ellipses.
- Four credited source examples: Truck, Faux 3D Game Icons, Planets and Jellyfish.
  Visible showcase buttons select both the useful artboard/playback and effect;
  default Truck uses its drive state machine, Jellyfish uses Idle, and Planets
  selects Saturn. All artboards are selectable. Credit/provenance: credits.html.
- Import ordinary `.riv`; linear timelines, state machines, bool/number/trigger
  controls and pointer listeners. Local upstream truck.riv was used in testing.
- Oil: original four-quadrant Kuwahara shader; not a port of an unattributed
  Shadertoy effect. Copper engraving and marching-square SVG contours remain.
- Progressive 2D Gaussian fitting (`fitting.js`): 96 × 64 RGBA input is
  composited over the displayed dark background. The loss is RGB MSE of ordered
  alpha-composited, truncated elliptical Gaussians. Analytic reverse gradients
  change centre, log-axis scales, angle and RGB; backtracking accepts only a
  reduction in the current target loss. A fixed grid initializes 96/192/320
  marks, then the optimizer changes their actual geometry and colours. The
  residual preview, loss, accepted-step count and measured batch duration are
  visible. Work budgets are soft: one complete iteration may take longer.
  Freeze the source to compare losses; animation warm-starts the previous fit
  against each new image. Hidden views suspend the optimizer with the renderer.
  This is a browser implementation, not a port of the native 3D splat trainer.
- Custom WebGL2 draws the optimized Gaussian kernels. Official Rive draws a
  bounded palette pool of eight concentric ellipses per mark. The pool's colour
  quantization, bucket ordering and finite rings add a separate approximation;
  the reported loss belongs to the Gaussian model, not the Rive display. The
  static `.riv` snapshot retains the full fitted colours and mark order. Dark
  marks are retained. The snapshot has no authored animation timeline.
- Additive glass or mirror lens: a draggable image-space optical layer over any
  processed output, including imported `.riv` sources. Refraction, dispersion,
  radius and optional image-gradient response remain adjustable. It samples the
  displayed image; it does not recover depth, normals, object identity or hidden
  surfaces. These optical controls and position persist in the hybrid HTML.
- Ordered vector beam: marching-square edges are joined into polylines, then
  nearest contour endpoints are traversed, with dim blanking travel. The moving
  segment uses the native Gaussian line-integral/erf shape and exponential
  phosphor persistence. Unlike desktop, source paths are extracted from pixels.
  RGBA16F energy accumulation when supported, otherwise clampedRGBA8 fallback.
- Actual x/y/time volume: RGBA8 texture array, manual interpolation between
  circular-history layers, front-to-back Beer–Lambert raymarch. Alpha captures
  frame-to-frame RGB difference for motion density. RGB, motion and iso-sheet
  display switches retain the same captured history.
- Adaptive profile:256²×64 history,64 ray steps; output resolution adapts
 288–600pixels wide against presented frame time. Studio:512²×128 history,
 192 steps,720×480 output. Studio history uses128MiB. It never invents missed
  source frames. History capture defaults to60 slices/s;15 and30 remain optional
  longer-history settings. Its cadence preserves fractional timing across display
  frames (e.g.144 Hz display /60 Hz capture), and never fabricates missed frames.
  Source timeline rate, display refresh and history capture rate are separate:
  the glass asset has60 authored poses per second, display FPS is measured, and
  history capture is capped by both its selected rate and actual rendering.
  The setting is not a device-independent60 FPS promise.
- STM luminance relief uses a blurred current-image height field, shell density
  and gradient lighting; it is not a scene-depth reconstruction.
- Beam→space-time feeds the persistent beam image into the same real time volume.

## Export

Hybrid HTML format `RIVX-EFFECT-HYBRID-3` includes source `.riv`, pinned official2.37.8 WebGL2 JS/WASM/license,
all custom programs, source metadata, settings, timeline/time, machine inputs,
compressed volume history, phosphor buffer, optimized Gaussian parameters, lens state and pool palette. It restores paused
for inspection, and resumes on Play. No server or native application is needed.
Only the selected source and small rosette are included, avoiding a17MB download
when the user exports the rosette. The600-angle switch is disabled in an export
that does not contain that source; local import remains available.

This is not a native `.rivx` file, nor a GPUCanvas `.riv`. The working ordinary
`.riv` export is explicitly a static vector snapshot, enabled in the two fitting
modes. Lens/shader/history processing is preserved by hybrid HTML only. GPU Canvas status, current
primary sources and missing authoring/packaging dependencies are in
`gpu-canvas-status.html`. Official WebGL2 now supports GPU Canvas from2.42.0;
the old Apple-only audit was out of date. Merely swapping our pinned runtime
would not serialize JavaScript-managed passes into GPU shader/script assets.

The official offscreen source presents after its RAF. Effects consume the last
presented frame, so source and output can differ by one animation frame. Browser
canvas upload crosses GL contexts; no zero-copy guarantee. External images/fonts,
view-model binding, nested artboard selection and native object-ID/depth buffers
are outside this page's import contract. State-machine inputs are restored, not
an arbitrary internal transition snapshot. Save-name counters set suggestions;
browser download policy still controls actual filesystem collisions.

## Verification

`node scripts/check-rivx-effects.cjs` uses local site port4185 + Playwright.
Checks presets, real vector paths, Studio allocation/ray steps, preserved history,
orbit interaction, self-contained file:// history replay without network, actual
Rive snapshot reimport, upstream truckSM inputs, suffixes, and distinct600-angle
poses. Browser error logs are checked.

Historical measurements before the progressive-fitting revision, on this machine's RTX4080 Laptop via Chrome ANGLE/D3D11: source144fps,
pooled officialRive splats74fps, adaptive timevolume144fps, beam138fps, STM144fps,
oil144fps (rosette,1500×1250 browser viewport). These are local observations, not
portable guarantees. SwiftShader is substantially slower; measured fps and
adaptive output size expose the difference. Studio trades speed for fidelity.

## Credited showcase batch

- Deep links: `?source=truck&preset=beam`, `?source=faux&preset=oil`,
  `?source=faux&preset=splats`, `?source=faux&preset=rive-splats`,
  `?source=jellyfish&preset=time`, `?source=planets&preset=beam`.
- `source=faux` splat links select the Crown component for a large, readable
  feather comparison. The other artboards remain selectable.
- `examples/*.html` are real button-generated self-contained artifacts. They
  restore the selected artboard, original animation/state machine and saved
  processing state. They start paused so their saved frame/history is visible;
  Play resumes live processing. They do not fetch a native desktop backend.
- `.riv` snapshot = one static ordinary Rive vector approximation. Animated
  phosphor/history/oil/splat processing = hybrid HTML. Neither is advertised as
  an official GPU Canvas export or as a native GUI export route.
- Image sources remain credited in standalone HTML; local runtime licenses are
  included in the bundle. Full traceable sample hashes are in samples/provenance.json.
- Active-source selection does not reload unrelated large files. Source-changing
  buttons unavailable in a one-source standalone bundle are disabled; importing
  another local Rive document is still possible.

New showcase verification: `node scripts/check-rivx-effects-showcases.cjs`
selects all six buttons, generates the real shipped artifacts, opens each via
file://, checks artboard/playback/effect/source-credit preservation and zero HTTP
requests, then resumes playback. Local 1500 × 1450 viewport measurements:
Truck, oil, custom fitting, jellyfish volume and planet phosphor ≈144 FPS;
Crown official Rive fitting ≈53–101 FPS across repeated runs with different
concurrent load (3,120 visible ellipse draws). These are
observations on this device, not universal guarantees.

Embedded brochure views use a compact header; standalone pages keep the full introduction. The ordinary .riv snapshot also includes the active source credit in its artboard name.

## Progressive fitting and optics verification

`node scripts/check-rivx-effect-fitting.cjs` uses `SITE_URL` (default port 4191).
Set `QA_OUTPUT` to save screenshots; temporary downloads otherwise use the system
scratch directory and are removed after verification. The check verifies actual
geometry optimization and monotonic fixed-target loss, browser convergence,
fitting pause, native Rive output and `.riv` snapshot reopening, lens dragging,
local source import, complete offline hybrid replay, mobile width and errors.

Useful live entries:
- `?source=faux&preset=splats&paused=1`: actual optimization with loss and residual.
- `?source=faux&preset=rive-splats&paused=1`: editable ordinary Rive output.
- Add `&lens=glass` or `&lens=mirror` to combine the lens with either route.
- `?source=truck&preset=source&lens=glass`: manipulate optics over the original input.

Native implementation audit references: `backend/src/splat/splat_fitter.cpp`
uses residual-greedy seeding and ParamMatcher; `splat_grad.cpp` provides
residual/coverage gradients and Adam. The browser fitter uses its own bounded
alpha-compositing objective and backtracking. None of this changes the native
exporter or packages these external programs into a GPU Canvas `.riv`.

Earlier `examples/*.html` retain the previous implementation and are clearly
labelled in the page. Export the live page for the optimizer and lens revision.
