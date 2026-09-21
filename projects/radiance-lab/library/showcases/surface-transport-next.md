# Surface transport, residual dimensions and a faster viewfinder

The September 13 extension adds **native PP33 surface curves**, seven paired
scenes, an opt-in enhanced rasterizer, a scene-based light-translation derivative
window, and two interactive estimator laboratories. It keeps the old rasterizer
and existing transport modes available for comparison.

## Start with a result

Run these commands from the RadianceLab folder. Every launch creates a separate
session, preserving the ordinary `prism.json` and `imgui.ini`.

```powershell
.\Showcases.ps1 -Scene 107                 # PP33: coloured light on actual receivers
.\Showcases.ps1 -Scene 108                 # PP33: surface caustics through glass
.\Showcases.ps1 -Scene 109                 # PP33: four-glass chain
.\Showcases.ps1 -Scene 104 -Research       # Heterogeneous chamber + estimator labs
.\Showcases.ps1 -Scene 105                 # Equal-flux source-size comparison
.\Showcases.ps1 -Scene 106                 # Equal-flux emission-profile comparison
.\Showcases.ps1 -Scene 94 -Enhanced        # Surface-guided raster viewfinder
.\Showcases.ps1 -Scene 98 -Enhanced        # Fast refracted sheets in the raster view
.\Showcases.ps1 -Scene 107 -Differential   # Translate one actual scene emitter
```

The File menu's technique-showcase catalogue offers the same scenes and their
paired camera/settings. The new laboratories live under **View → Optics &
primitive laboratory**: choose **Support intersections & time** or **Volume
estimators**. The separate derivative window is **View → Light-position
differential mode**.

## What the surface mode actually integrates

Hold one emitter angle fixed and sweep the other. A cone or meridian plane
meets actual receiver geometry along a curve. PP33 follows those angular
coordinates through analytical primitives and a triangle BVH, including
specular chains, then connects the first supported non-delta receiver to the
pinhole camera. The direct atlas includes a real mesh torus; the chain scene
uses four disjoint glass solids.

There are two execution choices:

- **Stratified stochastic paths:** sample the remaining curve coordinate, keep
  light-selection, source-area and angular PDFs, and accumulate its actual
  projected film deposit. There is no surface density-estimation radius.
- **Finite curve quadrature:** evaluate regularly spaced angular samples along
  each random sheet, optionally with a Gaussian screen filter. This is a biased
  approximation of the complete curve, useful for appearance and comparison.

An infinite support does not establish unbiasedness by itself. The curve's
measure, incident flux, receiver BRDF, camera Jacobian, visibility, branch
probabilities and normalization all matter. Misses remain in the denominator.
The stochastic mode targets a finite-depth `L[S]*DE` path class; it is not a
general replacement for a full path tracer. Camera-side specular receiver
connections, arbitrary materials, dispersion, heterogeneous attenuation and
scattered medium radiance are outside this first surface implementation.

The [surface implementation and equations](../surface-photons/NATIVE-CURVES.md)
explain why the original angular chart already accounts for nonuniform curve
sampling, and why multiplying the incident receiver cosine a second time would
be wrong. This route also avoids reconstructing an explicit receiver curve on
every mesh triangle. It still pays ray/BVH and interface costs; a dense mesh and
many branch changes can remain expensive.

## Intersecting two primitives: count coordinates, then account for measure

For independent, regular spatial constraints, the residual dimension is
`m + n − 3`. The live support lab makes these cases visible:

| Construction | Residual domain | What the lab computes |
| --- | --- | --- |
| Sphere surface × sphere surface | Circle: one coordinate | Exact intersection, residual samples and coarea weight |
| Plane × plane | Line: one coordinate | Transverse angle and a declared finite clipped measurement |
| Ball × parallelepiped | Three-dimensional overlap | Deterministic volume quadrature |
| Parallelepiped × parallelepiped | Three-dimensional overlap | Same quadrature with relative rotation |

For signed-distance constraints `g1 = g2 = 0`, the intersection measure is
`ds / |∇g1 × ∇g2|`. The sphere-circle drawing reports both its length and the
crossing sine. Tangency is a change in regularity, not a reason to silently
clamp an infinite contribution. Coincident, disjoint and other nonregular cases
are reported instead of drawing a spurious intersection circle.
The plane's infinite line needs a finite sensor/integration domain or a
normalized proposal; the picture explicitly declares its clipping.

Your extra-coordinate idea is useful: one can sample the remaining domain, or
integrate it analytically when possible. But replacing a ring with a sphere
also changes the path construction and its measure. Easier geometric overlap
does not automatically imply a lower-variance transport estimator. These new
panels are computed geometry/measure experiments, not undocumented native
bidirectional radiance modes. A full estimator needs the path PDF and all
preimages in addition to these intersections.

## Time slicing: what loses one dimension

The lab compares the light-only sphere `|x − l| = L` with the two-leg ellipsoid
`|x − l| + |x − c| = L`. It can clip either by a ball or a parallelepiped and
show a finite temporal thickness or a zero-width level set.

A normalized box kernel `1[|τ−L| < ε/2] / ε` approaches a delta measurement as
`ε → 0`. At regular points this replaces one integration coordinate by the
factor `1/|∇τ|`. A three-dimensional volume therefore becomes a weighted
two-dimensional surface; a four-dimensional parameter volume becomes a
three-dimensional level set. Merely drawing a thinner shell without dividing
by its width measures a different quantity tending to zero.

For the unclipped two-focus construction, the lab independently compares
surface coarea quadrature with the derivative of the enclosed ellipsoid volume:
`V(L) = π L (L² − d²)/6` and `V′(L) = π (3L² − d²)/6`, for `L > d`.
The displayed integral readouts are explicitly **unclipped** when a spatial
clip is drawn. Critical points and path multiplicity need separate analysis.

The native GPU already has geometric path gates and CW measurements. **PP0–33
do not yet receive a general transient-kernel configuration.** This lab tests
the construction and normalization; it does not claim all native PP families
are already time sliced. See the [temporal and backend audit](cpu-gpu-migration.md).

## A derivative of a scene, including changed visibility

The new differential window freezes the current scene and camera, selects one
supported plane-backed area emitter or explicit point light, and evaluates
`I(X−ε)`, `I(X+ε)`, their signed central difference and a second result at `ε/2`.
Camera and source samples are shared across all four evaluations. Visibility
is re-evaluated in both displaced scenes, so moving shadows are included at
finite step size. An optional visibility toggle isolates its contribution.

Warm values are added radiance; blue values are removed radiance. The gain is
only a display control. Export retains all signed RGB radiance, derivatives,
convergence residuals and capture settings as CSV, plus a display PNG.

This first mode measures direct Lambertian receiver illumination with native
profile-0/profile-3 plane sources or point sources, analytical sphere/plane/box
visibility and a pinhole camera. Unsupported mesh-only receivers, media,
indirect paths, node textures and non-Lambertian receivers are excluded. It is
an actual finite difference, not a newly activated autodiff renderer. Boundary
spikes and sampling error can grow as ε shrinks; the second step size makes
that visible instead of promising a converged derivative at every pixel.

The earlier footprint-edge lab remains useful for the analytic moving-support
term. For general light motion, that term is only part of the derivative:
geometry factors, directional emission, attenuation and changing occlusion can
also vary. [Edge-sampling differentiable rendering](https://people.csail.mit.edu/tzumao/diffrt/diffrt.pdf)
explains why smooth arithmetic differentiation alone misses visibility changes.

## Three ways to estimate the same volume integral

The new [volume lab](volume-estimators.md) samples one declared scalar target,
`I = ∫ q(t) T(t) dt`, in homogeneous and heterogeneous profiles. It displays
actual histories, running means, standard errors and density-evaluation cost.

- **Collision:** first accepted event has density `σ(t)T(t)`; its score is
  `q(t)/σ(t)`. Escaping the interval contributes zero.
- **Surviving track length:** integrate `q(t)` only until the sampled collision
  or interval boundary. Survival probability supplies `T(t)` in expectation.
- **Ratio tracking:** choose a point on the interval and estimate its
  transmittance using a product of `1−σ(ti)/M` at Poisson majorant candidates.
  Those null candidates are not physical scattering vertices.

The flat-weight intuition needs a specific cancellation: `q/σ` is constant
only for appropriate homogeneous/proportional sources; finite-domain escape
events can still leave variance. Other factors such as
phase, light variation and higher-dimensional spatial Jacobians can still vary.
The lab keeps a valid majorant and never converts a capped/null-weight trace
into a claim about a complete scene integrator. The method is grounded in
[PBRT's volume estimators](https://www.pbr-book.org/4ed/Light_Transport_II_Volume_Rendering/Volume_Scattering_Integrators).

## The enhanced rasterizer and the rest of the roadmap

Enhanced raster is an opt-in appearance composite: full-resolution raster
geometry, a reduced-resolution progressive surface guide, and a separate
photon-scattering film. The combination happens in linear HDR, with camera
extinction, visibility-aware upsampling and one display transform. Choose
individual primitive families, existing MIS groups, shared batches or actual
raster execution where that implementation exists. Fast hourglass/mesh sheets
provide the useful biased caustic layer; the status reports fallback paths.

It intentionally does not promise all path classes. Heterogeneous media retain
the legacy volume preview, secondary surface paths in the guide travel in
vacuum, and a caustics-only family omits ordinary direct fog. The
[enhanced-raster guide](../enhanced-raster/README.md) supplies matched comparison
fixtures and detailed limitations. Turning it off restores the original mode.

The [CPU/GPU and algorithm-state audit](cpu-gpu-migration.md) separates missing
correctness/measure work from a mere GPU port. Full manifold exploration,
general bidirectional support intersections, production transient PP families
and general visibility-gradient primitives remain substantial follow-ups.
Neither a new label nor a GPU dispatch would finish those algorithms.

## Validation retained with this extension

- [Seven native scene captures](surface-validation/index.html), including PP33
  strategy logs, 512-pass films, startup settings and per-file hashes.
- [Legacy, enhanced and traced display comparisons](../enhanced-raster/validation/20260913/index.html),
  captured from the actual native display texture at 128 frames. No second tone
  curve is applied. The stronger surface guide is visible; mesh-glass material
  fallback remains a limitation even at the corrected composite exposure.
- Release build passes. Focused checks cover source/scene setup (569,530),
  volume estimators (2,893,032), surface measures (65,882), support/translation
  (4,229), enhanced composition (520), and the previous research workbench
  (8,232). These counts include numerical samples and boundary checks, not
  millions of separately authored test scenarios.
- Native UI checks exercised the real-scene derivative, running/paused volume
  estimators and the support-intersection tab. The capture harness now rejects
  a requested PP strategy if the native dispatch reports another one.

Timing in these reports was recorded with another viewer active. It is useful
implementation evidence, not an isolated-hardware or equal-quality benchmark.
