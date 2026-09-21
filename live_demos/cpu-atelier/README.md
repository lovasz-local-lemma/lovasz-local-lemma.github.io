# CPU Atelier — rendering and dynamics in WebAssembly

**Rendering, simulation and image-processing kernels run on the CPU.** C++ compiled to WebAssembly computes each ray, pressure update, cloth constraint and brush stroke. WebGL2 uploads and displays the finished RGBA image; the project uses GPU presentation, but no GPU simulation or shading computation beyond that texture copy.

Ray tracing, participating media and grid solvers are natural GPU workloads. This project moves their computation to WebAssembly to investigate **where SIMD and threads help, where they do not, and how the result changes with the workload**:

- the **renderer** — a progressive Monte Carlo path tracer with single-scattering participating media, a BVH over deforming geometry, and several BSDFs;
- the **physics** — a 48³ Eulerian smoke solver and position-based cloth with structural, shear and bend distance constraints, coupled through drag and moving grid obstacles.

The interface keeps the scene, image treatments and execution choices separate. The live stage diagram exposes dynamics, geometry/BVH updates, path tracing and image finishing. Timings come from the running engine; benchmark ratios are measured on the current device rather than presented as universal speedup claims.

## Explore the experiment

Start with the coupled canopy, then compare the dense plume, raised fire source, windy flag or painterly pass. Scene presets choose their associated cloth arrangement and camera; the Scene tab exposes individual switches. **Pause & converge** stops dynamics while the progressive renderer accumulates samples. The pixel-scale image and its vintage treatment are intentional. **Motion & detail** defaults to Rich: the original 448×336 image, 32 volume samples and 45² canopy. It retains that resolution even when the computer is busy; sustained slow rendering produces a dismissible quality suggestion. Balanced reduces the budget, while Smooth explicitly adapts its image width between 160 and 256 pixels. The 48³ fluid and fixed timestep do not adapt. Voxel motion keeps the Rich image and cloth detail with a finer 28³ support grid. Changing a quality preset rebuilds the cloth, while the fluid keeps evolving.

The **Looks** tab controls sampling, surface-history reconstruction, spatial denoising, color and CPU image effects. **Surface history** maintains a validated running surface average while compositing the current smoke and fire. Each new sample retains at least one eighth of the blend weight. Its diagnostic view exposes history acceptance, capped mean age and CPU cost. It is distinct from paused full-image progressive sampling; [reconstruction notes](docs/IMAGE_RECONSTRUCTION.md) explain the scope and rejection rules. The **Execution** tab controls SIMD and thread count, with runtime checks and optional detailed timings/benchmarks. All engine control IDs and console automation hooks are preserved.

**Voxel splats**, an optional plume treatment in Looks, replace the smooth volume march with CPU traversal through a coarse world-space grid. Each cell contains a compact ellipsoidal support whose density and temperature come from the existing fluid. The supports rotate with the scene, integrate emission and extinction over their ray intersections, and stop at foreground surfaces. The same 48³ simulation continues underneath; surface geometry and its path tracing are unchanged. Coarser sampling and small gaps deliberately alter the image and its optical coverage. This is a rendering tradeoff, not an equivalent transport solution or a faster fluid solver. See [the implementation and measured comparison](docs/voxel-performance.md).

The live bars show each stage's share of the measured C++ substage sum, not processor utilization. **C++ render + finish** excludes simulation and presentation. **Worker compute** measures simulation, rendering, metric collection and the completed framebuffer copy inside the engine worker. It excludes message transport, UI work and GPU presentation. Fresh images per second counts completed frames, not synthetic/interpolated updates. The throughput formerly called `Mrays/s` counts primary pixel samples, not every secondary or shadow ray. Pausing replaces stale simulation counters with zero in the presentation.

The renderer and simulation now run in a dedicated browser worker. Their C++ parallel passes reuse a persistent worker team. Commands apply in order before the next engine operation, and camera updates are coalesced while a frame is busy. Only one normal frame request is in flight. The UI can respond while the engine computes; the GPU still only presents the completed RGBA image with the existing WebGL2 texture copy. No frames are interpolated. The [frame-budget report](docs/smooth-playback.md) separates measured quality savings from dispatch overhead and documents the remaining limits.

Numeric diagnostics update at most about six times per second while the simulation and canvas keep their normal frame cadence. The detailed panel reports the JavaScript time spent formatting and writing these readouts; that measurement excludes layout, paint and GPU completion. `demo.setDiagnostics(false)` temporarily suspends readouts for inspection, and `demo.getUiTiming()` exposes their accumulated timing and scope.

## What's in the scene

A smoke plume and a cloth, two-way coupled: the fluid drags the cloth, and the cloth is a moving solid the smoke flows around.

- **Cloth layouts** — flag on a pole, canopy over the plume (the default), draped through a ring, or a raised "canopy high" that the flame reaches. Resolution is a live slider (9–81 columns).
- **The brass ring is an independent toggle**, not part of a layout, so it can sit under the canopy as well as through the sheet. It moves out of the flag's way automatically.
- **Sealed cloth** (default on) — the sheet is watertight in the grid. Verified from the grid, not the picture: mean smoke density above the canopy is 0.063 with no cloth, 0.00005 with it, and 0.00008 with a ring added — i.e. ~99.9% blocked, and the ring does not break the seal.
- **Materials** on the sphere — diffuse, rough metal, glass, and car paint (clearcoat over a diffuse base), which is the default.
- **Fire** — volumetric emission driven by the fluid's own temperature field. See the note below; it was silently ~100× too dark for a whole phase.
- **Noise reduction** — an edge-aware à-trous filter (spatial only, so it cannot ghost) and low-discrepancy sampling.
- **Looks** — an oil-paint NPR ported from GLSL, and a vintage chain (bloom, chromatic aberration, scanlines, ordered dither), every effect individually toggleable.

### The fire bug, because it is the instructive one

Fire shipped looking like nothing at all, and the reason is worth writing down: **a source term was attenuated by the very slab that emitted it.**

The march accumulates two source terms per step. In-scatter used the transmittance at the step's *entry*, which is right. Emission was written after the line that updates `T`, so it used the transmittance at the step's *exit* — the light was dimmed by the extinction of the cell it was born in. That is a small ordering slip and normally a small error, but this march is coarse: 10 steps across the box at `sigma_t` 16–20 gives an optical depth of about 6 *per step*, so `exp(-6) ≈ 0.0025`. The single brightest sample in the frame was being multiplied by 1/400.

Two things made it hard to see. The emission is cubic in normalised temperature, so it stayed faintly non-zero rather than vanishing — it looked like a tuning problem, not a bug. And the default emitter row (`n/9`) puts the hot core *inside* the opaque sphere, where primary rays stop at the surface hit, so the flame that did survive was not on screen. Chasing it by eye cost far more than it should have; what settled it was compiling the real `fluid.cpp` and `volume_march.cpp` natively and printing the per-step transmittance.

The fix applies extinction after both source terms and increases the march to 32 steps to reduce the coarse-slab error. This improves the image, although a fixed sample count is not a convergence guarantee. The early-out moved to the loop tail at the same time — it had been nested inside the emission branch. An earlier trace measurement reported a **×1.4** cost increase; that was workload-specific. The [later frozen-volume comparison](docs/voxel-performance.md) measures a larger increase in its smoke and fire cases.

There is now a `test_volume_emission` regression test because the earlier tests never enabled emission. Its brightness checks target this discretization failure; they are not a general physical law that emission must remain constant as extinction grows. For a fixed homogeneous source, the exact integral depends on extinction. The optional voxel path tests that analytic integral separately. `engine_get_temp_max` also exists alongside `engine_get_density_above`, so the temperature field can be inspected independently of the rendered sphere and smoke.

### On the vintage look

The vintage presentation retains the low-resolution image: a Reinhard curve, a selectable low-resolution internal buffer, and a coarse single-scattering volume march with heuristic ambient fill. Bloom, chromatic aberration, scanlines and dither build on that presentation. The volume is illustrative transport, not a reference multiple-scattering solution.

## Prerequisites

- **Emscripten 3.1.44** (newer will very likely work). `build.mjs` and `test.mjs` locate it themselves, trying `$EMSDK`, then `C:/emsdk`, then `~/emsdk`, and invoke the emsdk's own Python on `emcc.py` directly — no `emsdk_env`, no `emcc` on `PATH`.
  ```bash
  git clone https://github.com/emscripten-core/emsdk C:/emsdk
  C:/emsdk/emsdk install 3.1.44 && C:/emsdk/emsdk activate 3.1.44
  ```
- **Node 18+**. No npm dependencies.

## Build and run

```bash
npm run build       # SIMD module only (fast path while developing)
npm run build:all   # SIMD + scalar modules; needed for the ?scalar comparison
npm run serve       # static server WITH the COOP/COEP headers pthreads require
npm test            # C++ unit tests, run twice: scalar-f4 and real wasm SIMD
npm run still       # offline render -> build/still_{plain,oil}.png
npm run bench:volume # frozen one-thread legacy/smooth/voxel comparison
npm run bench:frames # pthread parity contracts + matched frame-budget timings
```

Open the URL `npm run serve` prints. The page must report **Cross-origin isolated: true** — without COOP/COEP there is no `SharedArrayBuffer`, and therefore no pthreads. Opening `index.html` from disk will not work.

## Where SIMD lives

Hot kernels are written once and dispatched at runtime through the `f4` abstraction in `src/core/f4.h`, which compiles either to `wasm_simd128` intrinsics or to a scalar struct — so the same source is both the shipped SIMD path and a host-testable reference.

| Kernel | Where | Status |
|---|---|---|
| Ray packets (2×2 quads) | `render/trace_simd.cpp` → `trace_radiance_p` | **SIMD** |
| Primary-ray generation | `engine.cpp` → `render_row_simd` | **SIMD** |
| Jacobi pressure stencil | `sim/fluid.cpp` → `jacobi_iter_simd` (solid-aware) | **SIMD** |
| Buoyancy / dissipation / velocity clamp | `sim/fluid.cpp` | **SIMD** |
| BVH traversal (cloth, ring) | `render/bvh.h` | scalar **per lane** in this implementation; no packet or wavefront traversal |
| Volume ray-march + fire emission | `render/volume_march.cpp` | scalar **per lane** — density lookup is a gather, and wasm SIMD has no gather |
| BSDF sampling (metal/glass/coat) | `render/bsdf.h` | scalar **per lane** — stochastic lobe choice diverges |
| Semi-Lagrangian advection, vorticity | `sim/fluid.cpp` | scalar — gather-bound, no SIMD counterpart |
| Cloth solve, coupling | `sim/cloth.cpp`, `sim/coupling.cpp` | scalar **and serial** — see below |
| à-trous denoise, vintage chain, oil paint | `render/denoise.h`, `npr/` | scalar (threaded) |

## What the toggles actually measure

Four things keep the numbers from flattering themselves.

1. **The scalar arm is genuinely scalar.** Every kernel with a SIMD counterpart carries `#pragma clang loop vectorize(disable)` on its scalar arm. Without it, `-O3` autovectorises the "SIMD off" path and the toggle silently compares hand-SIMD against compiler-SIMD. Kernels with *no* SIMD counterpart are deliberately left alone.
2. **The benchmark times the path tracer alone**, with NPR forced off (it has no SIMD path) and **the simulation frozen** — otherwise the plume grows denser between configurations and whichever arm runs last looks slower. That bug once made SIMD read ×0.86, i.e. slower than scalar.
3. **Combined is not SIMD × threads**, and that is real rather than an error: at 1 thread the tracer is compute-bound, at N threads it is memory-bound, so the two do not compose. SIMD is therefore reported at *both* thread counts.
4. **There is a real end-to-end baseline.** `npm run build:all` also emits a whole-module `-mno-simd128` build. Load it with **`?scalar`**.

`engine_simd_verified` performs startup spot checks: one color channel of lane zero over a renderer tile, and fluid density after a seeded update through each path. These checks detect useful regressions but do not prove complete numerical equivalence. `npm test` runs the C++ suite twice, with scalar-emulated `f4` and real SIMD intrinsics; its timing assertions remain device-sensitive.

## What we actually learned about SIMD

The measurements below are historical development observations from the original test environment. They are not expected scores for another machine or browser. The current UI computes fresh ratios. Cache/bandwidth explanations are interpretations consistent with those observations; no hardware performance-counter study was recorded.

The same technique, across seven workloads, gives wildly different answers. This is the most interesting result in the project:

| Workload | SIMD | Why |
|---|---|---|
| Mandelbrot (Phase 0) | ≈ ×3.6 | coherent, compute-bound, no memory pressure |
| Fluid Jacobi stencil, 32³ (unit bench) | ≈ ×1.6–1.9 | coherent and gather-free — the case SIMD is built for |
| Path tracer, surfaces only | ≈ ×1.2 | divergent rays; lanes do work for inactive rays |
| Path tracer + metal / car paint | ≈ ×1.1–1.2 | **no better** — see below |
| Whole fluid step, 48³ (shipped) | ≈ ×1.05 | a larger working set and more non-stencil work; memory effects are a possible explanation |
| Volume march (and fire) | ≈ ×1.0 | gather-bound; wasm SIMD has no gather instruction |
| Path tracer + glass | ≈ ×0.99 | *slightly worse* — stochastic branching diverges lanes |

**The material comparison tests coherence as well as arithmetic.** Adding rough metal or clearcoat did not produce a large SIMD improvement in these measurements. Stochastic reflection/refraction and coating decisions can send adjacent lanes down different paths. The rough-metal implementation uses a perturbed reflected direction and a Blinn-style direct lobe; clearcoat uses a Schlick branch over a diffuse base. These are illustrative material models, not matched GGX sampling/evaluation or reference-grade BSDFs. Branch divergence is a plausible interpretation of the timings, rather than an independently measured causal result.

**A fast kernel does not imply the same improvement for a full solver.** The gather-free 32³ Jacobi unit benchmark historically measured ×1.6–1.9, while a whole 48³ fluid step measured approximately ×1.05 (76.7 ms → 73.0 ms at one thread). Those are different workloads. The larger grid spans several megabytes across its fields and the full update contains more than the pressure stencil. Cache behavior and memory bandwidth may contribute to the smaller overall improvement, but these tests did not measure cache misses, bandwidth saturation or ALU utilization directly.

These results motivate measuring lane coherence, irregular memory access, working-set size and threading overhead together. Increasing arithmetic throughput alone does not guarantee a faster end-to-end workload.

Threading has its own limits, and they cut the other way too. The same clean run put the fluid at ≈×7 on 32 threads (76.7 ms → 11.0 ms) — well short of linear, for the same bandwidth reason, and notably the *only* configuration where SIMD is a net loss (14.2 ms with SIMD against 11.0 without, once 32 threads are already saturating memory). And the **cloth is deliberately single-threaded**: at ~475 particles across 64 constraint passes, spawning a thread set per pass cost **36 ms versus 4.5 ms serial**. More parallelism is not automatically faster.

### A caveat about absolute numbers

**Absolute milliseconds are not comparable across sessions**, and *thread-scaling* ratios are not either — they degrade under CPU contention, which is exactly what a long working session produces. SIMD ratios at a fixed thread count are the stable ones. A long working session with servers and browser thread pools left this machine ~2.5× slower than it started, and repeated page reloads (each spawning a 32-thread pool) can oversubscribe the CPU badly enough that the in-page benchmark reports threading as *slower* than serial. If the panel's numbers look implausible, restart the browser before believing them.

## Repo map

```
src/core/      vec3, ray, rng, torus, f4 (SIMD abstraction), parallel_for
src/render/    camera, scene, mesh + BVH, path tracer (scalar + packet),
               BSDFs, volume march + fire, tonemap, à-trous denoise
src/sim/       fluid (Eulerian smoke), cloth (projected distance constraints), coupling
src/npr/       oil-paint port, vintage chain
src/engine.cpp the C API, frame orchestration, per-stage timers
js/main.js     module load, WebGL2 blit, controls, benchmarks and live timing display
index.html    study presets, Scene / Looks / Execution inspector, CPU stage diagram
styles.css    responsive glass-panel interface and fixed-aspect image presentation
tools/         offline still renderer (+ a dependency-free PNG encoder)
test/          C++ unit tests
docs/superpowers/  design spec and one implementation plan per phase
```

## Known gaps

Deliberate, not forgotten:

- The persistent team assumes synchronous, non-nested engine passes. The frame harness exercises varying work/thread counts and bit-for-bit simulation parity against the retained spawn/join reference. This is targeted concurrency coverage, not a general-purpose task scheduler.
- Engine controls now cross a dedicated-worker boundary. Console rendering/stepping queries are awaitable; ordinary UI setters are queued until the next operation. A slow worker frame can delay the visible response even though the controls remain responsive.
- Bloom blurs at full resolution; half-res would be ~4× cheaper and visually identical.
- Adaptive quality changes only the image size. It cannot remove fluid/cloth costs, and reduces fine visual detail when the machine is busy.
- The oil-paint rasteriser and the vintage chain have no SIMD path, though both are the coherent stencil work that would benefit most.
- Sealed cloth stamps a 4×4 bilinear sample pattern per quad into solid grid cells; the unsealed mode stamps particles. Neither represents fractional-cell solidity or a fully momentum-conserving fluid/cloth solve.
- No golden-image regression test.
- `npm run build` refreshes only the SIMD module, so `build/engine-scalar.*` goes stale silently. It had drifted a full feature behind — the scalar module predated fire entirely and did not even export `engine_set_fire`, so on `?scalar` (or any browser without SIMD) `cwrap` returned `undefined` and the slider was wired to nothing, with no assertion to say so. Run `npm run build:all` before trusting any `?scalar` comparison.
- The canopy is a rubber sheet, honestly. Four pinned corners with a Jacobi projection cannot hold a 45×45 grid taut, so it sags 1.2–1.5 world units whatever you pin it at, and constraints stretch several times past rest length. Raising the iteration count makes it worse, not better. The layouts are positioned around the measured sag rather than the nominal geometry, which is why the canopy is pinned at 3.10 to sit at ~1.6.

## Credits and licence

The oil-paint NPR is a C++ port of **"oil paint brush drawing" by Florian Berger (flockaroo), 2018** — `REF/oilA.glsl` and `REF/oilB.glsl`, original at <https://shaderoo.org/?shader=N6DFZT>. Those files and the port in `src/npr/oil_paint.{h,cpp}` are licensed **CC BY-NC-SA 3.0**; use here is non-commercial. See `REF/LICENSE`.

The panel's visual design is adapted from `REF/CC_membrane`.

Everything else is MIT — see `LICENSE`. Because of the CC BY-NC-SA components, **the repository as a whole is not MIT and is not for commercial use.**
