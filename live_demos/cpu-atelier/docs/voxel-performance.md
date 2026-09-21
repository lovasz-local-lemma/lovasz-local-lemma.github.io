# Voxel plume and performance audit

## What changes in voxel mode

The optional **Looks → Voxel splats** treatment is a CPU volume representation. It is not a pixel filter or GPU particle pass. A coarse grid covers the existing fluid box; each cell contains a compact ellipsoidal support with density and temperature sampled from the 48³ simulation. Three-axis DDA traversal finds cells along a camera ray, a ray/ellipsoid intersection finds the occupied interval, and a homogeneous source/extinction integral composites that interval front to back. Traversal stops at the first surface hit supplied by the path tracer.

The default grid uses 18 cells along the box's longest edge; the control offers 8–32. Reducing detail can reduce volume work, but it also removes spatial detail. Supports occupy less than a full cell, intentionally leaving small gaps. This changes optical coverage and does not preserve the smooth field's mass or image exactly. Scattering retains the existing two-sample shadow estimate through the continuous field and heuristic ambient fill. It is an illustrative, stylized volume, not a complete multiple-scattering solver.

The 48³ fluid, cloth dynamics, geometry, surface materials and path tracing are unchanged. Smoke and fire use the same representation switch. The original smooth mode remains the default.

## What changed before the UI pass

The source history distinguishes two changes:

| Revisions | Changes relevant to cost |
|---|---|
| `c3cb3fe` → `96600f3` | The volume march increased from 10 to 32 samples, with emission ordering and early-out fixes. The initial scene changed from a flag to a canopy and from a diffuse sphere to a coated material. |
| `96600f3` → `28c62ce` | HTML, CSS, JavaScript presentation and documentation changed. C++ kernels and compiler flags did not. |

At the existing 45-column cloth setting, the flag has 1,260 particles and 2,376 triangles; the canopy has 2,025 particles and 3,872 triangles. That changes cloth and geometry work independently of the UI. The fresh browser builds also include the earlier source changes; an older locally generated binary is not established as an equivalent baseline.

This evidence identifies real workload changes, but does not assign a measured percentage of the user's perceived slowdown to each one. Browser comparisons were too variable to isolate CSS/layout cost. The new numeric readout batching removes repeated per-frame formatting and DOM writes, including hidden detailed metrics; canvas and simulation cadence remain unchanged.

## Frozen CPU measurements

Run `npm run bench:volume` from this repository. The script compiles the actual historical `c3cb3fe` volume implementation beside the current code and the voxel implementation, then writes `build/volume-benchmark.json`. Git history containing that revision is required.

The harness uses the current engine's real scene and fluid fields, freezes each scene after 32 simulation updates, and holds camera, surface intersections, rays and random seeds constant. Each 448×336 probe covers 150,528 camera rays. One warm-up round precedes five measured rounds; cases are interleaved to reduce order bias. The whole-render comparison resets accumulation before each frame. It includes surface tracing and image assembly but excludes live simulation, browser UI, WebGL upload and display. Oil paint, denoising and vintage finishing are disabled in this comparison.

Recorded on 2026-09-10: Intel Core i9-13980HX, Windows, Node 24.19.0, WebAssembly compiled with `-O3 -msimd128`, **one execution thread**. Two complete runs showed substantial timing variation under the available machine load. All paired checksums were identical between runs. The table reports the median of each run, in milliseconds; the retained [JSON evidence](voxel-performance-measurements.json) also includes each run's minimum and maximum.

| Frozen workload | Historical 10-step volume | Current 32-step volume | Voxel grid 18 volume |
|---|---:|---:|---:|
| Canopy · run 1 | 420.7 | 1,147.1 | 137.1 |
| Canopy · run 2 | 390.5 | 1,068.8 | 111.7 |
| Raised fire · run 1 | 681.8 | 1,177.1 | 148.8 |
| Raised fire · run 2 | 631.1 | 2,166.7 | 260.8 |

| Whole frozen render | Current smooth | Voxel grid 18 |
|---|---:|---:|
| Canopy · run 1 | 1,687.7 | 522.0 |
| Canopy · run 2 | 1,207.2 | 441.5 |
| Raised fire · run 1 | 866.3 | 201.6 |
| Raised fire · run 2 | 2,592.3 | 530.5 |

These probes consistently make the current smooth volume more expensive than the historical one: 2.73–2.74× in the smoke case and 1.73–3.43× in fire. This compares the historical implementations, including source ordering and early-out changes; it does **not** isolate sample count alone. It also does not measure the old default scene against the current default scene.

The voxel representation reduced volume-only time by 7.91–9.57× and whole-render time by 2.73–4.89× in these particular probes. That is a measurable rendering tradeoff with a different image, not a guaranteed end-to-end speedup. Live fluid and cloth costs remain, higher grid detail changes the work, and the browser's many-thread path has different bottlenecks. Use the live stage measurements for the configuration actually being viewed.

## Readout timing and validation

The UI updates numeric readouts no more often than about six times per second. `demo.getUiTiming()` reports only the JavaScript duration of formatting and DOM writes. It does not force or time layout, painting or GPU completion. `demo.setDiagnostics(false)` suspends those readouts temporarily; `true` restores them. The canvas and simulation continue in either case.

The C++ test suite exercises voxel transmittance from both ray directions, clipping at a foreground surface, DDA boundary ties, the gaps between supports, analytic source integration including zero extinction, and preservation of the input fields. These tests pass in both scalar-emulated and actual WebAssembly SIMD configurations. They check the new representation's numerical contract, not equivalence to smooth rendering.

Native browser review on 2026-09-10 checked the rebuilt SIMD module with smoke and fire, orbit controls, grid detail at 8/18/32, pause-and-converge, foreground occlusion, and switching back to smooth volume. No browser errors were reported. This was a functional and visual check, not an isolated browser-performance measurement.
