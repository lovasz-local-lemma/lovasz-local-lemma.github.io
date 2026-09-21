# The same volume integral, three estimators

Open **View → Optics & primitive laboratory → Volume estimators**. This is a
native scalar transport experiment. It samples real collision histories and
running estimates; the plotted dots are the events actually used by the last
sample. Hidden tabs stop sampling. Pause retains the accumulated state; Reset
returns to deterministic independent random streams.

The target on a finite ray segment is

```text
I = integral from 0 to D of q(t) T(t) dt
T(t) = exp(-integral from 0 to t of sigma(s) ds).
```

`q` is a nonnegative scalar source, `sigma` is positive extinction, and `D` is a
known boundary. Constant, smooth heterogeneous and layered extinction profiles
have analytically known optical depths. A separately evaluated, refined Simpson
quadrature supplies the reference integral. The panel reports its refinement
delta as well as the Monte Carlo estimates. Spatially varying `q` prevents an
otherwise constant-weight example from hiding important terms.

## Collision: the extinction belongs to the sampling density

Delta tracking samples the first real collision by thinning Poisson candidates
of rate `M >= max sigma`. A rejected candidate continues in the **same** medium.
The real-collision density is `p(t) = sigma(t) T(t)`, with an escape atom of mass
`T(D)`. A collision contributes `q(t)/sigma(t)`; an escape contributes zero.

This is the concrete `f/p` cancellation: `T` cancels because the sampling law
contains precisely that same transmittance. The weight is constant only if
`q/sigma` is constant. Even then the finite-domain escape event generally leaves
variance. Multiplying another transmittance after this cancellation changes the
expected result. Introducing more path coordinates alone supplies no such proof.

## Track length: score the surviving interval

Sample the same first-collision law independently, but score

```text
integral from 0 to min(tau,D) of q(t) dt.
```

The expectation of its indicator is `P(tau > t) = T(t)`, so interchanging the
integral and expectation recovers the same `I`. The lab integrates its source
profile analytically along the surviving interval. It does not quadrature-sample
that interval or quietly omit escaped paths. In a thin homogeneous medium this
often has far less variance than scoring rare collisions; it is not universally
better in optically thick media.

## Ratio tracking: retain every null-event factor

Sample `U` uniformly from `[0,D]`. Draw Poisson candidates on `[0,U]`, form

```text
R(U) = product over candidates i of [1 - sigma(t_i)/M],
score = D q(U) R(U).
```

The Poisson product identity gives `E[R(U) | U] = T(U)`. Integrating over `U`
again gives `I`. The factors lie in `[0,1]` because the supplied majorant bounds
the entire analytic profile. Raising it changes event cost and variance, not the
target. There is no biased iteration cap or early product cutoff. This is
ordinary ratio tracking, not residual-ratio tracking or a general signed-density
method. The violet staircase depicts the successive product weights.

For the reference definitions and null-collision context, see
[PBRT's transmittance chapter](https://pbr-book.org/4ed/Volume_Scattering/Transmittance)
and its [volume-transport references](https://pbr-book.org/4ed/Light_Transport_II_Volume_Rendering/Further_Reading).
The three scalar expectation arguments above specialize those ideas to the
explicit target implemented here.

## Read the error and cost together

Each method has an independent random stream and running mean, variance and
standard error. The displayed `1.96 SE` is an asymptotic interval scale, not a
finite-sample guarantee or proof that a renderer is unbiased. Density calls per
sample and measured CPU sampling time distinguish work from sample count.
The reference has its own displayed quadrature refinement error.

Suggested experiments:

- Set homogeneous extinction to 0.07, length 4 and source variation 0. Rare
  collision scores contrast with almost-full surviving track lengths.
- Raise extinction to 1.5. Nearly every ray collides; constant collision scores
  become competitive while track lengths still vary.
- Choose layered fog and source variation 0.8. The changing `q/sigma` exposes
  why a flat-weight argument cannot simply be transferred to heterogeneity.
- Raise the majorant from 1 to 4 times its required bound. The target stays
  fixed while null-event counts and ratio-product behavior change.

`PrismVolumeEstimatorTest` compares means with the common quadrature, checks
homogeneous closed-form mean/variance and escape mass, checks optical depth
against independent integration, and rejects an invalid majorant. It also tests
the ratio product at a fixed endpoint. These tests cover this controlled lab,
not all scene transport.

## Scene studies and current renderer boundaries

| Scene | Paired route | Controlled change |
|---|---|---|
| 103 · Fog chamber / homogeneous baseline | GPU tracer | Fixed coloured sources, receiver geometry and base coefficients in homogeneous fog. |
| 104 · Fog chamber / heterogeneous mist | GPU tracer | The same chamber and camera with a frozen NoiseLab field. The spatial density changes; its average optical depth is not claimed equal to 103. |
| 105 · Emitter size / equal-flux apertures | PP31 | Tiny, medium and broad quads at equal luminance-weighted emitted flux. Angular profile is the same. |
| 106 · Emission profile / equal-flux directions | PP31 | Equal-sized laser-like, cone and diffuse quads, each normalized using its actual cosine-weighted angular integral. |

For 105–106 the colours differ, so equal radiance values would not be equal
luminance-weighted flux. The scene normalizes both source area and the colour's
linear RGB luminance. These are useful spatial comparisons, while moving the
camera or editing one source enables further study. Positions and colours are
different across the three sources; this is not a variance ranking from an
isolated single-source ablation. The earlier 80–82 size/profile matrices remain
available.

```powershell
.\Showcases.ps1 -Scene 103
.\Showcases.ps1 -Scene 104 -Research
.\Showcases.ps1 -Scene 105
.\Showcases.ps1 -Scene 106 -Strategy 13
```

The 103–104 GPU scenes demonstrate the existing spatial density implementation.
They do not certify its null-collision weighting: the [support audit](estimator-support.md)
records incomplete candidate continuation, homogeneous shadow attenuation, and
a volume-NEE density-measure issue. The new lab contains the complete bounded
scalar tracking loops and provides an independent teaching/test reference; it
does **not** change those GPU or UPBP call paths. PP31 still requires a common
homogeneous medium, so the launcher does not pair it with the heterogeneous
chamber. CPU throughput and GPU capability are separate questions.

A production transport fix needs the same survival tests within each actual
backend, plus heterogeneous shadow paths, spectral weighting and matched source
measures. Full manifold exploration remains a separate, low-priority solver
project: the existing mode 8 is a specular-aware mutation prototype, not a
constraint Newton solve.
