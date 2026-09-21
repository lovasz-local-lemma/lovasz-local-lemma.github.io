# Photon hourglass: finite rasterized browser study

Run `index.html` through the portfolio HTTP server. No native executable is required.

## Actual transport

`transport.js` traces deterministic angular ray families from each point source through analytical glass spheres or axis-aligned ellipsoids, following the transmitted branch at both dielectric interfaces and retaining one bounded Fresnel-reflected branch at the first front surface. The latter stops at the receiver, another glass body or the 8 m display boundary; it is not recursively reflected. The vectors use Snell's law and unpolarized dielectric Fresnel transmission. Optical length adds `n * distance` inside glass. Each angular ring yields a swept sheet; compatible neighbouring segments are joined with triangles. Angular cells also project onto the horizontal receiver, with flux divided by actual footprint area. Caustic folds arise from the traced mapping; they are not hand-painted or a canned animation.

The scenes are a single hourglass, three coloured source/glass pairs, a two-sphere chain with two external focuses, and the previous overlapping-focus configuration. The new chain places the second, smaller sphere beyond the first waist; actual transmitted rays then converge again. The old geometry already refracted twice, but enclosed the first focus in the lower glass and emerged diverging. The path-leg selector isolates before glass, after first glass, and after second glass; counters show retained ray segments in each leg. The chain drops discontinuous paths rather than bridging different surface-event signatures. Changing the refractive index rebuilds the transport. Orbiting changes only the camera. Gate motion changes only uniforms.

## Temporal filtering

The Gaussian gate has standard deviation `width/2`, expressed in optical meters (`c * time`). Source-pulse mode uses source-to-vertex optical length. Camera-arrival mode additionally uses the straight distance to the eye. The optical length is interpolated over each finite triangle, so a thin gate exposes finite tessellation error. The clock is geometric optics with a constant nondispersive phase/group index, not a wave-optical time-domain solver.

## Renderer ownership

- Three.js r160 / WebGL renders photon triangles, the receiver, source markers and glass. Beauty mode reconstructs retained photon radiance in half-float HDR render targets; the schematic keeps the direct additive sheet display.
- The local official Rive advanced WebGL2 runtime draws `context.riv`: 4,096 ordinary vector marks whose transforms come from the same projected scene coordinates. No GPU readback regenerates Rive geometry.
- This is not an official GPU Canvas application, a native `.rivx` player, or a portable `.riv` implementation of the transport. Only the vector context asset is an ordinary `.riv`. The scene and transport are retained in JavaScript.
- The colours correspond to three RGB source colours, not wavelength-dependent dispersion.

## Bias and scope

This is a structure preview: finite angular quadrature and triangles, a grazing-angle denominator clamped to 0.14, density capped at 40, and additive display blending. Independent volume/receiver exposure constants improve legibility and are not radiometric calibration. The fog display uses an approximate homogeneous single-scattering attenuation/phase model. Glass path segments have no fog; separate air length controls source-side fog attenuation, while optical length controls delay. Multiple scattering, higher-order reflected/TIR branches, arbitrary meshes and complete scene visibility are absent. Beauty glass computes analytic entry/exit camera refraction for each sphere or ellipsoid, then samples screen-space photon radiance and a procedural studio environment. That finite lookup is not a complete camera path tracer and can miss off-screen or occluded light.

It follows the native finite-sheet preview's construction, but does **not** claim to implement the unbiased analytical strategy 20 or to be a complete strategy 32 port. Native source inspected:

- `RadianceLab/src/render/PPIntegrator.cpp`: strategy 20's correlated raster gather calls the same exact crossing evaluator; rasterization alone does not introduce bias. Separately, `hourglassFastPreview` dispatches the finite `renderPreview`.
- `RadianceLab/src/render/PPMeshSheets.inl`: traces rulings, joins compatible segments, uses projected Jacobians, and has a deliberately biased raster preview.
- `RadianceLab/src/render/MeshSheetGeometry.h`: Snell/Fresnel transmission and finite triangular chart geometry.
- `RIVX/backend/src/beam/beam_lab_export.cpp`: real traced photon segments and TOF are read from the native SSBO before export. This browser study constructs its own traced data; it does not claim to import those buffers.

## Reproduction

`python projects/rivex/hourglass/build-context.py` rebuilds the ordinary Rive overlay asset. `node scripts/check-rivx-hourglass.cjs` checks Snell's law, Fresnel power, optical length, TIR refusal, index-dependent footprints, actual browser gate/orbit changes and official Rive initialization. The runtime is vendored under `../vector-replay/vendor/`; Three.js and OrbitControls are shared from `live_demos/pi/vendor/three/`.

## Rive medium curves

The new display modes sample a finite-width vertical world slice from the actual traced tracks. Each track deposits angular flux times Fresnel transmission and source-side fog attenuation, weighted by path length, into spatial and optical-time bins. A 0.16 m Gaussian slice bandwidth and a small spatial tent filter make an intentionally biased density field. The reference intensity is fixed for each field rebuild, so a time gate cannot brighten a weak pulse through per-frame normalization. Narrow gates expose finite time-bin resolution.

A 38-line field is drawn with ordinary Rive rectangles forming connected polylines. Density drives width, sideways sinusoidal displacement, or both. The 2D projection comes from the current orbit camera. These are NPR encodings of track density, not physical ray bending, exact isophotes, or a calibrated radiance solve. A scene-derived mask suppresses the field inside glass. GPU volume sheets are hidden in the pure curve display. No framebuffer readback is used. The stage filter and both optical clocks act on the same field.

Regression checks now verify two ordered glass events, both external foci, surviving Fresnel power on the second leg, separate fog/optical lengths, nonzero density for both outgoing legs, and actual official-Rive screenshot changes under optical gating and curve-encoding changes.

## Moving geometry and portable delivery (September 17)

`dynamics.js` adds moving chromatic lenses, a moving two-stage chain, and a morphing ellipsoid. Quadratic intersections and gradient normals drive both Snell interfaces; the ellipsoid silhouette uses the camera transformed into unit-sphere coordinates. Geometry animation and optical arrival are independent clocks. Every pose is frozen during nanosecond light flight; this is not moving-boundary transport.

While geometry moves, a 4 × 24 angular preview and four longitudinal subdivisions keep the view responsive. Pause rebuilds the selected fine angular resolution. Total-internal-reflection continuation is omitted, but previously illuminated medium segments are retained. Different termination signatures are not joined into one sheet. Volume display includes an approximate straight eye-side fog leg; the separately scaled receiver display omits that leg. Neither exposure is a calibrated radiance comparison.

**Export this browser study** saves a self-contained HTML file with the current camera, pose, controls, scene modules, Three.js/OrbitControls, official Rive JS/WASM, vector pool and licenses. It reopens directly via `file://`, can be re-exported offline, and has no server or CDN dependency. Playback starts paused; scene motion and pulse sweep can be resumed separately. Downloads receive numbered suffixes within the session. This exports the browser study, not an official GPU Canvas .riv or a general native .rivx scene.

`node scripts/check-rivx-dynamics.cjs` checks ellipsoid roots/normals/optical delay, TIR-prefix preservation, changing geometry and transport, saved controls, downloaded HTML and offline re-export. `check-rivx-brochure-recovery.cjs` forces an actual WebGL context loss and verifies Reset reconstructs the embedded renderer.

## Beauty reconstruction and medium controls (September 18)

Beauty mode is enabled initially and can be toggled independently of display mode, path leg, ray overlays, animation or optical gate. `beauty.js` renders the cached transmitted/reflected sheets and receiver into an HDR target at 65% linear screen resolution, applies a separable Gaussian filter, then combines the reconstruction with a small bloom term before ACES tone mapping. Its bandwidth is explicitly adjustable; the default favors the reconstructed signal to suppress angular banding. A matte studio floor adds a broad soft specular response, faint surface divisions and a subdued circular stage edge. That art-directed receiver material is separate from the photon-derived caustic energy. No image readback or new ray tracing is needed for camera, gate, medium or reconstruction controls. Scene pose, IOR and angular resolution still rebuild the paths. The soft filter, finite Jacobians, radiance caps and exposure constants are deliberately biased; this is a polished transport preview, not a radiometric reference.

The glass surface uses the analytical two-interface refracted camera direction, Fresnel reflection, Beer absorption and procedural studio reflections. Refracted/reflected radiance is looked up in the same photon buffer. Missing screen-space samples fall back to the environment; full occlusion, inter-object camera paths and higher internal reflection orders are not solved. First-front-surface reflected photon sheets are actual Fresnel-weighted ray families, separately toggled, and their receiver footprints use the same angular-cell flux estimator as transmission. The glass shader's environment reflection is distinct from those light-transport branches.

Medium density is homogeneous extinction in inverse meters. Scattering albedo sets sigma_s / sigma_t. Anisotropy is the Henyey–Greenstein g parameter. The finite 0.1 m display bandwidth uses `(1 - exp(-sigma_t * ds)) / ds` so the local scattering factor is extinction-aware, with straight source/eye attenuation tracked separately. These controls affect photon radiance; the Rive curve view remains a density diagnostic. The general extinction-aware integration concept was inspected in `ShaderWeave/shaders/volume.glsl`; no third-party source was copied.

**Rays through glass** adds the retained internal Snell chords to the official Rive overlay, independent of the exterior-ray toggle. The chords retain optical delay, obey the path-leg filter and are clipped approximately to the optical gate (camera delay uses the chord midpoint). They do not add fog inside solid glass. The new beauty module and all controls are included in self-contained HTML exports, including offline re-export; older saved settings without these controls still load with defaults.

`node scripts/check-rivx-hourglass.cjs` also checks the normal-incidence reflected energy, internal optical delay, beauty/schematic image differences, ray toggle, albedo and anisotropy in Chrome. Screenshots are kept outside the webroot at `portfolio-work/hourglass-beauty-qa/`.

## Progressive receiver

The receiver has two independent estimators: angular-cell footprints and a progressive finite-kernel photon map. The latter samples the emitter cone uniformly in solid angle, traces the same Snell/Fresnel glass chain, and retains transmitted and first-reflected floor hits. Every hit stores source optical delay, air distance, branch and throughput. The source-normalized Gaussian kernel integrates to one over its truncated support. This removes the floor triangle interpolation entirely. Budgets range from 8,192 to 524,288 emitted rays; work is scheduled in roughly five-millisecond CPU batches. GPU draw cost still grows with the retained hit count.

Changing the camera, temporal window, fog attenuation or kernel radius reuses the hit population. Scene pose or IOR changes restart it. Increasing the sample budget retains the existing hits and extends the same random sequence; reducing the budget below the emitted count restarts at the requested lower count. Moving scenes use angular cells. Editing the photon budget or kernel, selecting the photon receiver, or pressing **Restart photons** automatically holds the current pose, rebuilds its fine transport, and accumulates the receiver. **Animate scene** resumes geometry motion; the optical pulse remains independent. The finite kernel, finite trace branches and beauty composition remain biased. This does not turn the volume sheets into a multiple-scattering path tracer.

`check-rivx-photon-receiver.cjs` verifies sample completion, retained gate/kernel edits, independent receiver output, moving-pose restart and self-contained offline replay without network requests.

## Surface reconstruction and responsive controls

**Remove angular spokes** selects the independent finite-kernel photon receiver. Disabling it selects the original angular-cell receiver for inspection. The star-shaped floor structure in that mode comes from finite angular charts and triangle interpolation, not a preferred physical direction. Screen blur does not remove its underlying cause. The volume remains the finite hourglass-sheet preview in both receiver modes.

The kernel slider spans 0–0.5 m. Zero removes extra world-space bandwidth but keeps a finite, approximately one-pixel raster footprint with matching kernel normalization, preventing division by zero and disappearing subpixel triangles. Finite positive bandwidth is bounded below by that pixel footprint. This is still a biased finite-kernel receiver: increasing samples reduces noise around its smoothed expectation; there is no decreasing-bandwidth PPM consistency claim. Narrow time windows reduce the effective number of photons.

Heavy scene, IOR, angular-resolution, receiver-allocation and medium-field changes show **Standby** immediately, then coalesce pending edits and yield two animation frames before performing the latest rebuild. Superseded jobs do not overwrite newer settings. Photon tracing proceeds in short batches with an emitted-ray progress bar and **Refining / Ready** states. Hidden or moving receivers say why accumulation is paused. Camera, gate, exposure and kernel changes stay interactive and reuse retained hits.

### First-load controls

The brochure initially opens the moving-chain preset. Previously, its enabled photon controls changed a receiver that was never drawn or advanced while animation continued; selecting a static scene appeared to repair them. Explicit photon edits now hold the current pose and show **Holding this pose** before refinement. Restarting clears the emitted population and starts the same reproducible independent sampling sequence. The motion hint explains how to resume animation.

The intersection observer covers the complete laboratory, including its controls. On a narrow screen, the controls can be visible while the canvas is below the fold; their queued work must still run. Host suspension, a hidden document, and a fully offscreen laboratory still pause work. `node scripts/check-rivx-hourglass-first-load.cjs` checks the animated first route without switching scenes, budget/restart/kernel edits, the cleared sample counter, batched completion, and mobile edits with the canvas below the viewport. Existing receiver tests cover suspended edits, retained samples and offline export.
