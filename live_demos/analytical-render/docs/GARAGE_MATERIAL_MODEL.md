# Garage material and camera model

The garage compares direct surface lighting. Its opaque materials share the same
procedural fields, normal, color, and roughness on both sides of the split:

- **LTC:** integrate the fitted, inverse-transformed polygon at every shading point.
- **GGX MC:** sample positions uniformly on each rectangular emitter and evaluate
  the GGX BRDF, the receiver cosine, and the emitter's area-to-solid-angle Jacobian.

The MC side is an actual glossy reference now. It is not a second evaluation of
the same LTC. At low roughness its uniform-area estimator can miss narrow lobes
or produce bright outliers. Increasing samples reduces variance; it does not
remove LTC fitting, interpolation, rational-edge, or horizon-approximation error.
No clamping of glossy radiance is applied before the shared tone map.

## Opaque finish construction

`coated` uses a matte pigmented substrate; `carpaint` uses diffuse pigment plus
a GGX base lobe. A smooth domain-warped 3D texture blends that complete base
response with a rough gold conductor response. This is a mixture of two BSDF
responses, not a change of albedo alone or a roughness interpolation.

A second, independently evaluated dielectric GGX lobe forms the clearcoat. It
has its own roughness and a smoother shading normal. In schematic form:

```text
base  = (1 − mask) pigment + mask rough_metal
coat  = coat_weight × GGX_dielectric
Tbase = (1 − coat_weight × Fview) (1 − coat_weight × Faverage)
result = Tbase × base + coat
Faverage = F0 + (1 − F0) / 21
```

`Faverage` is the cosine-weighted hemispherical average of Schlick Fresnel.
This attenuation is a useful layer approximation. It does not account for
refraction through the coat, directional incident Fresnel at every light sample,
multiple internal reflections, or correlated rough interfaces. The combination
is therefore **not an exact layered BSDF or an energy-conservation proof**. Both
estimators deliberately use this same approximation so it is not conflated with
the LTC approximation.

The opaque normal field is the tangent projection of the gradient of a smooth
3D height field. Object-local coordinates attach it to moving objects, without
cube-projection seams. It changes shading normals, not intersections, silhouettes,
displacement, or microscopic self-occlusion. Base roughness also varies spatially.

## GGX reference and scope

The target lobe uses Trowbridge–Reitz GGX, height-correlated Smith masking, Schlick
Fresnel, and `alpha = perceptual_roughness²`. This matches the parameterization and
masking convention of the [LTC author's fit implementation](https://github.com/selfshadow/ltc_code/blob/master/fit/brdf_ggx.h)
and [table fitting code](https://github.com/selfshadow/ltc_code/blob/master/fit/fitLTC.cpp).
The fitted family and its polygon-transform construction are described by
[Heitz, Dupuy, Hill, and Neubelt (2016)](https://eheitzresearch.wordpress.com/415-2/).

The default opaque material comparison is isotropic. Legacy nonzero anisotropy
uses a tangent-aligned anisotropic GGX MC target, while the LTC side retains an
additional heuristic stretch of an isotropic table; those are not a separately
fitted anisotropic pair. This is an extra approximation, not MC noise.

Both direct-light branches currently integrate unoccluded emitters. The earlier
rectangle blocker is archived in `swap_out/garage-planar-blocker.json`; its
restricted diffuse clipping code is retained but the object is no longer in the
hero. General object shadows and glossy blocker clipping are not implemented. Existing
glass transmission, film, mirror/environment, and optional ambient fill remain
shared extensions; they are not validated by the direct GGX comparison.

## Thin-lens camera

The earlier garage ignored the existing aperture uniforms. A finite aperture
now changes the ray origin on a disk and aims each ray at the original film ray's
intersection with a plane perpendicular to the camera's forward vector:

```text
focus_point = camera_origin + pinhole_direction ×
              (focus_distance / dot(pinhole_direction, camera_forward))
lens_origin = camera_origin + camera_right × disk_x + camera_up × disk_y
lens_direction = normalize(focus_point − lens_origin)
```

This is the standard [thin-lens construction](https://pbr-book.org/4ed/Cameras_and_Film/Projective_Camera_Models),
not a postprocess image blur. Focus distance is axial distance from the camera,
not distance to an object center. Zero aperture retains the pinhole path.
Finite aperture uses a bounded 4–16 sample disk quadrature with stable per-pixel
rotation (8 by default). It replaces the smaller AA sample count rather than
multiplying it. Large blur can still show finite-sample noise or bokeh banding.

Lens/pixel integration remains numerical. The claim of no runtime light sampling
applies to the **LTC angular-light integral**, not to the whole image or camera.

## Integration contract

| Parameter slot | Meaning | Default |
| --- | --- | --- |
| 77 | 0 beauty, 1 shading normal, 2 base-A roughness, 3 blend mask, 4 attenuated base only, 5 coat only | 0 |
| 78 | Normal-strength multiplier | 1 |
| 79 | Clearcoat-weight multiplier | 1 |
| 80 | Two-material blend strength | 1 |
| 81 | Procedural texture frequency multiplier | 1 |
| 125 | Lens radius; zero is pinhole | 0 |
| 126 | Forward-axis focal-plane distance | scene-dependent |
| 127 | Lens quadrature count, clamped to 4–16 | 8 |

Views 1–3 use pinhole geometry and display the raw diagnostic values, bypassing
exposure and false-color mapping. The roughness view shows the first base's
roughness; the mixture's metal and clearcoat have their own values. Views 4 and 5
isolate the attenuated base and coat contributions with the normal exposure and
lens settings. The coat view is black on materials without that layer.

## Validation

`tests/garage-kernel-check.html` extracts the actual production `ggxBrdf` WGSL and
executes it on native WebGPU. It reports finiteness, 64 reciprocity cases including
anisotropy, the known normal-incidence value, the zero back hemisphere, and six
4096-sample cosine-weighted white-furnace energy checks. The energy test concerns
the single-scattering GGX lobe; it does not establish correctness of the layered
approximation or of the fitted LTC integral.

Browser review should additionally compare normals on/off, blend 0/1, coat 0/1,
base/coat isolation, and pinhole versus finite aperture with near/far focus.

Native WebGPU validation on 2026-09-10 passed all checks without shader errors.
The maximum reciprocity relative error was `3.743e-8`. For `F0 = 1`, white-furnace
energies at roughness `(0.35, 0.60, 0.85)` were `(0.97605, 0.80424, 0.51075)` at
view cosine `0.8`, and `(0.85429, 0.82392, 0.72371)` at view cosine `0.2`.

The full garage was also reviewed in native WebGPU: default beauty/split view,
shading normals, roughness, material mask, base/coat isolation, coat strength
zero, blend strength zero/one, and pinhole versus finite-aperture focus. The
coat contribution disappeared at zero strength and finite aperture visibly
defocused the scene. No JavaScript or shader errors were reported. At a
1280×720 window, the complete render fit above the fold; the live matrix and
amplitude readouts remained separate. Paused roughness and light edits changed
the displayed fit and polygon factor immediately.
