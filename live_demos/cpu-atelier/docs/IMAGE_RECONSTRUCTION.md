# Image detail and conservative surface history

This pass starts from `c01d079`. Its aim is to retain the original scene detail
while reducing visible sampling noise without smearing the moving plume.

## Image quality is an explicit choice

The default **Rich** preset uses a fixed 448 × 336 image, 32 samples along each
smooth-volume ray, a 45-column cloth grid (45² in the canopy layout), and a
requested 16 threads, capped by the available worker configuration. The voxel
preset keeps the same image and cloth detail, with 28³ world-space voxel
supports. Both still use the same 48³ fluid simulation. Volume sampling and voxel
support resolution describe the rendered representation, not a finer fluid solve.

The performance advisory observes completed frames; it does not lower quality.
It requires at least 24 observations and eight seconds of active observation,
then considers the median of the latest 32 frames. Sustained frame times above
110 ms show the suggestion; sustained recovery below 80 ms clears it. The gap
between thresholds prevents flicker. Brief spikes do not dominate the median.
The advisory is inactive while paused, hidden, or already in Smooth mode.
Dismissal suppresses it for one minute.

**Smooth** remains an explicit adaptive option. Only that mode adjusts the image
width through its existing budget controller. Choosing a different preset also
selects its stated cloth resolution, volume sampling and thread request; those
changes are not consequences of the advisory.

## Two different uses of previous frames

**Pause & converge** stops scene dynamics and accumulates new Monte Carlo samples
of the same scene. Its displayed sample count is the progressive average's actual
sample count per pixel. Camera or scene changes invalidate that accumulation.

**Surface history**, enabled by default, is a bounded reconstruction filter for
live motion. It combines compatible surface estimates with a running average.
Its age counter saturates at eight: the fresh-sample weight is `1 / age`, then
remains at `1/8`. Older contributions decay exponentially rather than dropping
out of a strict eight-frame window. Rejection and neighborhood clipping make
this a biased reconstruction; age eight does not promise eight independent
effective samples or a particular error reduction. Pausing bypasses this filter and clears its
history so genuine progressive convergence remains a separate path.

An independent live sampling index advances the random ray and subpixel samples
even though each simulation step clears the progressive accumulator. Previously,
that reset made moving frames repeatedly use sample zero. Optional guide capture
does not add random draws or change the tracer's original returned radiance.

## Why the smoke stays current

An unmoving sphere can still change color when moving smoke passes in front of
it. Surface identity, depth and normal alone therefore cannot validate the whole
pixel's old radiance. The tracer records these components separately:

```text
current pixel = current primary-volume radiance
              + current primary-volume transmittance × surface radiance

reconstructed pixel = current primary-volume radiance
                    + current primary-volume transmittance × filtered surface
```

The unattenuated surface component is accumulated directly during tracing. It
is never recovered by dividing a nearly opaque composite by a tiny transmittance.
The volume includes current smoke scattering and temperature-driven fire
emission; neither is stored in temporal history. This decomposition follows the
current tracer, which evaluates participating media on the primary ray only.
It does not add volume transport to subsequent reflected or refracted segments.

History reuse is conservative: the current and previous samples must agree in
object, depth and normal, with a depth tolerance that includes the pixel's
angular footprint. A path touching cloth, including a cloth-blocked shadow ray,
is ineligible. A compatible 3 × 3 current neighborhood bounds the reused surface
color, and the blend-age counter saturates at eight. Camera movement clears
history; this implementation does not reproject it through camera motion.
Scene, material and relevant rendering changes also invalidate history.

These checks reduce common failure modes but cannot prove that old radiance is
still correct. A changing indirect path can escape a finite stochastic sample,
and clipping can soften bright or thin features. The filter remains an inspectable
engineering approximation. The separate spatial à-trous option filters the
current composite in image space and can soften genuine detail even without
temporal trails. Painterly and vintage finishing happen later.

## Inspect reconstruction

The **Inspect reconstruction** selector offers the normal rendered image and
**History reuse**, derived from the actual acceptance and age buffers:

| Color | Meaning |
| --- | --- |
| Charcoal | Ineligible path; no surface history is retained |
| Amber | Eligible current surface, but history is fresh or rejected |
| Teal, brightening with age | Accepted history, age counter saturates at eight |

`temporal_reuse` is the fraction of **all image pixels** that accepted previous
surface history. `temporal_history` is the mean capped history age across
**all currently eligible static-surface candidates**; fresh or rejected-history
candidates count as one. It is zero when there are no eligible candidates.
These denominators differ intentionally. Neither metric measures reconstruction
accuracy. `temporal_ms` reports the filter's measured CPU cost.

The worker exposes `engine_set_temporal(on)` and
`engine_set_temporal_debug(on)`, with corresponding
`engine_get_temporal_ms`, `engine_get_temporal_reuse` and
`engine_get_temporal_history` getters. CPU rendering and reconstruction remain
inside WebAssembly; WebGL presents the resulting image.

## Context and validation

[Spatiotemporal Variance-Guided Filtering](https://research.nvidia.com/labs/rtr/publication/schied2017spatiotemporal/)
combines temporal accumulation with variance estimates and a hierarchical wavelet
filter. It provides useful context for the noise/detail tradeoff, but this project
does **not** implement or claim SVGF. Its smaller filter deliberately separates
dynamic primary-volume transport from conservative surface reuse.

Validated on 2026-09-10:

- `npm run test:ui`: adaptive quality, six advisory/default checks and worker
  command/lifecycle tests passed.
- `npm test`: both scalar-emulation and real SIMD numerical suites passed,
  including unchanged guide/no-guide radiance and RNG, current-volume composition,
  occlusion rejection, neighborhood clipping and synthetic noise reduction.
- `npm run test:temporal`: real-engine lifecycle checks passed for independent
  live sampling, raw first-frame parity, untouched dynamics state, camera/resize
  invalidation, paused progressive parity and diagnostic-effect isolation.
- Both browser modules rebuilt successfully. Native browser review confirmed
  fixed Rich resolution, the sustained-load suggestion and dismissal, the 28³
  voxel preset, history on/off and diagnostic output, keyboard orbit, and paused
  convergence. Scalar and SIMD pages reported no browser errors.

The real-engine check's three measured Rich passes averaged 4.357 ms for the
filter/composite stage on the review machine (448 × 336, 45² cloth, 16 threads).
Optional guide collection adds work inside the trace stage and is not included
in that number. This short functional run is neither a controlled total-cost
comparison nor an FPS guarantee; the UI exposes both stage costs for inspection.
