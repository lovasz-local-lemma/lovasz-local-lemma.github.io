# Vector Signal: a portable drawing backend

The official Rive core imports the original `.riv`, evaluates its timelines or
state machines, and draws a Canvas reference. A command adapter records the
**same evaluated vector drawing** before rasterization. A small WebGL2 backend
gives those paths different drawing semantics: an ordered beam with phosphor
history. A separate ordinary `.riv` draws the reticle and selected-path bounds.

This is a working browser counterpart of one native RIVX rendering mode. It is
not a complete port of the native backend or a reader for every `.rivx` family.
It also differs from Effect Workshop's image-derived beam: this player never
uses edge extraction or framebuffer readback to obtain the input geometry.

## Components

- `capture.js`: wraps the official Canvas advanced render factory before
  import, recording move/line/cubic/close and transformed `addPath` calls.
  `CanvasRenderer` callbacks supply evaluated transforms, clip stacks and
  opacity. The normal reference renderer still receives every call.
- `beam-renderer.js`: adaptive flattened contours become a stable painter-order
  scan, with blanked travel between them. The finite Gaussian segment integral
  uses an error-function difference along the segment and a Gaussian across it.
  Deposition and exponential history decay account for elapsed time; splitting
  a straight segment does not add more light. HDR history uses RGBA16F where
  available; the reported fallback is RGBA8.
- `beam-cursor.riv`: a 1,013-byte ordinary Rive document, generated for this
  study. A view model binds the scan position, selection bounds and progress
  rail. The host computes these from the vector signal, without GPU readback.
- `app.js`: source import, official evaluation, native pointer/state-machine
  inputs, path inspection, isolated drawing, mute/restore and offline export.

## Interaction and limits

Hover or click the enhanced view to inspect original cubic handles. Isolation
and muting operate on evaluated **draw-call IDs**, not persistent editor names.
If a state transition changes draw ordering, that ordinal may refer to a
different draw. Images and image meshes remain in the official reference but
do not become vector contours. The renderer interprets fill/stroke boundaries;
it does not reproduce fill colours, gradients, blend modes or surface coverage.

Official and enhanced drawings use equally sized 720 × 480 artboards, including
the same fit and source transform. At phone widths they stack without shrinking
the official view. Changing counters have stable grid cells; text updates at
most ten times per second and unchanged values do not replace DOM nodes. The
empty current-curve inspector is drawn once until its selection changes.

Clipping applies to the centerline: source clips are tested geometrically with
Canvas `isPointInPath`, sampling each segment at at most 2 px and refining
detected boundary crossings. Very narrow islands between samples can be
missed, and phosphor glow may extend across a clip boundary. These are raw draw
contours, including potentially occluded paths, rather than a solved visible
silhouette. Source cubics flatten to an approximately 0.4 px tolerance, with a
bounded subdivision depth. Limits are surfaced: 800 draw calls, 120k captured
points, 2,048 rendered contours and 32k beam segments.

The native implementation inspired the architecture and beam integral. This
port deliberately uses stable draw order instead of nearest-endpoint chaining
to avoid animated paths changing the traversal order abruptly. Its beam and
clipping policy are not promised to match the native renderer pixel for pixel.

## Export contract

**Export standalone HTML** embeds the original `.riv`, official Canvas advanced
runtime and WASM, custom adapter/renderer, ordinary return-layer `.riv`, sample
credit and current settings. It opens locally without a server or network
request. Supported source animation and original state-machine inputs remain
live; an uploaded `.riv` stays on the device. It is not uploaded for signing.

Timelines retain their export time. State machines restart with the saved input
values; their arbitrary internal state is not serialized. Phosphor rebuilds
after opening. This is a browser hybrid, not an ordinary `.riv` that magically
contains an unknown rendering operation, and not an official GPU Canvas file.
Re-export uses numbered filenames by default.

Imports require ordinary `.riv` artwork with its assets embedded. CDN asset
loading is disabled; external image, font and audio references are not fetched
or packaged by this exporter. GPU Canvas documents need their separate player.

The API seam is the official `@rive-app/canvas-advanced` 2.42.2 Canvas renderer
adapter. Its JavaScript virtual callbacks are tested at this pinned version.
This adapter is distinct from the official WebGL2 renderer; the latter does not
provide the same path interception callbacks. The runtime is unmodified; its
module was renamed `.js` for static servers with incomplete `.mjs` MIME maps.

## Sources and provenance

Vendor package: [official npm package](https://www.npmjs.com/package/@rive-app/canvas-advanced/v/2.42.2),
MIT; license retained in `vendor/LICENSE` and in each exported page.
Callback implementation: [official Canvas adapter](https://github.com/rive-app/rive-wasm/blob/master/wasm/js/renderer.js)
and [C++/JS binding](https://github.com/rive-app/rive-wasm/blob/master/wasm/src/bindings_c2d.cpp).

Artwork comes from the already credited Effect Workshop examples. Truck is an
official Rive wasm example; Faux 3D Game Icons is by rishi.kumar.id (CC BY);
Jellyfish is a Rive runtime fixture whose original artist is not identified in
the fixture metadata. Kinetic Rosette and the return-layer document are original
study assets. The active credit and original source link are visible in the
player and preserved in its export.

Private RML authoring for the return layer remains outside the public site.
The native implementation and original project source directories were not
changed by this browser implementation.

## Evaluated animation as a time volume

“Give the drawing a time axis” retains the actual clipped contour coordinates
captured from official Rive evaluation. It does not use screenshot edges or invent
a procedural proxy for the animation. Hold one pose, record the next second, or
keep a rolling capture. A temporal window and lookback choose which recorded
slices are shown; dragging rotates their 2D + time geometry. Selecting an evaluated
draw call in the beam view highlights the same ID through the captured sequence.

The 3D history is **off by default**. Its checkbox enables both recording and
projection. While off, neither runs and its source clock does not advance; the
beam, official drawing and current-curve inspector remain interactive. Turning
it off preserves already captured samples. Projection redraws only when a new
sample arrives, its selected curve changes, or an inspection control changes,
rather than reprojecting the full history on every beam frame.

The history is separate from the exponentially fading phosphor framebuffer.
Sampling is bounded to at most 20 Hz, 72 snapshots, 240 contours and 2,200 points
per snapshot. Complex paths are resampled from their flattened evaluated polylines,
so this is a budgeted geometric inspection, not an exact curve archive. Coordinate
storage is at most 1,267,200 bytes (1.21 MiB); metadata and JS container overhead
are additional. The oldest snapshot is evicted when full; capture keeps running.
Artwork/animation changes clear the old sequence. Pausing the source or suspending
the demo stops sampling. A one-second sweep restores a previously paused source
when complete. Reduced-motion preferences start source playback paused.

This view uses Canvas2D to project the retained path samples. It is a browser host
interpretation of Rive vector data, not an official GPU Canvas script or a volume
embedded in an ordinary .riv. Standalone RIVX Suite exports include the history
viewer and captured samples alongside the original .riv, official evaluator and
beam renderer. The restored history opens held so it can be inspected exactly.
The enabled/off choice is preserved, including captured samples while off.
Source state machines still restart with saved inputs. No promise of identical
internal state-machine state is made.

Verify with `node scripts/check-rivx-signal-history.cjs`. The check records real
animated Rive artwork, compares captured geometry and rendered snapshot/volume
views, exercises range/orbit and freeze controls, fills then advances the ring
buffer, checks suspension and the storage bound, and reopens an export with all
HTTP traffic blocked. The exported coordinates and sample times must match.

The current-path inspector and temporal projection share a two-column instrument.
A local curve selector pins the same evaluated draw ID in both, and hovering the
beam temporarily inspects that curve in both views. The controls say when all
paths are shown; they do not imply that an unselected history is one curve.
The compact metrics above retain image/mesh omissions and source capture limits.
