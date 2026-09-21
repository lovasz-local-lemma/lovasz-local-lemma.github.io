# Smooth playback: execution and quality budgets

The default preserves the original Rich image detail and leaves the interface thread available while the engine works. Lower quality budgets remain explicit options: a responsive interface does not imply a higher simulation frame rate.

## Presets

| Preset | Image | Smooth volume samples | Canopy particles | Thread budget |
|---|---|---:|---:|---:|
| Smooth | Starts 224×168; width adapts 160–256 | 16 | 25² | Up to 8 |
| Balanced | 320×240 | 24 | 33² | Up to 12 |
| Rich · default | 448×336 | 32 | 45² | Up to 16 |
| Voxel motion | 448×336 | Voxel supports, grid 28 | 45² | Up to 16 |

All retain the existing **48³ fluid**, 18 pressure iterations in the default scene, and the existing fixed 0.1 s simulation step. Scene presets may still choose their own solver/material parameters. Thread budgets are capped by the logical processor count reported by the browser and can be overridden. Cloth tessellation changes its numerical behavior as well as its cost; switching a quality preset rebuilds that cloth. Rich restores the prior image/cloth/volume detail, though the new execution path is retained.

Smooth adjusts only the actual image dimensions. After at least 24 fresh frames and a four-second interval, the median worker time can move the width down by 32 pixels when it exceeds 42 ms, or up when below 23 ms. This hysteresis resists individual timing spikes. No opacity interpolation, inserted frames, gravity changes or timestep shortcuts are involved. Coarser images and fewer volume samples lose detail and can change the appearance of dense or hot media. The controls and Rich mode make that tradeoff explicit.

## Worker execution

Rich never lowers resolution automatically. A rolling median above 110 ms after at least 24 frames and 8 seconds shows a small quality suggestion. Recovery below 80 ms clears it; clicking dismisses it for a minute and focuses the preset selector. Paused, hidden and Smooth playback do not show this hint. These thresholds describe a UI advisory, not a hardware classification or performance guarantee. [Surface-history reconstruction](IMAGE_RECONSTRUCTION.md) separately reduces sampling noise while keeping the current volume live.

`js/engine-worker.js` owns WebAssembly, dynamics, tracing and CPU image finishing. The interface sends ordered commands and receives completed RGBA buffers plus metric snapshots. Camera commands are coalesced while the CPU is busy, avoiding a backlog of obsolete views. Only one normal frame is requested at once. A hidden page stops requesting new simulation frames. The UI retains WebGL2 texture presentation, DOM controls and readouts; it never computes the physics or shading on the GPU.

The C++ `parallel_for` implementation reuses a persistent worker team across synchronous, non-nested passes. Its reference spawn/join path is retained for the test harness. The new team partitions the same loop ranges and waits for every worker before advancing the solver. It does not change the numerical update order within a cell.

The UI can animate and respond while a slow CPU frame completes. It still cannot display a new physical state before the engine produces one. Each completed image follows one existing fixed simulation update, so playback remains presentation-paced, not a wall-clock real-time physics integrator. The image counter reports **fresh images per second**, not the browser animation callback frequency.

## Matched measurements

The measurements below predate surface-history reconstruction and the restored Rich default (baseline `c01d079`). They are retained as the original quality/dispatch comparison, not presented as timings for the current renderer.

`npm run bench:frames` builds and runs a pthread-enabled WebAssembly harness in Node. It checks varying work sizes/thread counts, exact fluid and cloth parity against reference dispatch, resizing without resetting state, preserved wind strength when changing tessellation, and valid rendering across image resizes. Two warm-up rounds precede five interleaved measured rounds. Frozen fluid/cloth state is restored before every measured simulation update plus render. Framebuffer resizing and snapshot restoration are excluded from the timer.

On 2026-09-10, Intel Core i9-13980HX / Windows / Node 24.19.0, `-O3 -msimd128`, eight execution threads:

| Case | Whole frame median | Range | Simulation median | Render median |
|---|---:|---:|---:|---:|
| Prior dispatch, Rich | 242.5 ms | 222.9–259.9 | 30.2 ms | 209.1 ms |
| Persistent team, Rich | 237.4 ms | 225.7–266.0 | 31.9 ms | 205.7 ms |
| Persistent, smaller image, identical physics state | 82.2 ms | 79.2–99.2 | 33.9 ms | 49.8 ms |
| Smooth, 25² cloth | 44.0 ms | 37.3–54.2 | 22.5 ms | 21.7 ms |

The thread-dispatch difference is within run variability here; this measurement does **not** establish a substantial speedup from worker-team reuse. Smaller image/volume budgets account for the largest measured change. Reducing cloth tessellation further changes both geometry/render cost and simulation work. The Smooth case uses the same scene and evolution length with different cloth discretization, so it is a quality comparison rather than identical-state numerical equivalence.

The Smooth median is about 5.5× shorter than the old Rich frame in this measured workload. These are engine timings, not a browser FPS promise. Machine load, camera, smoke density, emission, material divergence, image finishing and thread count affect results. [Raw measurements](smooth-playback-measurements.json) retain the ranges. The UI's worker-time indicator includes metric collection and its framebuffer copy; transport, painting and GPU completion are outside that measurement.

## Console and verification

Setters on `demo` queue engine commands. `await demo.flush()` applies them and refreshes getter snapshots. `render()`, `stepSim()`, `stepN()`, `accumulate()`, `densAbove()` and `tempMax()` are awaitable. `await demo.setPlayback(false)` stops automatic requests for controlled inspection; `true` resumes. `demo.applyQuality('smooth'|'balanced'|'rich'|'splats')` selects a preset, and `demo.getQuality()` reports the requested image budget. Camera, image resize and scene changes never reset the fluid merely to improve performance.

`npm run test:ui` exercises adaptive-budget boundaries and spike resistance. The full scalar/SIMD numerical suites remain separate from the pthread parity/frame harness.

Native browser review on 2026-09-10 confirmed both module builds, all four quality presets, live thread-count changes, camera controls and paused sample accumulation. The interface remained responsive while the engine produced frames. Browser cadence varied with scene age and system load; these checks are functional validation, not an additional controlled speed comparison.
