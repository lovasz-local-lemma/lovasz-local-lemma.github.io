# Flashlight Atlas

A reimagining of the original Rive scripting prototype: the flashlight is a way
to inspect a rendering method, as well as a light in the scene. The unselected
world remains a rasterized drawing. By default the same refracted photon field
is also visible outside the soft inspection circle. Inside the selected region, the study can
evaluate reflected and refracted rays or reconstruct a finite photon field.

## Connection to the earlier prototype

The three recordings under `media/brochures/rivex/rive-prototype-*.mp4` are from
the earlier scripting project, before the native RIVX laboratory. They show a
green wire-grid world, a movable flashlight, sampled lighting and several drawing
styles. The NPR recording exposes `flashlightEnabled`, `flashlightBrightness`,
`enablePathTracer`, `ptResolution` and `pixelRenderMode` in the Rive inspector.
Participating media and light-time selection in this study are new extensions;
the recordings are not evidence for those features or for GPU Canvas.

## Rendering contract

The pointer steers the torch on a camera-facing plane through the glass centre.
This keeps aiming continuous when the cursor crosses an object silhouette or
leaves a wall. It is an interaction surface, not geometry added to the scene:
shadow, reflection, refraction and photon rays still intersect the actual
objects. The reveal aperture follows the same pointer, without delayed steering.
Targets at other depths need not lie exactly under the screen-space cursor.

The torch editor adds source power (0–5×), yaw and tilt (±50°), point/disk/star
emission and adjustable RGB dispersion. Direction offsets rotate the continuous
base aim; **Centre direction on Rive aim** clears them. **Aim at glass** and the
three source arrangements also clear offsets. The screen-space inspection
aperture remains attached to the Rive reticle, so offset illumination can leave
it; **Show photons outside aperture** makes that transport visible.

Brightness scales direct source lighting, glass glints, fog, receiver deposits
and refracted beams before tone mapping. It is not exposure: ambient studio
lighting and the raster drawing remain present when source power is zero.
Disk and five-point-star sources sample positions in a plane perpendicular to
the torch axis. Radius is in scene metres, and all profiles retain the same
total emitted power. Their changes are caused by different ray origins, not
an image-space mask. A zero-radius disk or star reproduces the point source.
Five deterministic source samples approximate direct surface visibility; its
BRDF direction and inverse-distance factor still use the emitter centre. Direct
fog and its occlusion also use the central point. Photon receiver and refracted
beam paths use their actual sampled source position and optical distance.
Consequently this is a bounded area-light study, not exact area-light transport.

RGB separation uses indices `n − Δn`, `n`, `n + Δn` for red, green and blue in
both camera refraction and the refracted photon/beam paths. The default Δn is
zero. With dispersion enabled, emitted rays randomly select one of the three
bands; their band energy is multiplied by three to preserve expected flux at
the existing per-batch ray budget. Stationary averaging resolves the resulting
colour noise. Fresnel transmission and optical travel time use that ray's
index. This is three-band geometric dispersion, without continuous wavelength
sampling, colour-matching functions, diffraction or spectral fluorescence.

The browser renderer combines three evaluations of the same scene:

- The base pass draws actual triangles with depth testing.
- The ray reveal intersects the retained analytic scene and evaluates bounded
  reflection and refraction paths.
- The photon reveal tests the first scene hit from the flashlight. Only rays
  that reach the glass refract into and out of it. A finite Gaussian kernel is
  deposited on the next receiver, oriented to that receiver’s normal; the
  receiver is not assumed to be the floor. Depth testing rejects hidden splats.
  The two Fresnel transmissions and absorption are retained, and energy is
  normalized by emitted count. Optical path length includes the refractive
  index inside the glass.
- A separate pass reconstructs up to 1,536 refracted segments as soft, depth-tested
  photon beams. These share the same path generator and optical clock as the
  surface deposits. This is a finite-width biased display of single scattering,
  not a separate invented caustic or a converged volumetric photon estimator.

A stationary photon view keeps emitting independent batches. Two ping-pong
RGBA32F fields retain the arithmetic mean of linear receiver and beam radiance;
current batches use additive RGBA16F targets. The composite applies a small
spatial reconstruction, then tone mapping. There is no four-batch cap and no
growing path array. Fixed GPU memory holds the fields while the emitted count
keeps increasing. The finite kernel stays fixed: this is progressive averaging,
not progressive photon mapping with a shrinking bandwidth, nor a proof of
convergence to the full transport equation. Half-float batch sums and eventual
Float32 mean precision remain numerical limits.

A full scene update has five render passes: raster/depth, receiver photons,
volume beams, the running mean and composition. An unchanged refinement reuses
the raster/depth image and submits four. `metrics.passes` records the five-pass
update contract. Editing uses 512 rays; after 160 ms without changes the mean
restarts with the selected stationary batch size, from 512 to 65,536 rays.
Changing geometry, light, material, optical gate or animated medium invalidates
the stationary mean. Rive hover animation does not. Turning progressive averaging
off holds a single full batch. The 512-ray movement preview uses 45% of the
stationary receiver-kernel radius, retaining the kernel-area normalization, so
sparse samples do not become large luminous patches.

**Smooth moving pulse** allows a separate, deliberately biased temporal preview.
Nearby gate-only changes keep independent receiver and beam batches: the first
six warm up as an arithmetic mean, then each update contributes 1/6 to an
exponential moving average. This has a decaying history, not a six-frame hard
cutoff. It introduces a short pulse trail; its duration depends on the update
rate. The direct fog and Rive ruler use the current gate while the retained
receiver/beam fields trail it. A gate jump greater than 55% of the temporal width (minimum 0.08 optical
metres), geometry/aim/material edit or changing density field clears it. Holding
the gate still for 160 ms exits preview and starts a fresh arithmetic mean at
the exact held gate. The history checkbox and status distinguish this blur
from stationary refinement. Animated density does not reuse the gate history.

The direct medium is a single-scattering approximation evaluated along camera
rays inside the flashlight cone, with scene occlusion. Drifting clouds modulate
density; absorbing pockets increase extinction; the azure setting is an artistic
emission tint, not an excitation/spectral fluorescence simulation. Turning the
medium off disables both attenuation and scattering.
Two additional gyroid modes draw thin membranes or dense pockets separated by
nearly empty regions. Scale changes the periodic field; contrast sets its dense
and thin extremes. The field modulates both direct fog and refracted beam
brightness. For these modes, the camera integral accumulates density across its
48 samples within the illuminated interval, while source attenuation uses three
midpoint samples. Beam attenuation uses short source/view columns. This bounded
quadrature is an appearance approximation: it does not resolve all density
variation, integrate complete refracted heterogeneous paths or implement delta
tracking. These are new browser adaptations inspired by RadianceLab's procedural
media and temporal blur studies, not copied native solver code.
The photon receiver has a finite reconstruction width. These choices make a
responsive, deliberately biased visual study; this is not a converged global
illumination solver or a benchmark of unbiased estimators.

The two timing variables have different roles: animation time moves the display;
the light-time gate selects source-to-sample optical path lengths, in metres.
The camera leg is omitted from that clock. This is a view of a propagating pulse,
not a camera-return time-of-flight measurement. A rendering frame is not a unit
of physical photon travel time.

## Use the instrument

Open `index.html` through the portfolio server or another localhost/HTTPS server
in a WebGPU-capable browser. The page loads its Rive runtime and assets locally.

- Drag the scene to aim. The Rive reticle follows the same state used by the GPU
  renderer.
- Select Raster, Ray or Photon in the Rive panel. The ordinary raster baseline
  remains outside the circular reveal.
- Drag the aperture, medium and optical-path sliders. The gate selects source
  time; Hold pulse lets you inspect one instant.
- Use four experiment presets and three source arrangements: above, below the
  camera, or from the right. The glass is raised to leave room for its volume
  caustic. Source presets aim at its current position.
- Select ten paired zebra materials: each band changes roughness, conductor
  response and optional emission, as well as color. Marble and iridescence are
  procedural approximations. Optional seven-second cycling chooses a different
  pair; Hold pulse also holds this animation.
- Select Gyroid membranes or Gyroid pockets for strongly structured fog, then
  adjust their enabled scale/contrast sliders. Animate the medium drifts its
  density field. The Light in flight preset holds that field while sweeping the
  gate, so the short photon history can remain useful.
- The original oxide/copper pair is retained. Additional pairs include
  procedural walnut/brass, rough metal/clear refractive glass, paper/laser foil
  and anisotropic steel/copper. Glass bands evaluate the same bounded refraction
  routine as the main glass sphere. Normal relief perturbs the shading normal,
  not the silhouette. The anisotropic highlight and angle-dependent foil colors
  are approximations, not a measured BRDF or spectral diffraction solver. Rough
  microfacet transmission is not implemented.
- Classic, liquid-glass and Mondrian slider handles are ordinary Rive geometry.
  Liquid stretch and squash respond to dragging; reduced motion suppresses
  elastic motion and automatic material cycling.
- The raster-wire slider makes the geometric baseline explicit. **Show photons
  outside aperture** adds the same receiver and beam field onto the raster
  baseline beyond the inspection circle; it does not use noisy photon intensity
  to switch a surface between rendering methods. Pulse width controls the same temporal kernel on surfaces and
  in the medium.
- Arrow keys aim; `1`, `2`, `3` select the rendering method; `T` toggles the gate.
  The Touch & keyboard controls expose the same state as ordinary HTML inputs.

The interface is a real ordinary Rive file, `interface.riv`. The host currently
handles aim/slider drags and forwards them into its view model; the mode,
time-gate, playback and restore buttons use the native Rive state machine.

The additional scene editor uses HTML controls for source XYZ, the XYZ position
and radius of both spheres, normal relief, finite kernel width and aperture feather. Geometry,
intersections, camera refraction, direct light, photon emission and beams share
those values. The zebra pedestal follows its XZ position and radius; the original
zebra pattern keeps its object-relative coordinates. **Aim at glass** projects the current glass center into the native
Rive reticle. Keep the source outside the glass and objects separated; this is
not a collision editor. An internal emitter is rejected by the external-source
photon model rather than producing a false caustic.

**Add to list** retains up to 100 named setups locally. JSON export/import carries
only names and validated numeric settings. Import merges unique entries and
commits only when the whole file is valid and fits the limit. Invalid or oversized
imports leave the prior list intact. Selecting a saved setup restores all
settings, including source, glass, material and reconstruction controls.

## Browser export

**Export this RIVX Suite** creates a self-contained HTML file containing the Rive
interface, runtime, WGSL renderer, selected state and curated setup list. It opens with animation
held and can export itself again without network access. Repeated downloads get
numbered names. A WebGPU-capable local-file context is still required for GPU
execution; packaging does not remove the browser requirement.

Offscreen and host-suspended instruments stop GPU submissions. The complete main
region determines vertical visibility, so controls below the viewport remain
usable without suspending their render. Reduced-motion preferences start the
pulse held. A stationary photon view continues refinement when enabled; raster,
ray-only and held-batch views retain their result until an edit. Reset rebuilds
the Rive and GPU instances.

## Delivery terminology

RIVX Studio is the native authoring and research application. RIVX Draw names the
experimental drawing backend. RIVX Suite names a browser package that carries
the particular renderer and scene it needs. This study's host-driven route is a
RIVX Suite example; it is not a port of every native backend feature.

A genuine GPU Canvas version additionally puts the GPU program and Rive-owned
interaction inside the Rive document. An ordinary Rive overlay alongside a
JavaScript-driven GPU renderer is identified separately. The browser capability
of one route must not be inferred from the other.

The older companion native document was compiled and rendered in the official local
CLI, including native aim/slider gestures, hover, reset and pulse controls. Its
unsigned artifact and editable authoring remain outside the website. The new
material library, beam pass, medium variants, handle skins, progressive fields
and editable setup list are currently
implemented in the ordinary Rive + browser WebGPU Suite. The private GPU Canvas
companion has not been rebuilt or signed for these additions. Official
browser playback requires its separate signing step. On native backends without
half-float targets, the raster pass uses perceptually encoded RGBA8; photon
contributions remain linear and additive. This has a finite precision/range and
is not a numerical reference for the browser's half-float route.

## Verification

With the portfolio served locally and Playwright/Sharp available to Node:

```text
node scripts/check-rivx-flashlight-renderer.cjs
node scripts/check-rivx-flashlight-enriched.cjs
node scripts/check-rivx-flashlight-atlas.cjs
node scripts/check-rivx-flashlight-progressive.cjs
node scripts/check-rivx-flashlight-editor.cjs
node scripts/check-rivx-flashlight-temporal-medium.cjs
node scripts/check-rivx-flashlight-torch.cjs
node scripts/check-rivx-flashlight-aim.cjs
node scripts/check-rivx-flashlight-embed.cjs
```

The renderer check compares fixed-state raster, traced, photon, gated and medium
images, including an index-of-refraction change and a larger photon budget. The
instrument check uses real Rive button/slider gestures, keyboard controls and
presets, then reopens and re-exports its generated HTML with HTTP blocked. The
embed check loads the actual brochure card with the shared sizing/lifecycle code
at desktop and narrow widths. Screenshots and reports are saved outside the
published repository under `portfolio-work/flashlight-atlas-review/`.

The follow-up adds a direct GPU readback test: the two-batch stored mean equals
the arithmetic mean of independently seeded batches. Refinement runs to 128
batches; twelve batches lower RMS field error against that reference compared
with one. Source changes reset the mean, the three arrangements have different
receiver footprints, and missed glass or a pre-arrival gate has zero receiver
energy. The editor check verifies changed pixels for source, sphere, material
and normal controls, cheap motion preview, JSON restoration and transactional
import failure. It also tests continued refinement with the lower controls in
view, host pause/resume, mobile width and offline export with HTTP blocked.
These reports and images are in `portfolio-work/flashlight-followup/` outside
the published repository. Export size is approximately 4.8 MB and varies with
the packaged code and curation.

The temporal/medium check compares preview and stationary footprints for the
same 512 emitted rays, verifies the two-frame field mean and the 1/6 EMA by GPU
readback, and checks reset on geometry edits, large gate jumps and returning to
a held gate. It also verifies gyroid scale/contrast/drift change actual rendered
pixels and tests the host's moving, held and history-disabled states. Its images
and report are in `portfolio-work/flashlight-temporal-medium/`. The editor test
includes nondefault gyroid/history values in JSON and offline Suite restoration.

## Transport and export scope

The emitter can be moved in world space; aiming changes its axis through the Rive
reticle’s continuous target plane, with optional yaw and tilt offsets. The image-space inspection circle alone is not the
light’s support. The outside-photons option therefore includes the actual caustic
receiver support, even when refraction sends it outside that circle. An emitted
ray that misses the glass cannot produce a glass caustic. The model follows the
first dielectric entry, exit and receiver; it does not trace arbitrary recursive
specular chains or multiple volume scattering. Reflected views are bounded
analytic evaluations, and their background is an artistic studio environment.

Material and volume studies draw on the same ideas explored in the portfolio’s
RadianceLab and LTC projects, but this renderer is a compact dedicated browser
adaptation, not a wholesale port of those solvers. The purpose of Rive here is
the native instrument, state-bound sight and light-time ruler, while a WebGPU
renderer evaluates the scene. Export preserves both sides and the chosen state.

The torch regression reads the actual GPU receiver field. It checks linear power,
zero emission, different point/disk/star transport, exact point recovery at zero
area radius, direction changes and spatial RGB separation. It also uses the
real HTML controls beside the Rive instrument, verifies setup restoration and
reopens a self-contained Suite with HTTP blocked. Evidence is saved in
`portfolio-work/flashlight-torch/`. The silhouette sweep still checks three
source positions and adjacent one-pixel aim changes after the uniform extension.

## Optional Living fog

**Living fog** adds a persistent smoke simulation directly to Flashlight Atlas.
It starts off, preserving the original optical study. The **Living fog · compute**
preset selects a wider, brighter view of the plumes. Drag the flashlight to stir
the air, use **Stirring** to control that force, and use **Smoke source** to scale
the three floor emitters. **Freeze flow** retains the volume while stationary
photon batches refine the lighting; **Reset plumes** restores the seeded shape.
The optional **Heat in the smoke** view reads temperature from the same retained
volume, making its structure easier to inspect outside the direct beam.

`flow.js` and `flow.wgsl` retain density, heat and positive-face velocities on a
40 × 32 × 40 grid (51,200 cells). Initialization supplies developed plumes once;
later steps transport the retained state. Each step applies first-order
semi-Lagrangian advection, injection and buoyancy, a stylized helical beam jet,
vorticity confinement, finite-volume divergence, 14 weighted Jacobi pressure
iterations with relaxation .8, and the matching pressure-gradient subtraction.
The stencil accounts for unequal cell spacing. Voxelized spheres, cube,
pedestal and chamber boundaries enforce zero normal velocity.

The same sampled density supplies direct fog and extinction on incident
source-to-surface paths, refracted volume beams, and photon paths to receivers.
Source-to-glass and glass-to-sample air columns are separate from absorption
inside glass; camera columns attenuate the view. These short density integrals
remain a bounded single-scattering and finite-photon approximation. They do not
constitute complete heterogeneous tracking or multiple-scattering transport.
A bounded ambient fill also makes unlit smoke visible; it is an artistic lighting
term rather than a multiple-scattering solution.

The simulation encodes at most one 1/30-second step per update, for a maximum
rate of 30 Hz. It discards accumulated backlog instead of dispatching a burst
after a delay. Hidden instruments stop submissions. Live flow caps each photon
batch at 2,048 rays; freezing the volume restores the selected full count and
allows the stationary mean to refine. Every changed field invalidates retained
lighting. A frozen field can initialize or reset once without starting motion,
including under reduced-motion preferences.

This is a coarse visual fluid approximation. Face components share a
cell-center backtrace, advection dissipates detail, and 14 pressure iterations
reduce divergence without tightly converging the global pressure problem.
Moving objects update the obstacle mask without imparting boundary velocity;
newly exposed cells fill by transport. Faster smoke and heat dissipation near
the closed top boundary keeps the field bounded. The initial plumes are an
explicit seed, not a physically elapsed warm-up, and flashlight stirring is an
artistic force rather than radiation pressure.

Suite export packages both compute files with the renderer, runtime, ordinary
Rive interface and scene settings. On reopening, enabled Living fog starts as
a **frozen seeded setup**. Export does not serialize the evolved volume or its
velocity history. Saved setup lists also retain configuration rather than a
simulation snapshot. This browser implementation does not imply that the native
RIVX exporter automatically generates fluid simulations.

The base raster, ray and photon evaluations still use vertex/fragment render
passes; Living fog adds compute dispatches and persistent simulation resources
before them. Rive's documented WGSL support currently excludes compute shaders,
so this exact execution path requires the WebGPU host. That is an API boundary,
not a claim that fluid effects require compute: NVIDIA's GPU Gems Chapter 38
implements advection and pressure projection using fragment programs and render
passes. A corresponding GPU Canvas implementation would require its own
algorithm/resource adaptation and verification. Prismatic Garden's fragment
study remains another example whose visual effect is not exclusive to the host.

References: [Official Rive WGSL support](https://rive.app/docs/scripting/wgsl-shaders#wgsl-support)
and [NVIDIA GPU Gems 38: Fast Fluid Dynamics Simulation on the GPU](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-38-fast-fluid-dynamics-simulation-gpu).
