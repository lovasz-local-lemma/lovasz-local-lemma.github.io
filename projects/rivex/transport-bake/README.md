# One pulse, two representations

A fixed-scene browser RIVX Suite: finite hourglass volume sheets, stratified
receiver samples, and an HDR receiver-UV atlas. The official Rive advanced
WebGL2 runtime draws projected contour and time-clipped ray marks using the
ordinary `hourglass/context.riv` shape pool. WebGL draws the stored fields.

Two preparation profiles share the same transmitted source and glass:

| Profile | Receiver atlas | Emitted rays | Spatial radius | HDR atlas bytes |
| --- | --- | --- | --- | --- |
| Compact | 128 × 128 × 16 RGBA32F | 32,768 | 0.09 m | 4 MiB |
| Fine | 256 × 256 × 64 RGBA32F | 131,072 | 0.035 m | 64 MiB |

`?quality=fine` opens the fine preset with a narrow gate centered on stored
slice 26 of 64 and 12× receiver display gain. The default remains compact.
Changing profile prepares a new bake in small yielding batches, reports progress,
and disposes the previous GPU resources when ready. Camera and time playback do
not retrace. The source, sphere, IOR, fog and spatial kernel stay fixed.

Directions use equal-solid-angle radial strata and golden-angle azimuths. Each
path is traced through both glass interfaces by `hourglass/transport.js`; the
optical clock includes air length plus refractive-index times glass length. The
transmitted branch alone is retained. This deterministic finite quadrature is
chosen for a clean drawing; it is not an unbiased-estimator claim.

Each hit contributes Fresnel-weighted, source-normalized linear flux density,
with source-side fog attenuation, to a normalized finite Gaussian kernel in the
receiver chart. The chart covers the hits plus a guard border. Energy divides
linearly between adjacent optical bins. No tone mapping or exposure is stored.
The discrete texel mass is checked against deposited energy. Fine mode covers
7.06115–9.46351 optical metres at about 0.03813 m spacing for this scene.

The same Gaussian gate center/width affects volume, direct receiver splats and
atlas reconstruction. Ordinary Rive ray marks use the same center/width but show
the nominal hard interval, rather than the Gaussian tails. The enlarged slice inspector
shows a stored temporal basis layer, using one fixed logarithmic curve across
all layers. Contact-sheet clicks isolate that arrival window in the 3D scene.
A layer is an arrival band, not the entire caustic. This scene starts with a spot,
then gives rings and finally truncated arcs as the illumination cone ends. Ring
shape is geometry-dependent. The playback kernel can be narrower than the sample
spacing, deliberately exposing temporal discretization.

## Keep the volume; sample the receiver

The medium does not store a separate 3D picture at every time. Preparation traces
a finite family of rays, joins neighboring exterior segments into hourglass
sheets, and stores optical travel length at the vertices. At playback, the GPU
interpolates that length over each triangle and multiplies its contribution by
`G(L; τ, σ) = exp(-0.5 ((L - τ) / σ)²)`, with `σ = max(0.004, width / 2)`.
Moving the clock therefore selects a soft moving part of the existing geometry.
Neither that operation nor moving the camera requires another transport solve.
Geometry, angular sampling and the interpolated clock are still finite approximations.

The receiver can also remain live: each retained hit has its own position,
energy and optical length, so the splat route evaluates the same gate per hit.
The atlas route moves that work into preparation. It distributes hit kernels
over a UV chart and adjacent optical-time layers, then combines those layers
with gate values at their sample times. Symbolically:

- Retained surface: `sum_p energy_p K(x - hit_p) G(L_p; τ, σ)`.
- Baked surface: `sum_j atlas_j(x) G(t_j; τ, σ)`.

The atlas approximates the retained surface. Close agreement is the intended
result, especially with 64 time layers; it is not a filter preset. Finite texture
resolution and sampling the time gate introduce differences, most visible when
the window is narrower than the layer spacing. The common beauty blur and tone
curve can conceal those differences. The receiver-only comparison exposes both
routes before that finishing pass, using the same chart and scale.

This asymmetric choice is a representation experiment, not a rule that surfaces
must be baked or volumes cannot be baked. Here, the hourglass already offers a
compact continuous-in-time construction, while a receiver atlas trades many
overlapping hit instances for texture lookups. A general volume/time atlas would
add a spatial storage dimension: a general volume/time table is(x, y, z, t), whereas this receiver atlas is(u, v, t). The present fixed-scene example makes no claim
of calibrated speedup, arbitrary scene editing or complete multiple scattering.

The linked schematic projects ray legs recovered from the actual retained sheet vertices, plus glass guide segments, and shows a soft
gate beside the sampled receiver weights. Drag its time plot or use arrow keys
to scrub the shared clock. Its visible pulse bands stop at three standard
deviations for clarity; the renderer uses the Gaussian gate. Glass segments in
the schematic contribute optical delay but are not participating-medium sheets.

Receiver display gain is a presentation control and never changes stored flux
or reported mass. Atlas playback skips texture reads for weights below 1e-5.
Fine mode trades substantially more storage/preparation for a cleaner thin band;
it is not an assertion that an atlas always compresses photon records. The atlas
is camera independent for the diffuse receiver, not for view-dependent glass.

Volume sheets, clamped view Jacobians, spatial/time kernels and beauty
reconstruction are biased. There is no multiple scattering, arbitrary scene
editing, calibrated surface-to-volume comparison or camera-return clock. This is
a synchronized source-clock representation study, not RadianceLab parity.

Export packages exact atlas floats, hits, volume attributes, controls, camera,
selected layer, Rive bytes, runtimes and modules. Reopen uses stored records
without tracing/network. It is a self-contained RIVX Suite HTML, neither an
ordinary all-in-one .riv nor a signed GPU Canvas document nor a native .rivx
player. The fine standalone export is roughly 102 MiB because base64 preserves
all 64 MiB of float texels, 4 MiB of hit records, and runtime/volume data.

The neighboring `camera-lattice/` example makes the other choice: 45 actual
256×192 views become ordinary keyed Rive images. The two-axis camera selector
runs in the host, but no live 3D or shader pipeline runs during its playback.

Checks:

- `scripts/check-rivx-transport-bake.cjs`: compact energy, interactions, native
  Rive marks, lifecycle, offline round trip and mobile layout.
- `scripts/check-rivx-fine-transport-camera.cjs --export`: fine preparation,
  mass, moving arrival footprint, detail changes, 64-slice offline round trip,
  real two-axis Rive camera selection and downloaded artifact bytes.


Additional checks for the representation comparison:

- `scripts/check-rivx-receiver-comparison.cjs`: actual selector pixels,
  registered linear GPU fields and independent mass sums, diagnostic controls,
  cached readback, suspension, mobile layout and exact offline canvas restoration.
- `scripts/check-rivx-temporal-schematic.cjs`: early medium/zero receiver, later
  arrival support, bin weights, linked pointer/keyboard clock, unchanged atlas
  and hit records, fixed desktop/mobile bounds and no idle drawing loop.
- `scripts/check-rivx-camera-work.cjs`: orbit redraws the GPU scene and Rive
  projection while keeping camera-independent contact sheets, temporal charts,
  comparison readbacks and energy reductions cached. Time/field edits, playback
  and resizing still refresh those instruments. This removes repeated CPU work
  without reducing the render resolution or photon budget.
