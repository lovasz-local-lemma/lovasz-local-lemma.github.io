# Roundness Lab

Roundness Lab is a dependency-free experiment in geometric measurement. Draw-a-perfect-circle games turn a familiar shape into a numerical challenge, yet a high score can accompany a visibly imperfect loop. What should closeness to a circle mean, and which counterexamples expose a scoring rule's assumptions?

The score schematic uses native MathML, with matching colors for its five terms and the live measurement breakdown. The comparison lab evaluates a deliberately simple absolute-error baseline alongside the normalized criteria; it does not claim to reproduce a particular game's scoring implementation.

The analysis exposes five measurements before comparing alternative ways to aggregate them:

- least-squares radial error;
- an approximate minimum-zone annulus;
- isoperimetric compactness, `4πA/P²`;
- normalized planar-curve curvature, `κR`;
- radial Fourier harmonics.

The individual measurements are established geometric ideas. The composite calibration is deliberately a product choice: useful for comparing drawings, fully declared, and not presented as an ISO result, probability, or universal definition of roundness.

## The comprehensive score

### Completing a captured loop

The release indicator and the completion operation use the same geometric gate: at least 24 captured samples, nearly one full revolution, conservative angular coverage of at least 90%, and an endpoint gap within `clamp(0.25 R, 10, 36)` SVG drawing units. A proposed seam is checked against the captured stroke. Large gaps, partial arcs, and ambiguous returns are not silently bridged.

The default **straight segment** is the shortest join and changes none of the retained stroke. It can introduce endpoint corners. **Tangent-matched curve** uses a cubic with bounded handles and endpoint directions estimated over a short neighborhood. It aims for tangent-direction continuity, not exact derivative or curvature matching; it can bow away from the intended shape and need not increase the score. Unstable, backward, or crossing tangent bridges fall back to straight with a visible explanation.

A short terminal overshoot after the first revolution can be cut at its closest return to the start. This search is restricted by tail length, proximity, winding, and direction; it never searches for a higher-scoring contour. Long tails, additional laps, and reversals remain untouched. The teal seam and amber discarded tail make the preprocessing visible, and changing the dropdown recomputes from the original captured points each time.

Custom captures use the analyzer's explicit-closure mode throughout the composite, diagnostic, and scale-space calculations. Imported presets retain their original closure convention. Evidence uses actual capture count and endpoint gap, so generated seam samples cannot improve sampling evidence. JSON exports contain separate `input.rawPoints`, `input.analyzedPoints`, and `input.completion` records including bridge, fallback, and trim provenance. A pointer cancellation is not interpreted as a successful release.

### Measurements and aggregation

To keep drawings comparable, the score always uses 240 equal-arc-length samples and Gaussian coordinate smoothing at 1.25% of the contour. The UI's scale slider changes the diagnostic plots, not the score.

Each component becomes a quality from 0–100. Radial error, minimum-zone width, curvature variation, and dominant harmonic amplitude use

```text
q = 100 / (1 + (error / half-score anchor)²)
```

Compactness uses `q = 100 / (1 + (1 − C) / 0.03)`. The component weights and anchors are:

| Component | Weight | Quality = 50 at |
| --- | ---: | ---: |
| Least-squares radial RMS | 30% | 6% of fitted radius |
| Minimum-zone width | 25% | 15% of radius |
| Compactness deficit | 15% | `1 − C = 0.03` |
| Curvature RMS from `κR = 1` | 20% | 0.75 |
| Dominant harmonic, modes 2–12 | 10% | 6% of radius |

The default result is their weighted geometric mean:

```text
score = 100 × exp(Σ wᵢ ln(qᵢ / 100))
```

Two alternatives use the same component qualities: weighted arithmetic (`Σ wᵢqᵢ`) permits greater compensation, while weakest-component (`minᵢqᵢ`) permits none and ignores weights. All three reject open, self-intersecting, sparsely sampled, or incomplete contours. Their partial diagnostics remain visible.

The geometric default is a compromise rather than a perceptual ground truth. The metrics are correlated: radial RMS and harmonics overlap, and compactness and curvature respond to boundary frequency differently. Thresholds, weights, and labels are human-designed rather than fitted to ratings. A deep localized dent can still be diluted by aggregation; conversely, fine curvature noise can produce a low bottleneck score for a visually near-circular outline. The interface exposes both failure directions.

Measurement evidence is separate from roundness. The legacy numerical index combines sample count, drawing size, closure, and smoothing sensitivity; it is a heuristic, not a confidence probability. A well-resolved ellipse can have strong evidence and low roundness. Uniformly shrinking a resolved contour preserves its dimensionless score; that is scale invariance, not proof of anti-cheating. A drawing challenge needs a separately declared size/coverage eligibility rule. All dimensions refer to the SVG input coordinate system, not device pixels.

The result panel exposes that sensitivity as the score at Gaussian smoothing σ = 2, 3, and 4 samples, with the declared σ = 3 result highlighted. The comprehensive contour also marks the largest outward bulge and inward dent, and the weakest component can be opened directly in its existing diagnostic lens.

Built-in specimens, mode, method, diagnostic smoothing, and scoring policy are allow-listed URL state. Custom drawings remain out of the URL. JSON report v2 includes the selected policy, formula, calibration provenance, spatial evidence, and measurements; the legacy `measurementConfidence` field is retained with an explicit heuristic interpretation.

## Criteria and counterexamples

The Criteria experiment varies shape, relative defect amplitude, frequency, and input radius. It compares the three aggregates with a deliberately declared absolute-coordinate-error baseline. The baseline is an illustrative failure mechanism, not a reverse-engineered implementation or benchmark of an unnamed online game. A separate drawing-challenge rule shows how eligibility can prevent small-capture entries without changing mathematical roundness.

For the radial family `r(θ) = R[1 + a cos(nθ)]`, analytic curvature makes the derivative sensitivity explicit:

```text
κ = (r² + 2r′² − rr″) / (r² + r′²)^(3/2)
Rκ − 1 ≈ a(n² − 1) cos(nθ)       [small-amplitude, fixed-n expansion]
```

The approximation is not used as the numerical scoring engine. Raw analytical curves and the score's fixed resampling/smoothing pipeline are distinguished. Modes above 12 are outside the original harmonic-score band even though other metrics can respond to their geometry.

`audit-results/criteria-validation.json` records measured outcomes for the original app presets, with source hashes. Known circles, ellipses, defects, and transformed copies test numerical and logical properties. Agreement with perceived roundness would require a separate, held-out human-rating study; these cases are not a substitute for that validation.

### Measurement and mathematical references

- [NIST: roundness measurements](https://www.itl.nist.gov/div898/handbook/mpc/section3/mpc344.htm) — full traces and fitted-reference deviations. This browser lab does not reproduce an instrument calibration.
- [Chernov & Lesort: least-squares fitting of circles and lines](https://arxiv.org/abs/cs/0301001) — fitting objectives and numerical reliability.
- [OECD/JRC: Handbook on Constructing Composite Indicators](https://www.oecd.org/en/publications/handbook-on-constructing-composite-indicators-methodology-and-user-guide_9789264043466-en.html) — weighting, aggregation, compensation, and sensitivity; our geometry-specific calibration remains an independent design choice.
- [University of Granada: curvature in polar coordinates](https://wpd.ugr.es/~jperez/curvatura-coordenadas-polares-y-ecuaciones-implicitas/) — the exact radial-curve curvature identity.
- [Mokhtarian & Mackworth: curvature scale-space (1992)](https://www.cs.ubc.ca/~mack/Publications/IEEE-PAMI92.pdf) — multiscale representations; a sampled scalar score need not improve monotonically under every smoothing change.

## Why geometry-first?

This lab needs no examples labeled “good circle.” Once a contour exists, explicit geometry gives deterministic outputs, inspectable assumptions, intermediate plots, and known failure modes. That makes it a strong baseline before adding a learned model.

This is not an argument against machine learning. ML could be valuable upstream for extracting a contour from a noisy photograph, or downstream for learning subjective human preference. The narrower thesis here is:

> Before training a model, ask what you can measure directly.

A similar design principle appears in model-based robotics: use known dynamics when they are informative, and learned components when the model or environment is incomplete. Multi-link pendulum control could make a good future companion demo, but it is outside this project's current scope.

## From gesture to geometry

The pipeline exposes adjacent-point deduplication, equal-arc-length resampling, scale-controlled smoothing, closure and self-intersection checks, geometric circle fitting, and all three signal plots. Large endpoint gaps remain open; the tool does not silently invent an interior or a missing 360° radial profile.

For a 2D outline, the relevant local quantity is planar curve curvature `κ = dθ/ds`, not Gaussian curvature. Gaussian curvature belongs to surfaces.

## Experimental research preview

The isolated research section reruns the closed contour at eight Gaussian smoothing scales. It shows a signed heatmap of normalized curvature deviation `κR − 1`, overlays curvature zero crossings, and plots the dimensionless bending excess

```text
B(σ) = L ∫ κ² ds / (4π²) − 1
```

This is inspired by curvature scale-space, an established multiscale representation of planar curves. The lab's colored deviation map and its roundness interpretation are exploratory: they are not added to the comprehensive score, JSON schema, confidence estimate, or calibration. Fine scales can amplify pointer sampling and discrete differentiation; feature tracks can merge or shift; phase depends on the stroke start; and a classical zero-crossing map can be blank for both a circle and a noncircular convex curve. Heatmap bins preserve the strongest signed deviation instead of averaging opposite spikes. Negative discrete bending values are shown as numerical undershoot rather than being clamped to the theoretical zero bound. Open and self-intersecting contours are withheld rather than extrapolated.

## Caliper paradox

The theorem-backed showpiece uses the support function

```text
h(θ) = R [1 + a cos(3θ)]
```

and reconstructs its boundary with `γ(θ) = h(θ)u(θ) + h′(θ)u′(θ)`. Opposite support distances satisfy `h(θ) + h(θ + π) = 2R`, so the curve has exactly the same width in every direction even as it becomes visibly three-lobed. The app rolls it between fixed calipers, plots a finite-sample width check, and compares the unchanged exact gap with the existing circle-specific comprehensive score.

Cauchy's perimeter formula adds a second punchline: integrating directional width gives perimeter, so every member of this constant-width family has the same rim length `P = 2πR`. Its enclosed area is `A = πR²(1 − 4a²)`, however. The readout therefore makes the paradox explicit: same width, same rim length, less area, and still not a circle.

For this family, `|a| < 1/8` keeps the radius of curvature `ρ(θ) = R[1 − 8a cos(3θ)]` positive and the support-function boundary regular. The control stops at `a = 0.12`, below the singular endpoint. This family is not a Reuleaux triangle; it is a smooth Fourier support-function counterexample.

The exact construction is established geometry, while diagnosis of arbitrary sampled drawings remains experimental. Directional width sees only the convex hull, so outlines that share a hull have identical width traces and inward dent depth beyond that hull is not measured; outward outliers can dominate support lines; and finite angular or contour sampling introduces a small numerical residual. The showpiece does not add a constant-width score or change the declared roundness calibration.

The companion support-spectrum strip explains the cancellation exactly. Opposite directions multiply Fourier mode `n` by `(−1)ⁿ`, so adding `h(θ)` and `h(θ + π)` doubles the even support modes and erases every odd mode. In this constructed family, the visible `n = 3` boundary component therefore remains absent from the width spectrum. The displayed DC bars are normalized independently—`R` for support and `2R` for width—while non-DC modes share one scale. This support-function spectrum is distinct from the app's radial-error harmonic diagnostic.

## Tangent walk

For a regular simple closed plane curve, Hopf's Umlaufsatz states

```text
∮ κ ds = ±2π.
```

The tangent walk scrubs by measured normalized arclength around the current analysis contour, rotates a tangent arrow, and plots cumulative tangent turning against a circle's uniform `0° → 360°` ramp. Every eligible simple loop finishes one revolution, but only constant curvature spends that turn uniformly. Concave sections can locally turn backward and must compensate elsewhere. Zero backtracking indicates convexity, not circularity—an ellipse also has no reverse turn.

The implementation estimates a centered tangent at each sample, unwraps successive tangent directions, and interpolates both direction and accumulated turn over measured arclength; it does not numerically integrate the noisier curvature plot. Before claiming the theorem, the lab performs an exact intersection/self-touch scan on the displayed 240-point contour and requires a one-turn rotation number. The local route still depends on smoothing, sampling, and the stroke start. Open and self-intersecting contours are withheld, and near-180° sample or edge turns are treated as numerically ambiguous. Like the Caliper Paradox, this lab is explanatory and does not change the comprehensive score, calibration, confidence, or report schema.

An opt-in osculating-circle microscope adds the local circle with radius `1/|κ|` and a sampled trail of curvature centers (the evolute). This is established differential geometry rendered through an explicitly experimental estimator: when `|κ|` approaches zero, the center legitimately runs toward infinity, while pointer noise and smoothing can move the reconstructed center dramatically. The overlay draws an off-stage ray instead of pretending a near-flat radius is well determined.

## Round-point telescope

The tangent theorem becomes dynamics in the curve-shortening sequel:

```text
∂tγ = κN.
```

Each point follows its curvature vector with speed `|κ|`: convex bulges retreat, concave dents can fill outward, and tighter bending changes faster than flatter arcs. For a smooth embedded one-turn loop, combining this law with `∮κ ds = 2π` gives the universal area clock `dA/dt = −2π`. Gage–Hamilton proved that convex curves shrink toward a round point, and Grayson extended the round-point result to every smooth embedded closed plane curve.

The interface camera-centers both contours, pairing the physical-scale shrink with an equal-area magnification so disappearance and change of shape can be seen separately. A synchronized plot compares measured polygon area with the continuum line `A/A₀ = 1 − t/T`. The solver takes stable explicit arclength-Laplacian steps, lands exactly on each requested frame time, and re-resamples to equal boundary spacing. It rejects an initial downsampling that changes area by more than 1%, perimeter by more than 2%, or leaves a sampled turn of 120° or more. Every step must decrease area and stay within five percentage points of the continuum area clock; crossings are checked every tenth step and before every displayed frame. If a guard fails, the preview stops and says why.

This is a numerical telescope, not a proof or a new score. The continuum theorem is established; the finite polygon approximation can stop early around narrow necks, cusps, or numerical crossings. Its displayed dimensionless form excess is `E_N = L² / [4N tan(π/N)A] − 1`, whose regular `N`-gon fixed point is zero. The magnification is display-only, and the telescope does not change the comprehensive calibration, confidence estimate, or report schema.

## Run locally

```powershell
npm run serve
```

Then open `http://localhost:4173`.

The site is plain HTML, CSS, and JavaScript, so the root files can also be placed on any static host without a build step.

## Verify the geometry

```powershell
npm test
```

The test suite covers exact circles, translation/scale invariance, ellipses, local dents, noisy curvature, traversal direction, duplicate samples, incomplete arcs, invalid/self-intersecting input, composite reconstruction, component-specific failure modes, score eligibility, nearby-scale stability, report fidelity, safe URL-state round trips, multiscale curvature invariance, inflection detection, bending excess, experimental eligibility, support-function identities, constant-width sampling, caliper contacts, metric disagreement, tangent rotation number, reverse turning, measured-arclength interpolation, dense hidden-loop rejection, osculating-center alignment, evolute discontinuities, safe tangent scrubbing, curve-flow fixed points, area-clock drift, round-point convergence, flow similarity invariance, crossing rejection, and keyboard access to overflow plots.

The minimum-zone solver is a deterministic numerical approximation for teaching and comparison. It is not an ISO 12181 conformance implementation.

## Technical references

- [NIST single-trace roundness design](https://www.itl.nist.gov/div898/handbook/mpc/section3/mpc3441.htm)
- [NIST reference algorithms for Chebyshev and one-sided fitting](https://www.nist.gov/publications/reference-algorithms-chebyshev-and-one-sided-data-fitting-coordinate-metrology)
- [ISO 12181-1 vocabulary and roundness parameters](https://www.iso.org/standard/53620.html)
- [UCI lecture notes on plane curves and Gaussian curvature](https://www.math.uci.edu/~cterng/162A_Lecture_Notes.pdf)
- [Viitala et al. on harmonic components of roundness profiles](https://research.aalto.fi/en/publications/uncertainty-analysis-of-phase-and-amplitude-of-harmonic-component/)
- [Mokhtarian & Mackworth on curvature scale-space (1986)](https://www.cs.ubc.ca/~mack/Publications/b2hd-IEEE-PAMI86.html)
- [Mokhtarian & Mackworth on multiscale curvature theory (1989)](https://www.cs.ubc.ca/tr/1989/tr-89-14)
- [Hynd on support functions and the Blaschke–Lebesgue theorem](https://arxiv.org/pdf/2303.04359)
- [Resnikoff on Fourier representations of curves of constant width](https://arxiv.org/abs/1504.06733)
- [Hopf on the turning of tangents and secants of plane curves (1935)](https://numdam.org/item/CM_1935__2__50_0/)
- [Whitney on rotation numbers of regular closed plane curves (1937)](https://www.numdam.org/item/CM_1937__4__276_0.pdf)
- [Ghys, Tabachnikov & Timorin on osculating curves and the Tait–Kneser theorem](https://arxiv.org/abs/1207.5662)
- [Gage & Hamilton on shrinking convex plane curves (1986)](https://doi.org/10.4310/jdg/1214439902)
- [Grayson on shrinking embedded plane curves to round points (1987)](https://doi.org/10.4310/JDG/1214441371)
- [Gage on the isoperimetric inequality for curve shortening (1983)](https://doi.org/10.1215/S0012-7094-83-05052-4)
