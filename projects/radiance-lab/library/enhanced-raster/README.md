# Enhanced raster appearance

An opt-in appearance preview in **mode 0 / Rasterizer**. Turn on **Enhanced raster** in the renderer controls; the full Rasterizer settings expose the surface guide, photon family, execution mode and resolution. Turn it off to recover the existing rasterizer, including its LTC and original tracer-guided controls.

This combines real scene geometry, material shading and photon transport. It is a **biased preview**, intended for arranging a scene and inspecting light structures while keeping full-resolution raster silhouettes. It is not a new unbiased integrator, and it does not repair the old LTC fit.

## What is combined

1. The existing rasterizer draws actual meshes and analytic primitives, node-material previews and its material families into its RGBA32F surface buffer. For supported homogeneous media, the old volume preview is omitted so fog is not drawn twice.
2. A separate reduced-resolution GPU tracer, with medium interactions disabled, progressively estimates surface appearance using the implemented native BSDFs and MIS direct lighting. Its **linear accumulation texture**, not its already tone-mapped display, guides the raster image. Set the blend to 1 for the closest surface-only comparison; decrease it to retain more of the immediate raster appearance.
3. A separate photon-primitive integrator accumulates the selected scattering contribution. It uploads the raw linear film. Family 20 or 32 can use the existing fast, finite-resolution refracted-sheet raster preview.
4. A screen shader combines `exp(-tau) * surface + scattering`, then applies exposure and display mapping **once**. `tau` is the camera-to-receiver optical depth through the supported homogeneous sphere/box volumes. The already attenuated scattering film is not multiplied by this transmission again.

The depth-aware filter checks world-space hit distance before admitting a surface-guide sample. This matters because the GPU tracer still lacks arbitrary triangle-mesh intersections: an unsupported foreground mesh must retain its raster shading, rather than showing the traced background through it. It also reduces silhouette halos. A small depth-aware screen filter can soften the lower-resolution photon film.

GPU/CPU transport images are stored top-down; the raster framebuffer is bottom-up. The composite explicitly converts between them. The guide's native depth texture uses optical-axis depth, so the filter instead computes ray distance from its position G-buffer; this avoids a false mismatch near image corners.

## Medium methods and execution

The UI offers the UV plane, sphere, disk, cone, three-plane MIS, directional trio MIS, blurred beam, hourglass, six-family MIS, blurred-curve trio, custom pair/trio and mesh sheets. Custom mode 31 uses the existing PP mask, balance-weight switch and blur width. It retains the exact-family versus finite-kernel grouping of that implementation; this preview does not invent cross-measure MIS weights.

- **Independent samples:** fresh per-camera-sample primitives, accumulated across frames.
- **Shared primitive batch:** the same all-N batch is gathered across the image, normalized by attempted draws, not by the number of hits.
- **Raster where implemented:** actual conservative raster gather for the converted UV-plane, beam and analytical-hourglass records. Other requested families use shared batch gathering, and the status line explicitly reports that fallback. A MIS label does not imply that all of its families have a raster implementation.
- **Fast hourglass / mesh sheets:** the existing refracted-sheet triangulation and screen rasterization. It has finite angular resolution, screen filtering and a grazing regularizer. Here its surface companion and ordinary-fog companion are disabled: it contributes the refracted caustic layer only.

The CPU medium image is capped at 65,536 pixels, with aspect ratio preserved. The surface guide is capped at 1024 x 768 pixels. These are work limits, not a guarantee of a particular FPS: shared batches and expensive multi-glass sheet construction can still cost appreciably more than independent direct-scatter strategies. The status line reports the actual image size, sample/pass count and effective execution mode.

## Intentional limits

- This is a pinhole preview. It does not reproduce depth of field, rolling shutter or arbitrary camera-side medium/specular paths.
- The surface guide traces in vacuum. The composite applies extinction on the visible camera leg; it does not reproduce attenuation along reflected/refracted secondary surface paths or complete surface-medium multiple-scattering exchange.
- A single selected photon family covers its implemented path class. For example, fast hourglass provides refracted caustics and does **not** supply the ordinary direct fog that a different family covers. A dark omitted path class is not a negative light contribution.
- Direct camera-visible volume emission is not a separate layer here. A volume emitter can illuminate the medium through a supported photon family, but its self-emission along the camera ray is not supplied by the vacuum surface guide.
- Triangle meshes keep raster visibility and material shading when the GPU guide has no corresponding hit. They do not gain correct mesh shadows, reflections or indirect illumination from this guide. The mesh-sheet path supplies its own real triangle intersections for the selected caustics.
- Procedural, simulated, SDF/VDB and density-node media retain the original raster volume preview. The surface guide is disabled for that fallback so it cannot paint a vacuum scene over the visible volume. The status names this restriction.
- Camera optical depths from overlapping homogeneous volumes are added. This is a display approximation and can differ from the native first-containing-medium convention. Pure-emission zero-extinction volumes add no extinction.
- Finite guide resolution, interpolation, blending with approximate raster shading, screen filtering and the optional finite sheet rasterization introduce bias. More samples reduce sampling noise; they do not remove those approximations.
- Selection highlights and physics overlays originate in the raster image and can be softened by the guide blend. Use the legacy view or lower the blend while editing these overlays.

## Reproducible comparisons

The JSON files in this folder are minimal startup fixtures. Copy one to a disposable viewer session's `prism.json`, keeping its binary, shaders and data together. They preserve the standard configuration when used in a separate session. Scene selection supplies the same camera, materials and lights to each matched surface comparison.

| Fixture | Purpose |
| --- | --- |
| `surface-legacy.json` | Scene 94, original raster mode, enhanced off |
| `surface-enhanced.json` | Same scene; full surface-guide blend, no medium |
| `surface-reference.json` | Same scene, native GPU path tracer |
| `fog-enhanced.json` | Scene 88, directional MIS trio and raster surfaces |
| `mesh-enhanced.json` | Scene 98, actual glass chain with fast mesh sheets |

Use `render.tonemapMode = 1` for the matched comparison. The current native GPU and PP display code use Reinhard and gamma; Enhanced also offers the UI's other display mappings, which must not be mistaken for a transport difference. Keep exposure, camera and spectral choice fixed, and let the progressive views settle. Surface blend 1 makes a closer diagnostic comparison; the default 0.85 is an appearance choice.

`PrismEnhancedRasterTest` passes 520 checks covering the CPU pixel budget, admitted scattering/raster families, camera/receiver interval clipping, Beer law, one-time transmission application, and rejection of mismatched guide depths. Native captures are still necessary to validate shader compilation, orientation, material appearance and actual frame cost.

### Native display capture

`python docs/enhanced-raster/capture_display.py --frames 128` prepares a fresh isolated runtime and runs all five fixtures with a hidden native window. Results are retained under `build/enhanced-raster-validation/`, including native logs, binary/shader hashes, effective configurations, float readbacks, PNGs and a comparison HTML page. `--fixtures fog-enhanced mesh-enhanced` selects a smaller subset; `--out` must name a new directory.

The capture hook is enabled only by `raster.dumpAtFrame > 0`; `raster.exitAfterDump` closes that test process after capture. It also works in reference mode 1. `raster_display.bin` uses the PGR1 container, but this payload is **final display RGB, not linear radiance**. Its third header integer counts display frames, not independent samples. `raster_display.json` records this distinction, top-down orientation, actual texture dimensions, the actual GPU sample count or Enhanced status, and the active configuration. The PNG writer only clamps display values to [0,1] and quantizes to eight bits: no second exposure, gamma or tone curve is applied.

Timing is opt-in too. The test synchronizes GPU work, records each render-stage duration and display-frame interval, and excludes five warm-up frames from summary quantiles. These are measured QA costs, not a promise of interactive FPS or an isolated benchmark. Startup/process wall time is retained separately by the Python runner.

The first five-fixture run used 128 display frames. All readbacks were finite and nonblack, shader compilation succeeded, and visual inspection confirmed orientation and source-color alignment. The surface guide resembles the GPU reference with softer filtering. The mesh-chain case exposes a limitation: its triangle-glass surfaces retain approximate raster appearance. It was recaptured with exposure 1.5 instead of the isolated-caustic preset's 10; this reduces saturation but does not supply missing mesh refraction/shading. Its relatively faint caustic and flat glass context remain a diagnostic, not a polished mesh beauty shot. See the retained [native comparison](validation/20260913/index.html).

| Native fixture | Display size | Synchronized render-stage median |
| --- | --- | ---: |
| Original raster | 896 × 625 | 1.36 ms |
| Enhanced surface | 896 × 625 | 3.45 ms |
| GPU reference | 448 × 312 | 2.67 ms |
| Enhanced directional-MIS fog | 896 × 625 | 5.32 ms |
| Enhanced fast mesh chain, exposure 1.5 | 896 × 625 | 14.44 ms |

Another native viewer was active during these runs. The table reports observed synchronized stage costs; it is not an isolated GPU comparison or an FPS guarantee. Five warm-up frames are excluded. Full arrays and process elapsed times are retained, along with a separate provenance record for the mesh recapture. Native float files remain in the ignored build output; the documentation keeps the exact PNGs, metadata, configs and log copies.
