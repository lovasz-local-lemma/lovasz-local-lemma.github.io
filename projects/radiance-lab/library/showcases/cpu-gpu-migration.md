# Which work is on the CPU, and what a GPU move would require

This is an implementation assessment, not a promise that every renderer has the
same supported path classes. The [support matrix](estimator-support.md) records
the actual call paths and mathematical gaps. The newly added scalar volume lab
does not change the production backend split.

| Main mode | Current dominant work | Concrete GPU migration or improvement |
|---|---|---|
| 0 · Rasterizer | GPU triangles and fragment shading; selected lighting inputs arrive from other renderers. | Already GPU-based. Better scene transport comes from correct inputs, visibility and compositing, not moving the rasterizer to a different processor. A traced lighting guide inherits its tracer's scene coverage. |
| 1 · Tracer | GPU compute, with CPU scene packing and feature setup. | Already GPU-based. Fix heterogeneous event continuation, shadow attenuation and matched sampling measures before using speed as a correctness proxy. General mesh tracing needs a triangle representation and acceleration structure in the actual shader path; analytical primitive uploads do not provide that automatically. |
| 2 · Photon mapper | CPU photon walks/map construction, GPU upload and gathering/display. | Parallel photon emission is a natural first step. It needs GPU path queues, deposit compaction, an acceleration structure for gathering and preserved emitted-flux normalization. The existing `pmGPUTrace` UI field alone is not an implementation. |
| 3 · VCM | CPU light subpaths, connections and vertex merging. | Reuse GPU traversal/BSDFs, compact path vertices, and build spatial gathering structures. Connections and atomic film splats parallelize, but their cost and memory differ from eye-path tracing. Correct cross-strategy MIS first; porting fixed blend factors does not restore the published estimator. |
| 4 · MLT | CPU bootstrap and recorded primary-vector Markov chains. | Run many independent chains, each retaining sequential accept/reject state. GPU path evaluation and film atomics are practical; bootstrap normalization, accepted/rejected splat weights and random-state rollback must survive the port. A single chain is not independently parallel across its iterations. |
| 5 · PSSMLT | CPU lazy primary-sample streams and dual splats. | Similar chain-level parallelism, with per-dimension last-modified times, large-step state and rejection backup/restore. The lazy stream is a state-management constraint, not proof that a GPU implementation is impossible. |
| 6 · UPBP | CPU surface/volume subpaths, points/beams and merging. | Requires bounded work queues, medium traversal, beam/point spatial indexing and matching measures for the distinct estimators. Variable-length null paths cause divergence, but wavefront scheduling can address execution separately from correctness. Existing survival/ratio weighting and merge normalization need validation before migration. |
| 7 · Path guiding | CPU spatial grid and angular histograms, proposal sampling and training. | Fixed-size histogram training maps to atomic reductions; sampling tables can be rebuilt between passes. Retain a support-complete mixture and account for both proposal branches. The current mixture/folding PDF issues are mathematical, not CPU limitations. |
| 8 · Manifold prototype | CPU specular-aware MCMC mutations. | The existing prototype could use the same parallel-chain route as MLT. A true manifold method additionally needs constraint construction, Jacobians, Newton solves, branch handling and reversible transition densities. This missing solver is separate from processor choice and remains low priority. |
| 9 · Photon primitives | CPU primitive construction/crossings, numerical mesh sheets and surface-curve experiments; textures displayed by GPU. | Some analytic crossings can become compute kernels or projected raster work with atomic accumulation. Mesh-sheet and surface-curve paths also need GPU mesh traversal, path branches and consistent density/visibility. Candidate-pixel pruning and shared primitive pools may matter more than raw arithmetic. The current fast sheet raster is CPU rasterization; its OpenGL display-device label is not GPU acceleration. |

The near-term order is therefore: establish matching target integrals and known
answers, identify dominant build/traversal/gather costs, then move a bounded
stage with a retained reference. Existing GPU scene buffers help only when their
geometry, material and emitter representations match the intended stage.

Higher-dimensional supports do not automatically become cheaper after
projection. A valid change of variables can cancel geometric factors only when
the sampling law, Jacobian, integrand and measure agree. Singular neighborhoods,
visibility, emitter profiles and finite kernels can leave substantial work and
variance. The [volume lab](volume-estimators.md) makes one such cancellation
explicit with a common scalar target and observed event costs.

For homogeneous media, validate against Beer attenuation and known finite-slab
collision/escape laws. For heterogeneous media, validate null-event continuation
and every connection's attenuation. Then test the actual GPU implementation;
agreement of an independent CPU teaching experiment does not certify a different
shader or an incomplete UPBP implementation.

## Temporal support: rendered measurements versus separate experiments

These are different capabilities, even when the UI places them together.

| Route | What is implemented | Boundary of the claim |
|---|---|---|
| GPU geometric path gates | `ComputePathTracer.cpp` uploads `pathLenMin/Max`; `pathTrace.comp` accumulates geometric segment lengths and gates surface/volume NEE, emitter hits, projector contributions and selected light-tracing connections. A light-side-only switch omits the eye prefix in those gate expressions. | This is a finite path-length window. Some contribution sites use soft edges and others hard intervals. It is not a normalized delta gate, a transient histogram, or a general optical/group-delay calculation through dispersive media. |
| GPU modulated projector | `pt_sky.glsl::tofModulationFactor` evaluates a cosine of source/eye path phase, source-coordinate phase and rolling-sensor phase. With `projectorTofBounced`, it uses the supplied accumulated eye prefix; otherwise it uses a direct round-trip approximation. | Geometric amplitude modulation, not coherent electromagnetic propagation. The function's light-side-only behavior is not identical to the separate path-gate switch. Some overloads substitute a central pixel or approximate world position. |
| Legacy GPU four phase buckets | `ComputePathTracer.cpp` cycles phase by a quarter turn; `pathTrace.comp` averages the modulated eye-path color into four image layers. `tofRecovery.frag` reconstructs phase/amplitude, with its sign now corrected. | Buckets are written before the later light-tracer splats. They do not capture every contribution that eventually reaches the displayed film. GT-guided unwrapping remains explicitly diagnostic. |
| Projector-imaging acquisition | A separate native GPU capture collects four quadratures, three frequencies, or anchored off-axis measurements. Six calibrated setups include a point projector, a phase-front panel, and a line emitter. | Coarse-to-fine unwrapping uses measured phase and the declared capture range, not known depth. This is modulated radiance, not optical complex-amplitude transport. Multipath can yield apparent range; calibration and sideband separation remain necessary. |
| Depth-based CW and setup study | `tofCW.frag` synthesizes several frequencies from known depth; `tofTracer.frag` constructs a direct source–surface–camera path from depth and selectable source/sensor geometry. | These are useful computed reconstruction experiments, not measurements of arbitrary scene multipath. Their frequencies/depths use normalized display units. |
| Native PP0–33 | Their current `PPIntegratorConfig`, film and deposit paths have no arrival-time bin, transient kernel or path-length gate. The new surface33 route is steady-state too. | GPU TOF controls do not make photon balls, spheres, hourglasses or mesh/surface sheets transient. Enhanced raster uses the same steady PP scattering film. |
| Other main CPU integrators | The PM/VCM/MLT/PSSMLT/UPBP/guiding/manifold configuration and deposit paths have no corresponding transient measurement channel. Several `pathLength` members count vertices rather than flight distance. | A post-process can synthesize a phase image from their display/depth, but this does not add transient path transport to the integrator. |
| Support/time laboratory | `SupportIntersectionMath.h` computes a sphere for light distance only, a two-focus ellipsoid for source plus camera distance, a normalized finite window and the coarea limit. | A tested, independent geometric integral. Spatial clipping affects its drawing; the printed analytical validation target stays unclipped. It does not modify PP0–33. |

The earlier audit identified a phase-sign error: for the native convention
`cos(phi - k*pi/2)`, the correct sine difference is `I1-I3`. The later imaging
work corrected `tofRecovery.frag` to `atan(I1-I3,I0-I2)` and introduced a separate
calibrated acquisition. See [Projectors, phase and depth](../projector-imaging.md)
for the measured ambiguity-resolution steps and actual native evidence.

The legacy postprocess still estimates some emitter coordinates from screen UV;
its "GT-guided unwrapped" modes explicitly use known depth to choose the wrap
integer. Those diagnostic outputs must not be confused with the new measured
multi-frequency result. Neither route guarantees first-surface range under
arbitrary multipath, and neither makes steady-state PP0–33 transient.

The next native transient-PP step is a retained path-length prefix at every
primitive parameterization, followed by one clearly specified finite kernel at
each deposit. Compare its integral to a matching GPU/CPU geometric fixture
before introducing delta intersections, optical delay, multibounce chains or
time histograms. A regular time constraint removes one parameter and contributes
the corresponding inverse gradient; dimensionality reduction alone does not
establish sampling density or variance.

Code: [`EngineRender.cpp`](../../src/core/EngineRender.cpp),
[`ComputePathTracer.cpp`](../../src/render/ComputePathTracer.cpp),
[`pathTrace.comp`](../../shaders/pathTrace.comp),
[`pt_sky.glsl`](../../shaders/modules/pt_sky.glsl),
[`tofRecovery.frag`](../../shaders/tofRecovery.frag),
[`SupportIntersectionLab.cpp`](../../src/research/SupportIntersectionLab.cpp).
