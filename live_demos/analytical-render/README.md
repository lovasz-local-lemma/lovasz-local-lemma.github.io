# LTC Light Studio

**Direct surface lighting with polygon integrals and fitted GGX linearly transformed cosines.**

An area light illuminates a point from a continuum of directions. Sampling those
directions is general, but it also introduces variance. This project investigates
where the angular integral can instead be evaluated deterministically—and what
must be approximated to extend that advantage from diffuse surfaces to materials
and visibility.

The main WebGPU garage brings together published GGX LTC tables, procedural
materials, a bounded luminous volume and selected optical extensions.
The diffuse study exposes the exact projected-solid-angle identity that motivates
the approach. Older material, geometric and numerical motion studies remain
available as context, with their different models identified explicitly.

The contribution is an executable integration and inspection of these methods,
not a new LTC derivation or a general closed-form rendering solution. The fitted
LTC method is credited to [Heitz, Dupuy, Hill and Neubelt, SIGGRAPH 2016](https://eheitzresearch.wordpress.com/415-2/).

## Study structure

- **Diffuse integral:** the exact polygon boundary evaluation under its emitter,
  horizon and visibility assumptions; a uniform-emitter Monte Carlo comparator.
- **LTC & materials:** the fitted GGX garage, followed by clearly labeled earlier
  deterministic material approximations.
- **Optics & geometry:** mirror/film models, analytic quadrics and shape studies,
  separated from the central lighting result.
- **Motion studies:** numerical Rapier trajectories supply transforms to the
  renderer. The lighting method does not make the physics analytical.

The garage opens in split comparison. Family tabs narrow the scene selector, retaining all
seventeen original scene identifiers and URL entry points. The larger image is first,
with a compact glass control instrument beside it and live mathematical inspection
below. On shorter desktop windows the top spacing contracts to keep the image visible.

### What the comparison establishes

In the WebGPU garage, **Integral / Monte Carlo / Compare** evaluate the same
opaque direct-light model with two methods: fitted LTC versus uniform-emitter
Monte Carlo. The comparison covers diffuse lighting, the isotropic GGX base,
the blended metallic base, and an independent dielectric coat lobe. Glass and
thin-film extensions, the environment and optional ambient fill remain shared.
This is a more useful check of the fit than the earlier diffuse-only comparison,
but it is not a full path-traced reference. With low roughness, uniform-emitter
sampling can miss narrow highlights at low sample counts.

The hero scene uses unoccluded emitters in both estimators. The former planar
blocker is archived in `swap_out/garage-planar-blocker.json` for a separate
visibility study; its restricted diffuse clipping code remains dormant. Normal, roughness and blend-mask
diagnostics display shared inputs rather than two lighting estimates. The
earlier scene kernels still compare diffuse light while sharing their other
material terms. For an isolated diffuse comparison, use **Open diffuse comparison**,
which selects studio, freezes motion, disables fill and enables clipping.

Only the WebGPU garage executes the fitted LTC and specialized glass/volume
kernel. CPU/WASM provide diffuse and selected mirror/film reference paths; they
are not feature-equivalent garage implementations. The panel identifies this
scope when a backend changes. Switching to JS/WASM opens a compatible diffuse
study with a smaller image budget; returning to GPU restores the saved scene
and settings. The modeless **Learn more** panel stays open until explicitly
closed. [Backend support and measured cost](docs/BACKENDS.md) distinguish absent
features from execution speed using actual equal-workload CPU frames.

### One coordinated material-and-volume treatment

**Extra fancy**, enabled by default in the GPU garage, adds a clearly bounded
organic volume cube, a fine metal edge cage, raised-edge hollow-ring shading
normals and a flowing floor inlay. One switch restores the simpler material
comparison. The organic network is procedural: it is not a Physarum,
reaction-diffusion or SmoothLife simulation. Relief changes shading normals;
it does not claim new displaced geometry or silhouette detail.

The cube has actual density, Beer extinction, numerical single scattering and
teal/gold emission. Both image halves share that volume integration. LTC still
evaluates the opaque direct surface lighting. The [extra treatment notes](docs/EXTRA_FANCY.md)
explain this separation and why uniform light animation is compatible with LTC.

Expand **Atmosphere & motion** to pause the field, isolate its scattering and
emission, or turn off the bronze light frame. With Extra fancy off, the original
room-haze settings become editable: uniform, rolling-noise and filament density.
Their values are preserved while the coordinated preset is active. The
[medium model](docs/GARAGE_MEDIUM_MODEL.md) records the numerical approximations,
including omitted volume shadows from objects and secondary glass paths.

## Demo Controls

- `Integral`, `Monte Carlo`, and `Compare` choose what is displayed. `Compare` reveals a
  draggable splitter over the two simultaneously rendered estimates.
- `Backend` selects the visible producer path. `GPU` runs a WGSL compute shader
  that writes the presentation texture directly. `WASM` runs a compiled C
  frame renderer into linear memory and uploads the pixels into the same WebGPU
  display pass. `JS` keeps the scalar CPU reference path for comparison.
- `Subpixel samples` controls shader-side supersampling on the WebGPU producer.
  The compute path resolves up to four rays per pixel into the shared
  presentation texture; the default is two subpixel rays. WASM/JS keep their
  single-sample reference paths.
- `Render scale` defaults to 3 on GPU, 0.5 on JS and 1 on WASM; it changes the internal resolution while keeping
  the displayed canvas size. The backing image follows the viewport aspect ratio,
  using a 200-pixel base height and a shared 1280 x 800 allocation limit. Both
  dimensions are reduced together at that limit, preserving the full view.
- `Target FPS` controls the animation cadence up to normal display rates. The
  frame FPS readout reports observed cadence; producer/present readouts report
  CPU-side WebGPU submit cost.
- `Scene` switches between seventeen receiver/light arrangements, including light
  sweeps, stacked spheres, a moving trio, a one-bounce mirror scene, a
  thin-film iridescence scene, an analytic quadrics scene, and a mesh of quad
  emitters. `LTC bay` adds a darker polygon-light material scene with vertical
  panels, procedural surface normals, and glossy coated/metallic materials.
  `Physics pile` and `Torus toss` use Rapier rigid bodies to drive live object
  transforms. `Shape lab` keeps several primitives still for material and
  silhouette inspection. `BSDF lab` shows procedural car paint, paper, brushed
  metal, rough glass, and clear glass variants under the same quad lights.
  `Analytical garage` combines fitted GGX LTC highlights, dispersive two-interface
  sphere glass, and a numerical organic volume cube under the Extra fancy switch.
- `Material anatomy` exposes shading normals, base roughness, blend mask, base
  lighting and coat lighting. Normal strength, coat strength, material blending
  and texture frequency control actual garage shader parameters. The floor
  roughness slider also drives the explicit geometric probe below the image.
- `Aperture` enables actual thin-lens rays in the garage, rather than blurring the
  image afterward. Eight joint lens/subpixel samples meet the selected focal plane.
  Aperture defaults to zero for a sharp initial image. Field diagnostics remain
  pinhole and bypass exposure/false-color mapping.
- `Animate` moves the rectangular light and scene objects. The default MC count
  remains low to expose stochastic noise; increase it to inspect convergence.
- `Stylized ambient fill` adds a small deterministic sky/floor/wall term so curved
  receivers do not collapse to black where direct light is absent. Disable it to
  inspect the pure direct-light result.
- URL parameters can preload a state, for example:
  `?mode=split&scene=grazing&split=0.7&animate=0&fill=0`.

## Live LTC inspection

The lower instrument is a **geometric floor probe**, not a screen-picked shaded
pixel. It uses point (0,0.002,0), upward geometric normal, the scene camera and
first emitter. The garage floor slider supplies roughness; other scenes use
their floor material.

The instrument decodes the same published 64² RGBA16F lookup data as the shader
and uses the same bilinear coordinates: roughness horizontally and
sqrt(1 − n·v) vertically. It displays the actual matrix, amplitude A/B, original
spherical polygon, transformed polygon, and approximate edge/horizon factor.
The F₀=.04 response is one unoccluded isotropic GGX lobe before texture normals,
material blending, coat, visibility, radiance multiplication and tone mapping.

Geometry refreshes at about 30 Hz during animation; numerical labels refresh
at about 10 Hz. Paused edits always refresh immediately, including the last
light/camera event. This JavaScript instrument illustrates the live computation
without synchronous GPU readback. The three-step explanation and expandable
diffuse identity connect these intermediates to the lighting model.

## Current Kernel

For each visible point, the renderer computes:

```text
E = Le / 2 * sum_i atan2(|u_i x u_j|, u_i . u_j)
              * n . normalize(u_i x u_j)
```

where `u_i` and `u_j` are normalized directions from the shaded point to
adjacent vertices of an oriented rectangular light. The spherical polygon is
clipped to the receiver's upper hemisphere before evaluation.

This is analytical direct lighting, but not a symbolic image equation. The
finite `sum_i` is the exact boundary evaluation for the polygon light, not a
Monte Carlo sample loop. A renderer still has to evaluate rays/pixels unless the
camera, geometry, visibility, tone mapping, and display reconstruction are also
reduced to a closed-form image-space formula.

## Arithmetic throughput probe

The collapsed panel runs a synthetic arithmetic probe, separate from the actual
polygon integral and from renderer speedup evidence. It runs only when requested
with **Run Kernel**, so scene and backend changes do not trigger extra benchmark
work. Only the selected probe runs:

- JS CPU: scalar JavaScript baseline.
- WASM SIMD: compiled WebAssembly modules in `wasm/analytic_renderer.wasm` for
  the visible frame producer and `wasm/analytic_bench.wasm` for the kernel lab.
- WebGPU: a compute shader that evaluates related arithmetic on
  many lanes in parallel when WebGPU is available.

Its analytic/MC labels are historical kernel variants; the sampled probe is not
an unbiased reference for the actual lighting kernel. CPU/WASM arithmetic timing
and GPU submission/readback/reduction have different measurement boundaries.
Neither these numbers nor the renderer's CPU submit times establish GPU elapsed
time. The visible GPU backend is a full WGSL producer: it ray/intersects the small demo
scene, evaluates the analytical quad-light formula or MC comparison, writes an
`rgba8unorm` storage texture, and then the shared fullscreen WebGPU pass presents
that same texture. The WASM backend now renders the same small scene into WASM
linear memory with optimized C, then uploads that buffer into the shared WebGPU
presentation texture. The JS backend keeps the scalar CPU reference path. The
readout separates producer cost from present submit cost.

## WebGPU And WASM

Browser WebGPU resources are owned by the browser API. WASM cannot directly grab
the swapchain framebuffer pointer. The page still uses an HTML `<canvas>`
element because that is the browser surface WebGPU presents into. When WebGPU is
unavailable, a Canvas2D fallback presents the JS frame instead. The normal GPU
presentation paths are:

- WASM CPU producer: render into WASM linear memory, expose a typed-array view to
  JavaScript, then `queue.writeTexture` into the shared WebGPU display texture.
- WebGPU producer: run a compute shader that writes a storage texture directly,
  then present that same texture with the shared fullscreen pass.
- Emscripten/WebGPU bindings: call WebGPU from WASM through bindings, but the
  resource lifetime and presentation model are still browser WebGPU concepts.

To rebuild the visible WASM renderer:

```powershell
emcc wasm\analytic_renderer.c -O3 -ffast-math -msimd128 --no-entry -s STANDALONE_WASM=1 -s INITIAL_MEMORY=8388608 -s ALLOW_MEMORY_GROWTH=0 -s ERROR_ON_UNDEFINED_SYMBOLS=0 -o wasm\analytic_renderer.wasm
```

## Material Scope

Supported now:

- Lambert diffuse receivers with closed-form rectangular direct lighting.
- Optional deterministic sky/floor/wall fill for readability.
- One-bounce ideal mirror reflection in the mirror scene.
- Thin-film reflective material with an angle-dependent wavelength phase term.
- Exact sphere, capped cylinder, and capped cone intersections in the
  GPU/WASM/JS renderers.
- Mesh lights as a small finite set of rectangular emitter faces. Direct diffuse
  lighting is the sum of the same closed-form quad integral over each face.
- Oriented quad emitters, including vertical wall panels.
- A compact, GPU-only `Analytical garage` kernel with fitted GGX Linearly
  Transformed Cosine shading for polygon lights. It bilinearly reads the
  published 64 x 64 matrix and amplitude tables, transforms each light polygon,
  and evaluates its boundary without runtime light samples. The mathematical LTC
  family permits exact integration, but this kernel uses a rational edge
  approximation and a clipped-sphere horizon approximation. The other
  scenes retain the earlier deterministic LTC-style glossy approximation.
- Exact entry and exit refraction for sphere glass in the garage kernel,
  including dielectric Fresnel, Beer-Lambert absorption, and deterministic RGB
  dispersion. Other glass paths remain single-interface approximations, and
  rough transmission is not yet a full microfacet BTDF.
- Retained experimental GPU visibility code (archived from the hero): one thin rectangle
  parallel and axis-aligned to a rectangular emitter is perspective-projected into the emitter
  plane, intersected with the emitter rectangle, and subtracted as another
  spherical-polygon boundary integral. Arbitrarily oriented, curved, and
  overlapping blockers are not handled yet.
- Shader-side 1/2/4 sample antialiasing on WebGPU.
- Procedural wave/cellular/scratch/panel/FBM/tile/flake normal and albedo
  fields with a small shading-only displacement offset. Recent material scenes
  keep floor normals crisp and shallow, with displacement disabled, while
  thin-film and car-paint objects use procedural normals/masks to drive
  iridescent phase and surface variation. The current garage uses a continuous
  three-dimensional procedural normal field, a mask-blended pair of full BSDF
  responses, and an independent dielectric coat over the attenuated base.
- Exact oriented box, oriented cylinder, hemisphere, and capsule intersections,
  plus SDF-style torus intersections. The torus path is a numerical
  signed-distance march, not a closed-form quartic solve.
- Rapier-driven rigid-body scenes. The physics simulation is numerical and
  external to the analytical lighting kernel; the renderer consumes the body
  transforms each frame. Rolling cylinders now render with their physics
  orientation instead of staying visually upright.

Good next analytical targets:

- fitted anisotropic GGX tables instead of the older tangent-aligned heuristic
  extension of the isotropic fit (the current garage defaults to isotropic);
- exact transmission for boxes and other closed primitives;
- unions and overlap handling for several analytical blocker silhouettes;
- normal-map texture input in addition to procedural normals;
- true geometric displacement/parallax with secondary visibility;
- oriented cylinder/cone rendering from physics rotations;
- richer multiple-scattering layered models beyond the current two-lobe
  dielectric-over-base approximation.

## Boundaries

The core comparison is direct lighting only. The optional bounce fill is a
deterministic visual aid, not a closed-form global illumination solve. One
parallel planar rectangular blocker has a retained, currently dormant analytical
visibility path in the garage kernel; arbitrary blockers, interreflection, participating media, and
caustics are not solved in closed form. Fitted LTC itself is a deterministic
approximation to GGX, and the torus still uses numerical SDF marching. Those are
where a practical analytical renderer becomes a hybrid: closed forms and
differentiable equations where they fit, numerical root solves or quadrature
where they are stable, and Monte Carlo only where the scene stops being tame.

## Focused checks

Run `node --test tests/*.test.cjs`, `node --check app.js` and
`node --check ltc-inspector.js`.
The tests cover rotated-emitter Monte Carlo sidedness, all seventeen scene routes,
control identity, viewport aspect and allocation bounds, and labels following the
actual producer during a GPU fallback. Shader execution and appearance additionally
need a browser with native WebGPU; these checks do not substitute for that review.

The inspection tests additionally cover half-float decoding, texel-center bilinear
lookup, the WGSL column-major matrix convention, finite published-table outputs,
control sensitivity, rejected emitter backsides, final paused edits and actual
material-parameter packing. The garage work estimate counts light samples or
edge sets **per lobe**, allowing for split allocation and lens rays, before
surface misses and material-dependent lobe counts; it is not a measured GPU
instruction count.

## Third-Party Data

`ltc-data.js` contains half-float encodings of the GGX LTC lookup tables published
in the three.js `RectAreaLightTexturesLib`, derived from Eric Heitz's reference
`ltc_code`. Both sources are MIT licensed; see `THIRD_PARTY_NOTICES.md`.
