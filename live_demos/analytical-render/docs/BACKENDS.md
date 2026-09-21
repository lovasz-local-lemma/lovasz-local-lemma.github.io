# Rendering backends: feature scope and measured cost

This audit covers source checkpoint **8d39dd2** and its shipped `wasm/analytic_renderer.wasm`. The backends are different implementations with different feature sets. Changing the producer is therefore a model choice as well as a performance choice.

## The shared reference path

The seven diffuse studies—`studio`, `grazing`, `closeup`, `sweep`, `stack`, `trio` and `meshlights`—are the clean comparison set. Each uses geometric surface normals, finite rectangular emitters, the cosine-weighted polygon boundary integral or uniform-emitter Monte Carlo, and optional deterministic ambient fill.

JS and WASM execute this renderer on the CPU. WebGPU executes a related renderer on the GPU. The GPU also has a separate garage kernel, which is where the published GGX LTC fit and current material work live.

| Implemented behavior | JavaScript CPU | Compiled C / WASM CPU | WebGPU |
| --- | --- | --- | --- |
| Diffuse polygon-light integral; explicit horizon clipping | Yes | Yes | Yes |
| Uniform-emitter diffuse MC and split view | Yes | Yes | Yes |
| Several oriented rectangular lights | Yes | Yes | Yes |
| Geometric sphere, cylinder, cone, box, hemisphere, capsule | Yes | Yes | Yes |
| Torus intersection | Numerical SDF marching | Numerical SDF marching | Numerical SDF marching |
| Rotated cylinder, box, torus and capsule | Implemented | Implemented | Implemented |
| Cone and hemisphere orientation | Axis-aligned implementations | Axis-aligned implementations | Kernel-dependent; not a CPU parity promise |
| Mirror and thin-film variants | Limited reflected-ray/color reference | Limited reflected-ray/color reference | Extended material paths |
| Published GGX LTC tables | No | No | Garage kernel |
| Separate dielectric coat and BSDF material blends | No | No | Garage kernel |
| Procedural shading-normal/material diagnostic fields | No | No | Garage kernel and earlier, different GPU extensions |
| Two-interface sphere glass, Fresnel, absorption, RGB dispersion | No | No | Garage kernel |
| Restricted planar-blocker diffuse visibility | No | No | Retained kernel path; archived from the hero |
| Thin-lens depth of field | No | No | GPU kernels; the garage now has actual lens rays |
| Subpixel antialiasing | One center ray per pixel | One center ray per pixel | Adjustable GPU samples |
| Rotated enclosed-room treatment | No; reference floor/wall | No; reference floor/wall | Generic GPU scene extension |
| Numerical rigid-body trajectories | Shared JS/Rapier scene preparation; rendered with reference materials | Same scene preparation, reference materials | Same preparation, richer GPU materials |

The CPU paths can intersect many garage objects, but their material IDs other than mirror/film ultimately fall through to diffuse shading. They do not secretly run the fitted GGX/clearcoat/glass model at a lower resolution. Likewise, packing a roughness, normal-detail or aperture value into the WASM parameter buffer does not mean its C renderer uses that field. The focused test changes those unsupported controls and verifies that both CPU images remain unchanged.

The main CPU choices therefore expose the shared diffuse family and carry a clear explanation. Retaining the full GPU scene controls while silently showing their diffuse substitutes would be misleading. Historical source geometry and reference paths remain intact.

## A useful initial CPU preview

**Moving surface normals (`trio`)** makes a pleasant common demonstration: three colored spheres and one moving emitter, with an analytic/MC split that makes deterministic integration visually clear. `meshlights` is useful after that, but several emitters substantially increase CPU work.

The intended initial settings are:

| Producer | CPU-friendly preview | Target cadence | Reason |
| --- | --- | --- | --- |
| JS | Scale 0.5, about 100 pixels high; split with 2 MC samples | 30 fps cap | The current allocation-heavy scalar reference benefits from a small image. |
| WASM | Scale 1, about 200 pixels high; split with 2 MC samples | 30 fps cap | More pixels remain practical in the shipped compiled implementation. |
| GPU | Restore the saved GPU scene and quality | User setting | The material showcase and higher-resolution GPU pipeline remain available. |

Scale controls height relative to the 200-pixel base; width follows the visible aspect ratio. These different defaults optimize browsing. **They are not an equal-work speed comparison.** Visitors can raise quality manually; a requested cadence is a cap, not a guarantee. Browser event handling, image upload and painting add cost beyond the measurements below.

## Actual frame-production measurements

The audit runs the **production JS pixel loop** and the **shipped WASM `render_frame` export**, with identical scene/camera/light packing and identical output dimensions per row. It does not use the arithmetic throughput probe. The JS renderer is evaluated as ordinary functions in a native Node/V8 realm, avoiding a `vm` sandbox's global-access overhead. Neither renderer is reimplemented for the benchmark.

Host: Intel Core i9-13980HX, Windows x64, Node 24.15.0 / V8 13.6.233.17. Measurements taken 2026-09-10; five warm-up frames, then 11 measured frames, alternating JS-first and WASM-first ordering. Scene phase is frozen at 0.5. No concurrent agent CPU benchmark was running. OS scheduling, CPU frequency, JIT state and other applications remain uncontrolled, so raw distributions are retained.

Default-like split preview, two MC samples per light:

| Frozen trio image | JS median ms [p10–p90] | WASM median ms [p10–p90] |
| --- | --- | --- |
| 192×100 | 25.89 [23.18–29.70] | 4.50 [4.23–5.86] |
| 400×200 | 98.66 [96.37–115.98] | 22.33 [19.06–26.21] |

The JS 192×100 and WASM 400×200 results support the suggested initial 30 fps cap on this host, before browser overhead. They do not guarantee the same result elsewhere.

Same-image analytic reference, no fill, one center ray:

| Scene and image | JS median ms | WASM median ms | JS/WASM ratio in this run |
| --- | --- | --- | --- |
| Studio 160×100 | 17.68 | 3.61 | 4.89× |
| Studio 240×150 | 41.23 | 7.88 | 5.24× |
| Studio 320×200 | 71.30 | 13.96 | 5.11× |
| Studio 480×300 | 168.05 | 33.19 | 5.06× |
| Trio 240×150 | 42.52 | 7.60 | 5.59× |
| Trio 320×200 | 74.89 | 14.37 | 5.21× |
| Three-light study 240×150 | 117.74 | 18.88 | 6.24× |

This is evidence that the current compiled reference is faster for these workloads on this host. It is **not** a universal WASM multiplier, a SIMD-only experiment, or a comparison of equally optimized languages. JS uses arrays and double-precision arithmetic, and computes extra per-row/difference diagnostics. The shipped C path uses float arithmetic and compiler optimizations. Its documented build enables SIMD, but the source does not implement an explicit packet-of-rays SIMD architecture; the measured speed difference cannot be assigned solely to SIMD.

Timing starts at image production and ends when RGBA bytes are available. It includes the actual production loop's work and diagnostics. It excludes scene preparation, module loading/compilation, WASM parameter upload, browser scheduling, texture upload and display. The WASM output buffer is preallocated; the JS producer allocates its image buffer each frame. Those are characteristics of these actual implementations, preserved in the benchmark.

For the analytic rows above, RGB mean absolute error is below 0.0001 on a 0–255 channel scale. The stronger regression test renders all seven shared scenes at two frozen phases and checks image agreement, visible output and matching primary hits. Small discrepancies from float arithmetic and quantization are expected.

Monte Carlo noise is intentionally **not pixel-identical** between these existing CPU implementations: JS advances one stream across emitters, whereas C reinitializes a light-indexed stream and applies a different seed guard. Both target the diffuse integral, but split/MC pixel differences are not used as a parity assertion. They are reported in the raw benchmark artifacts rather than hidden.

## Why there is no GPU speed ratio here

The existing GPU timing measures CPU-side command submission, not GPU elapsed time. GPU queue work is asynchronous; dividing CPU frame-production time by command-submission time would produce a meaningless speedup. The browser's observed frame cadence is useful for responsiveness, but it also includes scheduling, rendering load and presentation behavior.

A future three-way on-device rendering benchmark should use identical diffuse scenes, camera phase, dimensions, AA, mode and sample count; warm all producers; use GPU timestamp queries when available or explicitly time completion with the associated overhead; and compare output images. The garage's richer BSDF/light workload must not be compared against a diffuse CPU fallback and called an acceleration result.

Recommended concise UI wording:

> JS and WASM run the shared diffuse reference on the CPU. GPU also supports the fitted GGX material garage. Switching to a CPU preview selects a compatible scene and smaller image. Current frame times describe this device; GPU submit time is not GPU execution time.

## Reproduction and artifacts

```powershell
node tools/benchmark-backends.cjs --source-ref 8d39dd2 --repetitions 11 --output docs/backend-benchmark-2026-09-10.json
node tools/benchmark-backends.cjs --source-ref 8d39dd2 --presets --repetitions 11 --output docs/backend-preview-benchmark-2026-09-10.json
node --test tests/backend-parity.test.cjs
```

The JSON files include the source/WASM SHA-256 hashes, environment, full settings, warm-up/measurement protocol, raw frame durations, image discrepancies and hit/evaluation counts. Baseline source is loaded with `git show`, so later UI edits cannot silently change the recorded workload. Tests use the current local producer source and shipped WASM to catch regressions.

- [Full same-workload measurements](backend-benchmark-2026-09-10.json)
- [Default-preview measurements](backend-preview-benchmark-2026-09-10.json)
- [Benchmark implementation](../tools/benchmark-backends.cjs)
- [Feature and image-parity checks](../tests/backend-parity.test.cjs)
