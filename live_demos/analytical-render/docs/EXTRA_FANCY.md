# Extra fancy: a bounded optical sculpture

This pass starts from `f370d5c`. The garage now opens with **Extra fancy** enabled:
a rotated cube of animated filaments, a thin physical edge cage, and a coordinated
ground finish. The five material objects and their LTC/Monte Carlo comparison
remain the main surface-lighting experiment. Turning the preset off restores the
manual room-atmosphere controls and their retained values.

## The dark bar above the rear light

The bar was a separate visibility-test object, not part of the bronze frame. It
was the sixth garage object: a dark, thin box centered at `[0.05, 1.85, 0.3]`,
rotated by approximately −90° around x. It has been removed from the hero scene
and preserved in [the blocker archive](../swap_out/garage-planar-blocker.json).

The experimental rectangular-blocker shader path remains, guarded by the object
count and the sixth object's shadow flag. With five material objects it is
inactive. The bronze housing around the rear emitter is separate intersected
geometry; it remains visible. General object shadowing is still outside the
matched opaque-surface comparison.

## What the cube computes

The volume occupies a bounded, rotated cube toward the rear right of the scene.
Its cage, ray intersection and density evaluation use the same rigid transform.
The placement leaves the foreground material samples readable; it does not fill
the entire camera-to-scene interval with haze.

The density is a trigonometric tube network with prescribed motion. It has no
agents, nutrient sensing, trail deposition, diffusion state, or emergent growth:
**this is a procedural organic field, not a Physarum simulation**. The surface
finish uses altered shading normals and a moving inlay pattern; the floor mesh
does not acquire displaced edges or moving geometry.

The preset selects extinction scale `1.4`, scattering albedo `0.78`, 28 midpoint
camera-ray steps and two samples for each approximate center-directed light
transmittance. Along each homogeneous segment, the shader adds single scattering
and a bounded teal/gold emission term. Emission is parameterized as `j = σt E`,
so its segment contribution is `E (1 − exp(−σt Δs))`, multiplied by transmittance
from earlier segments. This is numerical emission/absorption/scattering along
the view ray, not a closed-form heterogeneous volume integral.

The cube's emission is **not** an additional light source for the room or its
objects. Neither emission-driven secondary scattering nor multiple scattering
is evaluated. Area-source attenuation uses a few samples toward each panel's
center rather than integrating a distinct transmittance for every emitter point.
These choices are shared by both split-view halves. The underlying transport
and its other limits are described in [the medium model](GARAGE_MEDIUM_MODEL.md);
the preset adds emission beyond that original non-emitting room-haze model.

## Controls and comparison boundaries

`extraFancy` is a saved GPU preference, packed in uniform slot 92 only for the
garage. JS/WASM switch to compatible diffuse scenes and disable this preference;
returning to GPU restores it. The coordinated preset disables the manual density,
density pattern, albedo, frequency, integration-step and ground-flow fields. Their
stored values are retained. Atmosphere animation, volume isolation and the rear
light frame remain independent controls.

The atmosphere clock in slot 86 drives both the cube and the coordinated inlay.
It can advance while the scene/light animation is paused, including when manual
density is zero. Pausing atmosphere animation freezes both. The ordinary ground
clock in slot 91 remains separate for the manual mode.

Raw normal/roughness/blend diagnostics continue to show shared material inputs.
The volume-isolation view displays the same numerical scattering and emission
on both sides; those labels do not imply an LTC-versus-MC volume comparison.
Base/coat views isolate surface lobes before camera-volume accumulation. Finite
aperture repeats the volume work for lens samples, so its cost remains separate
from the deterministic surface integral.

## Can an area light animate without breaking LTC?

Yes. The original LTC construction replaces a BRDF–cosine lobe with a fitted
distribution whose polygon integral reduces to a cosine integral over inverse-
transformed vertices. The fit is indexed by material and viewing configuration;
it is not baked for one light position. Moving, rotating or resizing a uniform
polygon emitter simply changes the vertices evaluated that frame. See
[Heitz, Dupuy, Hill and Neubelt's original research explanation](https://eheitzresearch.wordpress.com/415-2/)
and [the authors' fitting and rendering implementation](https://github.com/selfshadow/ltc_code).

For spatially uniform emission, the instantaneous rendering equation gives
`Lo(t) = Le(t) ∫Ω(t) f_r cosθ dω`. Thus a changing uniform color or intensity
factors out of the integral. This conclusion follows directly from linearity;
it requires no new BRDF fit. The fitted glossy result remains an approximation
to the original GGX lobe.

A video or texture varying **across** an emitter is different: its emission
`Le(u,v,t)` stays inside the integral. A single average color cannot reproduce
that spatial structure exactly. Constant-emission subdivision, quadrature, or a
dedicated filtered/sampled extension can address it. For example,
[Peters' polygon-light importance sampling](https://momentsingraphics.de/Siggraph2021.html)
supports textured emission and shadows using Monte Carlo sampling, including LTC
as a proposal distribution. This studio has not added textured quad emission;
the organic cube is a participating volume, not an animated light-panel texture.

## Verification

`node --test tests/extra-fancy.test.cjs` passes four focused production-handler
checks: independent animation/pause behavior, GPU preference restoration through
both CPU backends, actual uniform packing and blocker removal, and coordinated
controls with accurate shared-output labels. These tests execute the current
handlers and parameter builders; they do not claim GPU performance or validate
the volume's visual quality. Native shader/browser validation belongs to the
integration pass and the shader-specific checks.
