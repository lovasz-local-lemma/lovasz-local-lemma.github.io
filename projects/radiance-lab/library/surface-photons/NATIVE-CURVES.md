# Native surface curves — PP33

PP33 traces an emitted angular sheet into the actual scene. Its first non-delta
hits form a receiver curve: a cone meeting a plane, a meridian plane meeting a
sphere, or a refracted sheet meeting a mesh torus. Each ruling uses the native
analytic intersections plus the mesh BVH. Nothing is projected onto a decorative
proxy. Glass chains can produce surface caustics as well as the existing mode-32
volumetric caustics.

## Two sampling choices

**Stratified stochastic paths** sample points in the sheet's parameter domain.
Each angular cell receives one random sample. Light origin, the held angular
coordinate, and Fresnel branch random numbers remain random. The result has no
surface density-estimation radius and no screen smoothing. For the implemented
finite-depth, geometric-normal, pinhole `L[S]*DE` path class, this is a correctly
weighted Monte Carlo light tracer. It is not a claim to render every transport
path or to be unbiased relative to arbitrary materials and cameras.

**Finite curve quadrature** uses a midpoint in every angular cell, evaluating
the whole sampled curve. Optional Gaussian screen blur can join sparse deposits.
Both its finite angular quadrature and screen filtering introduce approximation
bias. More passes randomize the other coordinates but cannot remove the fixed
quadrature or filter error. Increase curve samples and reduce blur to study it.
This is sampled curve integration, not an analytic continuous-curve rasterizer.

## The measure: no mysterious curve-length multiplier

For a point emitter use `z = 1−2u`, `φ = 2πv`, with `pω = 1/(4π)`.
For an area emitter use `z = √u`, `φ = 2πv`, with `pω = z/π`.
Here `z = cos θ`; changing coordinates already includes `sin θ dθ`.
The cone family holds `u` fixed and sweeps `v`. The meridian-plane family holds
`v` fixed and sweeps `u`. A plane sheet covers the emitter's forward meridian
half-plane; it does not emit backwards through a one-sided area lamp.

**Cone + plane: balance MIS** divides the same sheet budget between the two
families. It combines them on their common emitted-path measure. Since these
two charts have identical angular marginals, the balance weights reduce to
their allocation fractions. Their different curve directions change batch
correlation, not the marginal PDF. The pair is an orientation hedge; it does
not inherit a guaranteed variance advantage from unrelated primitive MIS.
The [pair analysis and native measurements](PAIR-ANALYSIS.md) explain this
distinction, including receiver folds, visibility and surface caustics.

An emitted sample carries flux

`Φ = Le(y,ω) cosθy / (pLight pArea pω N)`

for an area emitter, or `I / (pLight pω N)` for a point emitter. Directional
profiles are evaluated at the actual ruling. Misses and blocked paths still
count in `N`; normalizing by accepted hits would create a substantial bias.

If `X(u)` is the induced receiver curve, its arclength density is
`ps = pu / |dX/du|`. Thus a curve's slower parameter regions receive more samples
per unit arclength. Uniformly placing samples along a polyline and ignoring this
factor changes the estimator. PP33 avoids that error by retaining the original
angular parameter and flux. For an implicit receiver `F(y+t d(u))=0`,

`dX/du = t [d′ − d (n·d′)/(n·d)]`.

This identity exposes the receiver tangency and varying curve speed; the native
forward sampler does not divide by a near-zero speed. Refraction changes the
mapping further, but the emitted flux still travels along the actual path.
Caustic focusing arises from the density of those arrivals.

## Connecting the receiver to the film

The receiver evaluates a bare BRDF `f(wo,wi)`. Do **not** multiply the incoming
receiver cosine again: photon flux already carries the incident measure.
For a pinhole camera, a packet deposited into its actual projected pixel is

`C = Φ f Tr · [wh/(4 halfW halfH)] cosθreceiver / (r² cos³θcamera)`.

The bracketed factor converts surface area to film-pixel area, so the pixel's
running mean estimates its box-filtered radiance. This is a sensor Jacobian,
not the Jacobian of a volume primitive. Both the light path and receiver-to-eye
segment are tested against real geometry. Any glass on that final straight
segment blocks it: camera-side specular paths ending on a receiver are outside
this version's class.

Glass interfaces choose reflection/transmission by Fresnel probability; the
chosen probability cancels its throughput factor. Photon **power** does not
receive a radiance `η²` multiplier. Closed solid entry/exit and absorption are
tracked; total internal reflection remains valid. Shared branch random numbers
keep nearby rulings correlated without changing their individual distribution.

## Scope and controls

Headless keys are under `pp`:

| Key | Default | Meaning |
|---|---:|---|
| `strategy` | 33 | Native surface curves |
| `surfaceCurveFamily` | 0 | 0 cone, 1 meridian plane, 2 cone + plane balance MIS |
| `surfaceCurveSampling` | 0 | 0 stratified stochastic, 1 midpoint quadrature |
| `surfaceCurveBatch` | 64 | Independent random sheets per pass |
| `surfaceCurveSamples` | 128 | Samples along each receiver curve |
| `surfaceCurveDepth` | 12 | Maximum light-side specular interfaces |
| `surfaceCurveBlur` | 0 | Gaussian sigma in pixels; quadrature only |
| `surfaceCurveCausticOnly` | false | Omit the zero-specular direct surface class |
| `surfaceCurveContext` | true | Separately show emitter/background through camera specular paths |

Sources are enabled area/point `scene.lights[]`, using matched emissive-entity
directional profiles when present. Receivers include analytic planes/spheres/
boxes and transformed triangle meshes. Lambertian is the clean validation
case. The existing BRDF evaluator additionally supplies rough metal,
isotropic approximation of anisotropic metal, iridescent metal and the base
of coated diffuse; the coat's delta lobe is not added. Unsupported receiver
BSDFs do not receive substituted Lambertian shading.

Other limits: geometric normals; closed nonoverlapping dielectric solids;
RGB smooth glass even if the source material advertises dispersion/roughness;
homogeneous nonoverlapping fog extinction, without scattered radiance;
one non-delta receiver; no environment illumination; pinhole camera regardless
of the selected interactive lens. Finite depth deliberately truncates paths.
The context layer shows emission/background only, so it cannot double-count
the light-traced direct receiver. Analytic medium comp mode is refused.

Logs report receiver hits, caustic hits, film deposits, occlusion, invalid solid
topology and depth truncations. These are useful diagnostics, not proof that
every intended path has been implemented.

## Validation

`PrismSurfaceCurveTest` independently checks angular power integrals, the
nonuniform arclength density of a cone on a tilted plane, the film Jacobian
against finite differences, and a sampled point-light/plane image mean against
its closed-form radiance. The Monte Carlo comparison uses independent sheet
means to estimate uncertainty rather than treating correlated points as IID.

Native images should compare cone and plane choices against the same direct
surface reference, then compare quadrature resolutions and the caustic-only
glass fixture. Equal pass counts are not equal work: cost scales with sheets
times curve samples and the number of traversed specular interfaces.

The additive pair was checked on 54 native renders (three scenes, three
families, six seeds each), with the same 524,288 launched rulings per image.
Both existing single-family modes also reproduced their checkpoint films
byte-for-byte in the retained direct-atlas regression fixture.
