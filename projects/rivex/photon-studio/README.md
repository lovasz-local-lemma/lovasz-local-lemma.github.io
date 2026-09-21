# Photon paths → browser beams, finite kernels and Rive ink

The page reads the native `RIVXP1` v1 container exported by the AIO RIVX desktop
tool. It contains 8,000 recorded photon paths with 17 slots each, RGB throughput,
arrival clocks, event tags and surface normals. This is a focused cache viewer,
not the native scene-graph evaluator or an unbiased transport estimator.

Two additional scenes trace and retain paths in the browser: a bounded port of
the native three-lens RelayLab and a diffuse pulse pavilion. They are clearly
identified separately from the imported native record. Their downloadable JSON
cache is a browser fixture, not a generic native RIVX3S scene export.

## Asset provenance

`native-caustic.rivx.gz` is the native `build-rel/photon_record.rivx` with only its
unused optional DOTS section removed and `dotSlots` set to zero. Path, light,
scene and display sections are preserved byte for byte. The gzip transport is
decoded in the browser; the download button returns a native `.rivx` container.
`provenance.json` records the source SHA-256. Reproduce with:

```powershell
python scripts/pack-rivx-photon-cache.py
python scripts/make-photon-ink-pool.py
node scripts/check-rivx-photon-studio.cjs
node scripts/check-rivx-photon-scenes.cjs
```

The inspected scene is the native CausticBox: bounds ±1.2, one sphere at the
origin with radius 0.45, and one emitter. This fixture's clock is geometric path
length in native units, not seconds. The page reports the stored clock type.
The browser scenes use optical path length Σnℓ in the same scene units. The
separate hourglass studio also demonstrates optical lengths and multiple lights.

## Relay and pulse scenes

`scenes.js` ports the RelayLab sphere centers, radii, mirror-panel centers and
tilts, and 12-degree spot cone from `lab3d_photon.cpp` / `lab3d_light.hpp` in the
AIO native source. The panels are finite, zero-thickness mirrors. All 4,200
default photons transmit through lenses 1, 2 and 3 in order. Snell refraction,
Fresnel transmitted power, total internal reflection, mirror law and tinted
mirror throughput determine the paths. Reflected glass branches are omitted;
this deterministic transmitted-branch study is not a complete light-transport
solution. Air and glass distances advance the optical clock with n=1 and 1.5.

The pavilion emits a spot toward a diffuse floor, then traces up to three
diffuse hits using cosine sampling. Its ring display uses 12 actual first-hit
floor events. Seven equal-solid-angle polar bands and an azimuth sweep form
each hemispherical pulse; the arc view displays 35% of each ring. The quadrature
weights integrate a Lambertian hemisphere to one, but the rendered constant-
width strokes intentionally do not form a normalized volume-density estimate.
Rings terminate at room bounds, never refract through delta surfaces. The clock
runs from the incoming impulse through the last selected event plus its 2.3-unit
radius window, avoiding the empty tail of the longer multi-bounce cache.

`reference.js` supplies optional scene shading by following up to 12 analytic
glass/mirror events and then evaluating direct diffuse light or an environment.
It is a readable backdrop, not a converged path-traced ground truth. Its floor
sticker uses a view-dependent cosine palette to approximate thin-film color.
Photon overlays remain X-ray diagnostics and can appear through that backdrop.

## Display contract

- Beams interpolate endpoints where the gate intersects each stored time interval.
  Internal glass segments are excluded. “Paths after glass” starts after the
  recorded exit interface, not on the incoming air segment.
- Point mode places discrete samples along the same legs. A reported deterministic
  path stride bounds dense previews; the resulting display is not a Monte Carlo
  energy estimate. Surface mode uses actual recorded surface hits.
- GPU marks use custom WebGL2 instanced quads. Contributions accumulate in an
  RGBA16F target before exponential display mapping and screen compositing.
  This prevents faint individual photons from rounding to zero before they add
  up, as they did with direct RGBA8 blending. `EXT_color_buffer_float` is required.
  Finite width, kernels, glow and exposure remain deliberate display choices.
- Ball mode places world-radius, chord-integrated spherical kernels on retained
  exterior track samples. Transverse disks lie perpendicular to the path and
  use truncated Gaussian profiles. Both are filled primitives, not wire guides.
  Local affine projection, five samples per selected leg, a reported path stride,
  capped track weights and capped grazing-angle compensation are approximations.
  The time gate selects centers; finite support can cross geometry or gate
  boundaries. Inverse-radius-squared amplitude stabilizes bandwidth edits but
  does not turn these previews into unbiased sphere/disk transport estimators.
- The relief view smooths gated receiver deposits into a world-space field, displaces
  hatch curves on their actual hit planes (including RelayLab’s right wall), projects them through the shared camera, and updates ordinary
  shapes in `ink-pool.riv`. The official Rive WebGL2 runtime draws those shapes.
  Export SVG writes the same projected segments as real vector geometry.
- Scene guides come from the inspected scene dimensions, using the same camera.
  They are geometric context, not an occlusion or refraction solution. Moving the
  camera does not retrace the cache, recompute illumination or refract eye rays.

The Rive pool has 2,048 reusable marks. Overflow in a preferred color pool uses
spare color slots rather than silently discarding geometry. Static reference
shading and Rive guides are cached while the time gate moves. Rendering stops
when unchanged or hidden.
Arrival colours are an optional diagnostic palette, not additional light sources.
This route is not official GPU Canvas; renderer ownership is explicit in the page.

## Entry points and validation

- `?scene=relay`: three lenses and two mirror relays.
- `?mode=rings` / `?mode=arcs`: diffuse pulse quadrature.
- `?scene=relay&mode=balls` / `?scene=relay&mode=disks`: finite world-space kernels.
- `?scene=relay&mode=ink`: world-space deposit relief, drawn by official Rive.

The scene check validates every tested Snell and mirror event, Fresnel energy
monotonicity, optical clocks, all three lens crossings, pulse radius and support,
Lambertian quadrature, faint-photon visibility, static draw reuse, Rive pool
capacity, bandwidth edits, time clipping and mobile layout. It complements the
native-record decoder and beam-clipping regression. A short frame-rate sample
is diagnostic only, not a hardware-independent benchmark. The capture helper
`scripts/capture-rivx-photon-scenes.cjs` creates actual rendered posters.

The dense scattering studio now ports bounded photon-plane sweep geometry. The
full native plane gather and parallelepiped estimator remain native features.

## Existing retained showcase

`../scene-guides.js` also updates the older layered RIVX3D sample: its guides read
the actual retained occluder descriptors and current view-projection matrix.
That portfolio wrapper now depends on the companion module and local Rive pool.
The standalone custom-WebGL export remains separate. This browser change does
not modify the native exporter or claim that generic RIVX3S graph files now load.

## Native-family sweep study (2026-09-17)

The added native-family view follows the geometry and determinant conventions in:

- AIO RIVX `backend/src/lab3d/photon_sweep.hpp`: ring = azimuth at fixed distance and polar angle; arc = polar meridian at fixed distance and azimuth.
- `photon_primitives.hpp`, `lab3d_photon.cpp` `kManifoldVS` / `kManifoldFS`: sphere releases both angles; cone releases distance and azimuth. Their geometric area factors are d² and d sin θ before the view dot product.
- `timeball_band.hpp`: normalized midpoint shell strata for a finite gate, one shell at zero width, and the confocal prolate-spheroid construction for a two-leg clock.
- RadianceLab `docs/ring-arc/SPEC.md`: strategy 28 azimuth ring and strategy 29 polar arc, including the arc's explicit sine and distinct tangency families. The browser does not claim to port that CPU quartic gather, its MIS, or strategy 27 ring-alt.

Native source and original backups were read only. In `primitives.js`, medium anchors are conditional exponential first-collision samples inside retained clear legs, with prefix survival and collision probability in their power. A small deterministic anchor subset conditions the study; fixed distance/polar sample controls are not an unbiased full sampling distribution. Glass and mirrors block swept legs instead of being incorrectly treated as diffuse vertices.

`primitive-renderer.js` rasterizes finite sphere/cone sheets with phase, extinction and clamped view determinants into the HDR buffer. Curves use the corresponding ring/arc tangent factors and finite world width. Solid ball is 18 radial midpoint strata; its interior cutoff, finite shells and silhouette treatment introduce bias. A time band averages five shells; width zero gives one sphere or confocal ellipsoid. The fixed detector is an inspection option, separate from the observer. Linking the detector to the viewer follows the native camera-clock convention. Absolute camera-inclusive calibration is explicitly deferred in the native code too. Browser view gains make geometry legible and are not estimator-comparison measurements.

The existing pulse pavilion remains separate. Its partial ring arcs are not the native polar arc. Modes 07/08 remain finite density kernels; they are not the native sphere/disk sweeps.

`?mode=hybrid&scene=relay` combines independently switchable beams, point samples, surface deposits, actual Rive receiver relief, reference shading and the native-family layer. It shares one source-arrival gate. `?mode=primitives&primitive=ring|arc|sphere|cone|solid|timeball` opens the conditional study; `&clock=camera` starts the time-ball view with a fixed detector clock.

## Export contract

The native scene downloads the source RIVXP1 record. Browser scenes download `rivx-browser-path-cache-v1` JSON, which is not an interchangeable native RIVX3S graph. The new standalone HTML export packages local official Rive JS/WASM, its license, the ordinary ink-pool .riv, native record, all browser modules, and a snapshot of the current controls. Modules/assets are reconstructed as blob URLs with an import map; it works directly on file:// and was tested with every HTTP request blocked. It requires a modern browser with WebGL2, float color targets, DecompressionStream, WASM and import maps. It is a hybrid viewer: Rive draws vectors; custom WebGL2 draws photon marks/manifolds/reference. It is neither a portable vanilla .riv nor official GPU Canvas. The ordinary .riv snapshot and SVG export only the current projected Rive strokes: positions, widths, colors and drawing order. The .riv contains ordinary Rive 7 shape/rectangle/fill/color components, no images, GPU fields, motion, or retained camera interaction. It was reimported and rendered with the official runtime. A generated dense-scattering relay suite is included at `examples/relay-study.html`; it is the complete hybrid HTML, not this vector-only snapshot.

Run `node scripts/check-rivx-photon-primitives.cjs` for actual receiver-plane coverage, all three relay stages, sweep geometry, confocal clocks, zero-width limit, browser controls, mobile layout and a downloaded standalone file tested offline. No native exporter implementation is changed or newly certified by this page.

The generated `examples/relay-ink.riv` contains 1,732 ordinary projected strokes (128,804 bytes). Its official-runtime reimport matched the live vector layer pixel-for-pixel in the 1,324 × 695 compositor capture. The refreshed `examples/relay-study.html` opens the dense scattering studio with the relay, cached rings and seed 92731; it includes the snapshot writer too. The gold transport and shaded primitives use the custom WebGL renderer. The ordinary Rive export from this mode contains its projected guides, not those GPU layers; the separate relief-ink example remains a vector-only reference.


## Dense scattering studio (2026-09-18)

Open `?scene=relay&mode=cloud` or choose **11 · Dense scattering studio**. This extends the same browser renderer; it is not official GPU Canvas. The original native record, pulse pavilion and three-anchor coordinate-release diagrams remain available separately. The new default retains 6,000 photons, draws up to 384 actual medium-vertex families and uses a 22-degree spotlight in the native three-lens/mirror geometry. The old RelayLab port keeps its original 12-degree cone. The wider editable lamp makes the receiver-map folds visible; at some narrower cones there is no fold in the illuminated angular support.

`scattering.js` traces real exponential free flights with sigma_t = sigma_s + sigma_a. A collision before the next boundary changes direction using a Henyey–Greenstein sample about the incoming direction. Weighted absorption multiplies leaving power by sigma_s / sigma_t once at the collision; surviving paths can scatter again, up to the chosen order. A pure absorbing medium produces no scattering deposits. Source-side survival is already represented by the sampled free-flight population and is not multiplied into each beam a second time. Glass contains no fog; glass distance advances the optical clock by its IOR. Fresnel-weighted transmission, total internal reflection and mirror reflection retain their path directions and powers. Glass reflection branches other than TIR are omitted. The depth limit and a 38-event safety budget truncate transport; this is not an infinite-order solution.

Every eligible scatter retains the incoming direction, sampled outgoing direction, untruncated outgoing exponential distance and optical arrival. Ring geometry releases azimuth at that sampled distance and polar angle about the **incoming** axis; it is never a decorative circle around an arbitrary dot. The sphere releases both angles, the cone distance and azimuth. Plane geometry releases both adjacent segment distances into the native flat parallelogram, with a moving column anchor and optical clock. A last-order collision without a retained outgoing sample is not silently turned into a family. Sweeps are masked against analytical glass, mirror panels and room bounds. Local phase, camera attenuation, finite curve support, clamped determinants and explicit view gain create the rendered light; construction mode displays curves/mesh edges. The angular parameterization and plane determinant follow the native sources below, but this finite raster preview does **not** establish equal radiometric calibration across primitives or port the exact native gather/MIS.

**Cached paths** reuses one transport batch during orbit and gate motion. **Resample each pass** replaces it with independent seeded paths. **Accumulate · HDR running mean** starts sampling when selected. Every batch is normalized by its emitted count; its photon image is averaged with the preceding mean before tone mapping. `frame-average.js` uses two RGBA32F textures and `mean += (batch - mean) / passCount`. The per-batch raster target is RGBA16F so faint marks can add before display. Reference shading and Rive guides remain separate and are never averaged into the photon buffer. Pass count has no artificial stopping limit. CPU paths and selected primitive families always belong to just one bounded batch; the photons/families controls limit that batch, not all rendered samples. A repeated redraw of the same batch does not count as an independent pass.

View, output resolution, time gate, representation and shading edits invalidate the framebuffer mean. The same latest transport batch is immediately redrawn at the new settings, then independent sampling continues. Scene/medium edits also retrace transport. The optical gate range is fixed from the initial batch for each transport setup, so later path outliers cannot move a held gate or repeatedly invalidate the mean. Pause time animation to refine one time slice: a continuously moving gate starts a fresh image each frame. Finite primitive subsets, tessellation and regularized view Jacobians remain biased even after their sampling noise falls.

Standby appears before debounced scene/medium traces and each independent sampling pass. The in-view badge reports averaged passes and the per-batch families, while the status reports total emitted photons represented by the current mean. Tracing is bounded CPU work at most once per 450 ms; only active views schedule it. Pending work is deferred during host/document/persisted-page suspension and resumes only the latest requested job. Scene/mode changes cancel obsolete queued work; page destruction discards it. While a scene/medium range control is held, a separate coherent 400-photon / at-most-48-family preview retraces at most once per 65 ms. It is drawn immediately without entering the HDR running mean or advancing the production sample sequence. Full-budget work waits for pointer release (or a 240 ms keyboard-input settle); the prior sampling/paused state then resumes. The high-resolution caustic envelope is replaced by a small 12 × 24 grid only during preview. The preview and its pending final rebuild also suspend with the host/document, and only the latest edit resumes. Camera and gate motion still reuse the retained cache directly.

Standalone exports preserve settings and the current batch seed, then start a fresh framebuffer average on opening. An active sampler resumes, while a paused export waits for Start sampling or Add one pass. The accumulated image and an arbitrarily long seed history are not serialized. Downloaded JSON is explicitly labeled as the **current bounded transport batch**, not all the paths ever averaged. This keeps both runtime memory and portable restoration bounded.

Camera motion uses a separate drawing preview: at most 48 swept families and a
deterministic stride through at most about 1,000 beam paths, with display weight
compensation. All original transport records and receiver deposits stay intact.
The badge states the current family count and beam stride. Full families and
all beams return on pointer release, or after 180 ms without zoom/key input.
Preview frames never enter the HDR mean; full-budget tracing waits until orbit
ends, then the previous sampling/paused intent resumes. This avoids CPU sweep
construction and synchronous photon tracing competing with camera interaction.
It does not make the native estimator run in the browser or guarantee a frame
rate on every GPU. `scripts/check-rivx-photon-camera.cjs` covers this transition,
retained records, visible camera feedback, sample isolation and resumption.


These are useful transport-to-drawing studies, **not converged radiance estimators**. Photon beams provide the strongest direct connection: they use every exterior segment in each independent batch and refine as more passes are averaged, but finite stroke width, display gain and omitted transport still limit the result. Ring/sphere/cone/plane families add finite subsets, tessellation and regularized view Jacobians. Their full estimators are impractical in this small raster display pipeline; accumulating more families reduces sample noise without removing these approximations. [RadianceLab](../../radiance-lab/index.html) is the companion project for the native estimators, normalization and convergence investigations.

The editor changes the selected lens's world X/Y/Z offset, radius and glass/mirror/diffuse response, global glass IOR, and lamp position/power/spread. The edited lens is selected explicitly; switching lenses starts from that lens's original geometry. The lamp aims at the first lens and its position is clamped inside the room. If an edit puts it inside a glass sphere, its initial leg uses the glass optical clock and cannot scatter until it exits. Both photon tracing and analytic reference shading use the edited geometry and material. Unsupported lens selectors are disabled in the one-sphere scene. This is a bounded scene editor, not the native graph editor or an arbitrary-mesh authoring tool.

The **Snell caustic envelope** is independent of random photon deposits. It traces the deterministic angular emitter map through exact sphere/plane intersections, Snell interfaces and mirrors, evaluates signed receiver-map Jacobians, then reconstructs their zero crossings on a finite grid. It is a numerical geometric fold derived from analytic ray paths, not a convex hull, image contour, density threshold, or claimed closed-form caustic solution. It remains geometric context while the pulse gate moves. Some scene/light edits can remove the fold entirely.

Read-only implementation references:

- AIO RIVX `backend/src/lab3d/lab3d_photon.cpp`, physical-scatter loop near lines 524–563: exponential free flight, weighted post-scatter throughput, repeated HG sampling, and retained untruncated distances.
- The same file, `kBeamVS` near lines 1019–1088 and 1174–1206: rotational ring support, bounded occlusion, flowing rather than arriving beam power, and scattering-coefficient placement.
- `photon_sweep.hpp`: `ScatterSample`, `ringFromVertices`, released-coordinate geometry and tangents.
- `photon_primitives.hpp` plus `lab3d_photon.cpp` near line 1647: sphere/cone parameter-space determinants and Plane(6)'s two-segment parallelogram.
- RadianceLab `docs/ring-arc/SPEC.md`, sections 0–1: distinction between azimuth ring and ring-alt, ring/arc kernel geometry and tangency behavior. Its exact quartic gather and MIS are not copied or claimed here.

`node scripts/check-rivx-photon-scattering.cjs` verifies multiple real scatter orders, weighted absorption at equal extinction, no collision inside glass, HG mean cosine, seeded reproducibility, bounded batches, linear HDR mean recurrence, more than eight independent passes, reset on view/gate edits, rotational family geometry, sphere/cone/plane finite data, IOR-dependent Snell folds, actual Chrome control/image changes, scene-edit invalidation, zero-scattering behavior, offline export and mobile layout. Existing photon-scene and primitive regressions still pass. QA captures stay outside the webroot under `portfolio-work/photon-cloud-qa/`.

`node scripts/check-rivx-photon-embedded-mean.cjs` exercises the actual brochure
card and shared host, rather than only opening the studio alone. It removes
pointer hover, requires at least twelve independent passes, reads pre-tone-map
FBO pixels to verify the weighted-mean recurrence and difference from replacement,
and verifies bounded batch/family storage plus full vertical exit/resume. The
sampler now explicitly reports suspension instead of suggesting that a fixed
number of batches completed.
