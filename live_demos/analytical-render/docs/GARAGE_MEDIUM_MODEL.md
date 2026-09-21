# Participating medium, moving finishes, and light housing

The garage's optional atmosphere is a **numerical single-scattering extension**.
It does not turn the surface LTC fit into a closed-form volume renderer. The
manual room-wide atmosphere defaults off. The separate **Extra fancy** option
enables a compact luminescent cube and coordinated ground details, and can be
switched off to return to the ordinary material/atmosphere controls.

## Transport that is evaluated

A finite scene-space box contains a scalar extinction field. Each camera/lens
ray is clipped to that box and to its first visible surface. At each midpoint,
the shader evaluates the actual 3D density, attenuates the remaining radiance,
and accumulates in-scattered radiance. A homogeneous segment uses:

```text
Tsegment = exp(−σt Δs)
Lsegment = albedo × incident_isotropic_source × (1 − Tsegment)
Lcamera += Tprevious × Lsegment
Tprevious *= Tsegment
```

The final surface radiance is multiplied by the accumulated camera transmittance.
This follows the [beam-transmittance relation](https://pbr-book.org/4ed/Volume_Scattering/Transmittance)
and the source structure in the [equation of transfer](https://pbr-book.org/4ed/Light_Transport_II_Volume_Rendering/The_Equation_of_Transfer).
The bounded midpoint discretization is an approximation, particularly for rapidly
varying density. It is not an unbiased Monte Carlo transmittance estimator.

The phase function is isotropic, `1/(4π)`. The unoccluded angular integral of each
constant-radiance rectangular emitter is therefore its **ordinary solid angle**,
computed as two spherical triangles. This is different from the projected-solid-
angle cosine integral used for a diffuse surface. The [normalized isotropic phase
function](https://pbr-book.org/4ed/Volume_Scattering/Phase_Functions) permits this
angular simplification; the remaining integration along the camera ray is still
numerical.

Light-path attenuation uses four midpoint samples along the direction to each
quad's center. That one transmittance multiplies the quad's integrated source.
The same approximation is applied to incident surface lighting on both the LTC
and MC branches, so their material comparison remains matched. It is not exact
integration of spatially varying attenuation over a large area emitter.
The compact extra-fancy cube uses two center-ray samples to bound its additional
cost; this is a coarser approximation and not an accuracy improvement.

## Density and motion

- **Uniform:** constant density inside the box; vacuum outside.
- **Rolling noise:** smoothly interpolated 3D value noise with a continuous warp.
- **Filaments:** folded procedural sheets shaped by the same noise.

Density stays in `[0,1]`; the extinction scale supplies the coefficient per world
unit. The animation clock translates the density coordinates smoothly. This is
a prescribed moving field, not a fluid simulation. A medium-only view displays
the accumulated in-scattered component without the attenuated surface background.

Ground motion is independent: a scene-clock translation moves the procedural
two-material finish mask. The slab geometry and tile grout stay fixed. This is
an animated material field rather than a moving or deforming floor.

## Extra-fancy cube and hollow seal

The cube is one world unit wide, centered at `(1.44, 1.29, −1.5)`, rotated by
`Rz(0.16) Ry(0.48) Rx(0.22)` radians. Density coordinates, camera and light-ray
intervals, the thin metal edge cage, and its normals share this rigid transform.
This exposes three faces without turning the medium into a screen-space image.
Extinction is zero outside its rotated bounds, and scene surfaces occlude it.

A smooth warped trigonometric field forms tubes with smaller connecting branches.
It is a prescribed organic pattern, not Physarum, a reaction-diffusion solver, or
a biological growth simulation. The field supplies real volume density in
`[0,1]`, with extinction scale `1.4`, scattering albedo `0.78`, and 28 view-ray
integration steps, independently of the manual room-haze setting.

The volume has a bounded teal/gold luminescent source function `E`, whose channels
stay in `[0,6.5]`. Its emission coefficient is `j = σt E`. A constant segment adds
`E (1 − Tsegment)` alongside the scattered source, attenuated by all earlier
segments. This represents actual source integration along the ray, not a colored
overlay. The source is prescribed and does not illuminate other scene objects;
secondary emission transport and multiple scattering remain outside the model.
The volume-only view includes both this emission and in-scattering.

Ground detail follows the same atmosphere clock in this mode. A hollow double
rim at `(-1.32, 0, 1.22)` modulates finish and shading normals; its center remains
open. The outer and inner rims use explicit smooth height profiles, and the
normal gradient is differentiated from those profiles. Coordinated broad ripple
normals and moving finish colors add motion. These are bump/material effects:
the floor's intersection geometry and silhouette remain planar.

## Boundaries

This study omits multiple scattering, anisotropic phase functions, volumetric
object shadows, and integration through the glass's internal
and secondary transmission paths. Existing glass/film/environment extensions
remain boundary-radiance approximations. It does not claim to reproduce a full
volumetric path tracer, a physical fluid, or photon transport through every
surface interaction. The constant-density segment relation and isotropic angular
integral have closed forms; the heterogeneous rendered result does not.

The material inspector views bypass camera volume accumulation so normals, masks,
base and coat contributions remain readable. With the atmosphere enabled, base
and coat views still use medium-attenuated incident lighting.

## Solid rear-light housing

Four oriented bronze box bars surround rear panel 2, following its actual center,
axes, width, and height as it moves. These are intersected 3D surfaces with the
same direct microfacet lighting as the other opaque materials. The frame does not
consume object-buffer slots or change the blocker index, and it is not a screen
outline. It leaves the emitter aperture unobstructed. Its material highlights
are shaded; no bevel geometry or rounded silhouette is claimed.

## Uniform contract

| Slot | Meaning | Suggested default |
| --- | --- | --- |
| 82 | Manual extinction scale `σt`, zero disables room haze | 0 |
| 83 | Density: 0 uniform, 1 rolling noise, 2 filaments | 1 |
| 84 | Single-scattering albedo | 0.85 |
| 85 | Density frequency multiplier | 1 |
| 86 | Independent atmosphere animation time, seconds | 0 |
| 87 | Camera-ray integration steps, clamped to 8–40 | 20 |
| 88 | Ground pattern flow speed, zero disables | 0 |
| 89 | Rear light housing enabled | 1 |
| 90 | Volume only: in-scattering, plus emission in extra-fancy mode | 0 |
| 91 | Ground animation time from the scene clock | 0 |
| 92 | Extra-fancy cube, edge cage, and coordinated ground effects | 1 |

When slot 92 is enabled, the compact cube replaces room haze and uses its own
fixed integration settings. Slot 86 advances both its organic field and the
coordinated ground effects. Slot 89 still controls only the rear-light housing.

For a visible demonstration, try extinction `0.25–0.45`, frequency `1`, and 20
steps. Keep the lens at pinhole initially: finite aperture repeats volume work
for each lens sample. Large frequency benefits from more integration steps.

## Validation

Open `tests/garage-medium-check.html` in a native WebGPU browser. It extracts and
executes production WGSL functions to check vacuum, pure absorption, the constant
source solution and segment composition, exact rectangular solid angle, parallel
ray-box intersections, bounded noise/density, atmosphere motion, transmittance
reversal, and clipping extinction to the actual medium boundary.
Additional cases check that the extra mode works with manual extinction zero,
that density and emission remain bounded, that rigid rotation preserves ray
distance and excludes outside points, and that the hollow-rim normal gradient
matches its explicit height profile.

These checks validate kernel limits and invariants. Full-scene appearance,
the frame's location, and animation also require browser review.

Native WebGPU validation on 2026-09-10 passed all checks, including the rectangular
solid angle (`0.8054317 sr`). Browser review confirmed the bronze housing follows
the rear emitter, the filament medium and its isolated scattering view render,
and atmosphere animation remains active with the scene animation disabled.

The extra-fancy revision also passed all 21 native WebGPU checks on 2026-09-10,
including the seven new cube, emission, rigid-transform, and hollow-rim cases.
Browser review confirmed that volume-only isolates the cube on black, the ground
rim remains hollow, and switching the extra mode off restores manual room haze.
