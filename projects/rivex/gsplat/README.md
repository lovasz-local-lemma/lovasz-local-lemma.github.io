# Browser Gaussian field

This page displays genuine trained data from the authorized AIO native RIVX copy.
It offers a custom WebGL2 PLY renderer and a real ordinary Rive projection of a
bounded subset of the same trained field. It is not the full native RIVX graph
interpreter. No scene has been reconstructed from a screenshot.

## Assets

`glass-room.ply`: native trainer checkpoint
`build-rel/gstrain_datasets/node_4/train_out/checkpoints/step_005000.pt`, re-exported
with the exact `trainer_reference.py` PLY conventions. 30,559 Gaussians, 7,213,362
bytes. No decimation, quantization, or training was performed here.

`glass-room-final.ply`: byte-identical copy of the existing sibling
`train_out/final_point_cloud.ply`: 291,770 Gaussians, 68,859,090 bytes. Explicit
user-click load only. It is a **larger experimental fit, not a quality upgrade**:
the browser shows substantial floaters, so the compact checkpoint remains default.

`receipt.json` records hashes and precise provenance. Existing sibling metrics
claim a different Gaussian count; they are not presented as metrics for either
of these artifacts. `training-view.webp` is one actual captured training view.
`preview.webp` is the browser's compact-field canvas, with the default room crop.

The complete native PLY data remains downloadable in both cases. The default
viewer crop removes Gaussian centers outside `[-1.045, 1.045]^3`, derived from
the native unit Cornell room plus a small margin. It is only a presentation
filter and can be disabled. No claim of reconstruction equivalence is made.

## Renderer contract

- Binary little-endian PLY, 59 named float fields, linear scales, normalized wxyz
  quaternion, linear opacity, `sh_channel_basis` through degree 3. The browser
  refuses original-Inria `f_dc_` / logarithmic-scale / logit-opacity dialects.
- Full world covariance: `R diag(scale²) Rᵀ`. Camera Jacobian projects it into a
  2×2 screen covariance, then eigenvectors give the two ellipse axes.
- SH uses `normalize(mean - camera)`, the same real SH term ordering and signs
  as the native `gsplatShEval` and Python training renderer.
- Back-to-front mean-depth sorting, instanced WebGL2 quads, 3σ cutoff, Gaussian
  opacity with premultiplied alpha blending (per-splat alpha capped at 0.99).
  A 0.3-pixel covariance floor is used.
- Capability-checked RGBA16F accumulation keeps positive SH colors above one
  until the completed image is clamped for display. This uses
  `EXT_color_buffer_float` and `EXT_float_blend` and verifies framebuffer
  completeness. If unavailable, the viewer explicitly labels its RGBA8
  display-range fallback, which clamps each splat before blending.
- **Training camera** restores the recorded camera transform, one-radian
  horizontal FOV and 400 × 400 render resolution, with a black background and
  the complete uncropped field. The square output is letterboxed into the
  responsive canvas. Subsequent orbit keeps those capture intrinsics.
  **Showcase view** restores the original fitted presentation: same initial
  pose, min-dimension FOV, responsive resolution and room crop.
- Matching pose/intrinsics does not prove equality to the CUDA training
  rasterizer: this browser uses its own mean-depth ordering, Gaussian support
  cutoff and floating precision. The larger field's visible artifacts alone
  are not a validated statement about its training metrics.
- Baked directional appearance only. No geometry-aware relighting, live
  refraction, or temporal gates are inferred from a PLY that does not store them.
- Splat centers and covariance contours are WebGL inspection styles, not Rive
  paths. This distinction is explicit in the live page.
- Native/RIVX arbitrary Gaussian kernels and vanilla `.riv` multi-shape
  approximations are described separately, without claiming Rive feather is an
  exact Gaussian kernel.

The page supports keyboard / pointer orbit, zoom, exposure, scale, SH constant-
term comparison, and the crop. Animation is opt-in and pauses when hidden.

## Field editing and export

The editing dock is a real modification of the learned Gaussian data, not an
image overlay. The source buffers remain immutable and Restore original
recovers them. Spatial masks select the glass region, room, walls, floor or
ceiling; these masks are explicitly not learned semantic segmentation.

- Move/lift and uniform object scaling transform Gaussian means and covariance.
  Highlight directions remain in the unchanged world basis; no object rotation
  is offered without rotating the SH coefficients as well.
- Tint multiplies all SH terms. Because the native color convention is
  `C = 0.5 + sum(coeff * basis)`, the constant coefficient also receives
  `0.5 * (gain - 1) / C0`. Multiplying coefficients alone would be wrong.
- Opacity/isolation and a world-space cutaway affect actual Gaussian records.
- 3D light paint adds a colored Gaussian falloff to the constant SH coefficient.
  It is a movable spatial appearance accent, not material recovery or physical
  relighting. Existing shadows, reflection and refraction remain baked; the
  floating-glass preset deliberately makes that limitation visible.
- Export edited PLY writes the same 59-field native dialect, preserving every
  unedited field and the original orientation. Zero-opacity records and the
  active room crop are removed. Geometry, opacity, tint and light paint are
  baked; view-only exposure, footprint scale and contour style are not.
- Save look / Load look round-trip a validated recipe with all edit and camera
  controls. The recipe references one of the two known PLY resources; it does
  not fetch arbitrary remote paths. Loading a look for the larger field is an
  explicit request to fetch that field.

The browser test downloads an edited PLY, parses it again, renders it on a
second canvas, and compares the presented pixels to the edited live field.
It also verifies look-file import and exact restoration of the original.

## Relighting boundary and primary references

The bundled PLY has outgoing view-dependent color, not separated reflectance
or illumination. Adding a light source cannot infer the missing decomposition.

- [Relightable 3D Gaussian](https://nju-3dv.github.io/projects/Relightable3DGaussian/)
  adds learned normals, BRDF parameters and incident lighting with ray-traced
  visibility. Its exported representation has materially different information.
- [PRTGaussian](https://github.com/zhanglbthu/PRTGaussian) learns transport from
  multi-view OLAT data with known lights. This is a possible future training
  route for relightable assets, not a capability of these fixed-light captures.
- [GaussianShader](https://openaccess.thecvf.com/content/CVPR2024/html/Jiang_GaussianShader_3D_Gaussian_Splatting_with_Shading_Functions_for_Reflective_Surfaces_CVPR_2024_paper.html)
  learns normals using shortest-axis initialization, residuals and consistency
  constraints. Treating an arbitrary learned covariance axis as a ready-made
  physical normal would skip those essential steps.
Persisted pagehide events retain GPU resources; pageshow schedules a fresh draw,
so back/forward-cache restores do not resume a disposed renderer.

## Reproduction and checks

From the website root, with Node.js and the project's browser-test dependencies installed:

```powershell
python scripts/export-rivx-gsplat.py
node scripts/check-rivx-gsplat.cjs
```

The regression loads both genuine assets, verifies that the larger file never
preloads, exercises orbit / SH / covariance / crop / reset and mobile layout,
matched training framing, floating accumulation, a forced extension-unavailable
fallback, and persisted lifecycle resume. It rejects WebGL or browser errors.
Screenshots go to
`../portfolio-work/rivx-gsplat/`. No native source or preserved original is edited.

## Ordinary Rive scene comparison

The renderer selector changes the scene representation, not just its UI.
`rive-field.js` uses the same perspective covariance Jacobian, camera convention,
crop and real degree-3 SH coefficients as the full-field renderer. Edited data
feeds both renderers.

- A 24 × 16 screen-space grid selects up to 512, 1,024 or 2,048 visible Gaussians,
  taking the largest opacity/footprint scores from each occupied cell in rounds.
  This is deterministic coverage sampling of an already trained field, not a
  new fit or a substitute for the native optimizer.
- Official Rive draws native ellipse shapes. Layered mode uses six nested
  ellipses with opacity increments chosen to approximate a Gaussian radial
  profile. Flat mode uses a single ellipse per selected Gaussian.
- Each ellipse group updates its projected position, scale and rotation during
  camera interaction. Selection, SH color and painter ordering refresh in
  coalesced batches. Between refreshes, color/order remain from the last build;
  this is not exact per-frame covariance compositing or a port of the enhanced
  native splat backend.
- Each color is clamped before ordinary alpha blending, unlike the full-field
  HDR route. Reduced density, stepped radial profiles, painter ordering and
  native shape overhead are visible tradeoffs. Rive feather is not presented
  as an exact anisotropic Gaussian.
- **Export this view** writes the actual ordinary `.riv` geometry used by the
  official runtime after rebuilding the current state. The artifact has no
  shader, image, script or external field dependency. It is a fixed 2D
  projection; interactive 3D still needs the retained host data and projection.
- Rive runtime initialization is lazy. Geometry rebuilds coalesce, superseded
  files/artboards are deleted, and both native transforms and rebuilds stop
  while the host is suspended or the scene is out of view. The larger PLY
  remains opt in.

Direct comparison link: `index.html?representation=layered` (or `flat`).
`node scripts/check-rivx-gsplat-rive.cjs` verifies actual native scene output,
editing/camera updates, layer budgets, binary export, suspension and mobile
layout. Private evidence is written to `../portfolio-work/gsplat-native-comparison/`.
