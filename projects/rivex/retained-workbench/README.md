# Retained layer workbench

This is a new browser view of the existing native **RIVX3D** record. It does not modify the old hybrid export, its inline payload, or the native project.

## Real source assets

- Full: `../../../live_demos/rivex/exports/retained-caustic-splats.rivx`, 3,084,437 bytes; fetched directly rather than duplicated in this directory. 33,841 splats, tags for 21,841 surface and 12,000 medium splats, 12,000 ellipse-outline manifolds, and two occluders (sphere radius .45 and box half extents 1.2).
- Compact: `compact.rivx`, 212,288 bytes. Byte-for-byte copy of `offline_projs/RIVX/build-rel/lab3d_gsplat3d_small.rivx`. 1,411 splats, 1,500 ellipse outlines, same two occluders. This native export has no tag section, so the two semantic filters are disabled. No inferred labels are invented.
- Inventory of the native root and build-rel exports found all full RIVX3D files to be byte-identical to the existing full record, including `o2_gsplat`, `o3_gsplat`, and `occ_gsplat`. These are not advertised as different scenes. RIVX3S scene files are a different schema and are not loaded here.

## Rendering and controls

- Actual 15-float native splat records: world position, three scales, normalized XYZW quaternion, color, alpha, arrival value. World axes are projected through the perspective Jacobian; the 2×2 screen covariance is diagonalized into a rotated ellipse. The native camera target is honored.
- Splats are sorted far to near and rendered with the existing native-export-style, edge-trimmed Gaussian profile. This is a retained colored field, not the learned SH PLY field shown in the separate Gaussian showcase.
- Native ellipse records use projected ribbons and the existing premultiplied blend. The record contains outlines, not photon beams. The opacity control makes the dense alternative representation readable. Points and rings are not combined with transport MIS or energy-preserving normalization.
- The temporal control multiplies each record's alpha by `exp(-((arrival-gate)/(width/2))²)`. Each ellipse has a single arrival time. It does not move a temporal segment along an ellipse or integrate flight time around it.
- Radius uses a base-10 slider: 0.01× through 10×. Exposure scales displayed color. Arrival-time and tag palettes are explicitly diagnostic; the baked lighting is unchanged.
- The initial oblique view uses a cyan–amber arrival-time palette and a smaller radius, with an understated geometry reference. Select Native recorded color to recover stored colors.
- The background can show a shaded geometry proxy or surface normals from the record's sphere and box. The sphere toggle affects this reference only. No glass BSDF, refracted new-view content, shadows, occlusion, or relighting is recomputed. The proxy room is open toward the camera for inspection.
- Front, three-quarter, above, pointer and keyboard orbit, wheel zoom, layers, tags, point/ring display, appearance, and time controls are saved in a small view-settings JSON. The record is never overwritten. Loading requires the corresponding full/compact cache. Playback resumes paused.

## Where official Rive runs

`layers.js` uses the locally bundled official `webgl2_advanced.js` and `rive.wasm`. Scene outlines are real Rive shapes from the existing `photon-studio/ink-pool.riv`, projected from the actual record's geometry through the shared camera. The front marker uses `retained-caustic-splats.overlay.riv` and its real animation timeline, driven by the same gate phase. The custom retained WebGL2 canvas sits between those layers. The official runtime does not decode RIVX3D.

The renderer draws only when a control/camera changes or the time gate animates; hidden/offscreen/host-suspended views pause. BFCache retains resources. All runtime assets are local; no CDN is needed.

## Validation

`node scripts/check-rivx-retained.cjs` (with Playwright on NODE_PATH): genuine browser WebGL render, known native counts, official Rive layers, orbit/reset, surface/medium filtering, curve rendering, reference sphere toggle, downloaded settings → imported settings → exact screenshot equality, persisted lifecycle, actual compact record, and mobile overflow. Screenshots go to `portfolio-work/rivx-retained` outside the published site. The compared screenshots are scrolled to the same page position because subpixel sticky positioning otherwise changes the composited screenshot while all four canvas buffers remain identical.

`preview.webp` is an actual browser capture of the initial view; `rings.webp` is an actual capture of the native ellipse-record preset.

## Ring controls and dielectric support comparison (September 2026)

The play button, arrival slider and window width now sit directly above the
viewport inside its card. The view and the detailed controls share a common
workbench border. Recorded rings start their gate animation unless reduced motion
is requested; scrubbing enables the gate and pauses the sweep. Work remains live
while any part of the workbench is visible, including controls below the viewport.
Persisted page suspension stops callbacks and resumes without destroying buffers.

The native source does **not** blindly release azimuth at dielectric vertices.
`lab3d_gsplat3d_bake.cpp` calls `primitiveEligible(Primitive::Ring, cls)` before
exporting the manifold; dielectric anchors are excluded. Ring axes come from the
emission axis, eligible surface normal or incoming medium leg. This viewer retains
the resulting whole ellipses and does not perform new clipping against geometry.
The 85-byte shape record has no original incoming/outgoing direction or BSDF, so
adding an apparent BSDF weight to those ellipses would invent missing data.

**Delta support study** is therefore a separate analytic specimen, using the
recorded sphere's center and radius. A stratified point-light sample traces entry
and exit Snell refraction and both Fresnel transmission factors. At each exit,
several propagation distances form candidate rings with the actual outgoing
polar angle around the surface normal. Their unrestricted azimuth is compared to
`exp(-0.5*(theta/sigma)^2)` around the actual transmitted direction. Grey candidates
and gold support can be drawn separately or overlaid. The angular Gaussian is
peak-normalized for visibility, not integrated/radiometrically normalized. Finite
angular blur is a deliberately biased support visualization, not a physical rough
BSDF or a general photon estimator. IOR genuinely changes the two-interface path;
optical time is the point-light flight plus IOR-weighted interior flight plus the
outgoing leg. Each ring has one arrival, not travel along its perimeter. The study
does not add a fresh room-visibility solve or modify the archived field.

`node scripts/check-rivx-ring-support.cjs` checks Snell's law, Fresnel ranges,
angular support math, real rendered differences for mode/width/IOR, gate playback
and scrubbing, native/analytic settings restoration, persisted suspension and
mobile layout. Captures are outside the public tree in
`portfolio-work/rivx-ring-support/`.
