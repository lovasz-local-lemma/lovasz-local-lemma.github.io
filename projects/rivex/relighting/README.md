# What stays editable after export?

Open `index.html` through the portfolio HTTP server. The browser uses the locally
vendored official Rive WebGL2 runtime; there is no CDN dependency.

This is an explanation of the RIVX export boundary: what changes when the
delivery retains authored images and keys, a live renderer, or an editable scene?
It is a controlled browser experiment. `scene.json` uses `RIVX-RELIGHT-STUDY-1`,
not the native `RIVX3D`/`RIVX3S` schemas. No existing native renderer is replaced.

## Artifact contracts

- `glass-light.riv`: an ordinary Rive 7 document with embedded image assets,
  five named material regions, an authored light-position animation, and 171
  vector marks. Scrub `Light position` from 0 to 1 seconds for -100 to +100 degrees.
  Images select one of 25 light samples; transforms interpolate between keys.
  Playback itself needs no 3D shader. Source images remain 640 × 420.
- `semantic-overlay.riv`: the same named vector pool without image layers.
  The host sets transforms from geometry, camera and the shared light controller.
- `renderer.js`: custom WebGL2 direct lighting and two-interface sphere refraction.
  Both live panes use this exact shader. Only the retained pane changes camera.
- `scene.json`: analytical geometry and light-arc parameters, read by both the
  bake utility and live viewer. No prerecorded camera poses are used by the live panes.
- `receipt.json`: explicit runtime ownership, native compatibility and approximations.

The middle and right panes both use custom WebGL2. Keeping the middle camera
fixed isolates continuous shading from camera changes; this is a presentation
choice, not a technical restriction of GPU Canvas. The first pane is genuinely
an image-and-vector bake, not a vector-only reconstruction. For actual matched
GPU Canvas and host exports, open the separate
[four-instrument comparison](../gpu-showpieces/comparison/index.html).

Detailed retained-data notes start collapsed so the controls and three views
stay together. Canvas layers are positioned inside an aspect-ratio stage, making
their layout depend on the available width rather than an iframe height. Opening
the notes uses the shared embedded-layout measurement, which can grow or shrink
the enclosing card.

## Known approximations

The floor caustic is a shaped lobe controlled by light position, not a photon
estimate. Glass uses two sphere intersections, Schlick Fresnel and Beer tint;
there is one reflected lookup and no recursive global illumination. The vector
marks are explanatory overlays and may remain visible through scene surfaces.
The material-color view is an object-ID view, not an albedo measurement.

The portable output retains a one-dimensional light arc, not arbitrary relighting.
Adding independently baked dimensions multiplies sample count. Material controls
only affect live shader panes. Full RIVX capabilities must be evaluated with the
native scene engine; this fixture establishes only the behavior it exercises.

## Reproduce

With the portfolio served on port 4185 and Playwright available to Node:

1. `node scripts/bake-rivx-relighting.cjs`
2. `python scripts/pack-rivx-relighting.py` (Pillow required)
3. `node scripts/check-rivx-relighting.cjs`

Set `PORTFOLIO_URL` to use another server. Baking uses GPU readback once to create
assets. Interactive playback never reads back shader pixels to construct vectors.
The regression loads real Rive assets and compares presented images after light
changes and camera motion, including the fixed-camera invariants.
