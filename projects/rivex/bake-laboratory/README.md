# What survives the bake?

A static browser experiment with a local official Rive runtime for its vector-output preview. Open `index.html` over HTTP. Use `index.html?focus=differential` for the focused lighting, sensitivity and fitting view; it creates only the three visible renderers. `index.html?focus=bake` similarly isolates the capture comparison for an embedded chapter.

The three top views share an analytic scene but actually retain different data:

- **Frozen image:** a 640 × 416 RGBA8 framebuffer capture. Scene edits cannot change it.
- **Surface bake:** two 128 × 128 sphere charts and a 256 × 256 floor chart. The CPU evaluates the same Lambertian point-light model as the GPU and stores scalar irradiance in RGBA8 over the range [0, 4]. The shader samples the charts in object coordinates. Color stays editable because it is factored out; disabling that control uses the captured color parameter. A camera change reprojects real geometry. Chart resolution, quantization, bilinear filtering and hard shadow discontinuities account for differences from live shading.
- **Retained scene:** analytic spheres, floor, surface colors and light parameters. The GPU recomputes intersections, point-light visibility and inverse-square diffuse illumination for the current state.

The bake comparison has a constant ambient term and hard shadows. Its deliberate Lambertian factorization has no specular BRDF. The separate differential route adds a matching CPU/GPU GGX response. Neither route has glass, indirect illumination or a native RIVX loader. The floor covers an 8 × 8 patch. The current permitted light power is safely below the chart encoding's maximum irradiance. Surface coordinates are an optional explanatory overlay on the two geometry-aware views, and are excluded from the frozen capture and inverse fitting.

## Differential rendering and fitting

This is an optional authoring experiment, rather than another rendering backend.
Retaining a model in the host makes it possible to fit an image before choosing
the deliverable. The fitted scene is then shaded and projected into actual Rive
paths and solid fills by `rive-bridge.js`. The downloaded drawing is fixed; the
CPU model, image-fitting process and editable 3D parameters remain in the host.
This makes the connection to RIVX concrete without claiming that the native
platform exports its inverse solver, or that GPU Canvas cannot evaluate this
scene. The same experiment also belongs to Inverse Render Lab, where recovery
is the primary subject.

The signed sensitivity view central-differences linear luminance with respect to light angle in **radians**. Positive values are orange; negative values are cyan. The magnitude display is `1 − exp(−3 |dY/dθ|)`, with a fixed scale. The difference step can be changed. Hard visibility boundaries are discontinuous; this is a numerical sensitivity visualization, not an analytic derivative of visibility.

The inverse problem fixes camera and geometry. Its default two unknowns are angle and power; the material route can additionally fit roughness, relief, colour and texture contrast as detailed below. The target image is generated from separate controls. The solver receives only sampled target colors; it does not read or interpolate the target light parameters. A matching CPU ray cast selects visible sphere pixels on an 80 × 52 grid. Linear RGB residuals drive a damped Gauss–Newton solve using central differences and a backtracking line search. In the richer material scene, a coarse angle survey first finds a lower-error basin: because the response is affine in emitter power, each angle candidate profiles power with a bounded least-squares fit. This is necessary for narrow specular lobes, where the original diffuse starting point can trap a local solve. Both stages receive target colours only. The floor and image background are excluded. Every accepted step reduces the measured objective. The solver reports convergence, a stationary point or its iteration limit without claiming global recovery for every starting condition. The chart uses square-root MSE for display; its numeric readout is untransformed MSE.

## Material studies and accepted-step animation

`?focus=differential` opens with glazed mokume bands, not the original flat matte scene. Three presets give mokume metal, fluted porcelain and woven lacquer. The surface controls are material family, pattern, microfacet roughness, bump amplitude and texture contrast. Patterns modulate object-space albedo; analytic gradients perturb the shading normal. **Bump is not geometric displacement**: intersection positions, silhouettes, shadow geometry and fitting regions remain the two known spheres. Choosing Plain disables bump amplitude because that surface has no height gradient.

The CPU and GLSL use the same isotropic GGX distribution, Schlick Fresnel, Schlick-GGX masking approximation, inverse-square point emitter, geometric shadow test and ambient term. Brushed metal is a rough metallic response, not an anisotropic brush model. Glazed lacquer uses a stronger dielectric Fresnel term, not a full layered coat. Procedural textures avoid an external asset dependency. The floor shares the selected appearance for display but is excluded from fitting.

Accepted solutions animate with a cubic ease between the previous estimate and the next measured estimate. The solver never interpolates toward hidden target parameters. The loss graph records accepted endpoints only; the visual interpolation between them is not claimed to be a monotonic optimization path. A material edit cancels the current fit and rebuilds the residual samples. Unchecked appearance variables remain shared; selected unknowns have independent target controls. The target remains a separate image evaluated under its own light and selected appearance.

The material language links to LTC Light Studio and RadianceLab, and the inverse question to Inverse Render Lab. This is a small browser study inspired by that portfolio work, not a claim that those full renderers have been ported into a Rive asset.

## Rendering, lifecycle and delivery

The inverse model runs in **custom WebGL2 and JavaScript**, not official GPU Canvas, a native application export, or a universal differentiable renderer. The dedicated vector-output pane does use standard `.riv` playback and exports its real ordinary Rive document. The retained browser model is outside that fixed vector snapshot.

Rendering is demand-driven. Only an explicitly requested fit animates accepted parameter steps, and it advances only while the document and its host are visible. Hidden time does not advance the transition. Reduced-motion preferences apply accepted values immediately while retaining the numerical solve and status. Page teardown releases buffers, programs and textures. Framebuffer readback occurs only when capturing an image; fitting uses the matching CPU model, not repeated GPU readback.


## Checks

`node scripts/check-rivx-bake-laboratory.cjs` runs against the served site using Chrome. It checks real captured-frame invariants, matching surface reprojection, light recovery, distinct material presets and bump edits, intermediate animation without a fabricated loss sample, lifecycle suspension, mobile layout and reduced motion. It also compares rendered GPU pixels to the independent CPU radiance evaluator for all three materials; this guards against an attractive display that solves a different forward model.

## Six-variable recovery and native vector output — September 2026

The focused differential route now optionally fits roughness, bump amplitude,
material colour mix and procedural texture contrast, alongside angle and emitter
power. Checked parameters have independent target values; unchecked ones are
shared known inputs. Camera, geometry, exposure, ambient term, material category,
texture type and spatial frequencies stay fixed. Plain surfaces disable the
unobservable texture-contrast and bump variables. The second object's calibrated
colour helps constrain power; this does not resolve arbitrary albedo/illumination
ambiguities from real photographs.

The selected variables use central-difference Jacobian columns scaled to their
bounded parameter ranges. A small dense normal equation solve uses diagonal
Levenberg damping and backtracking. Each accepted endpoint is evaluated against
actual linear RGB residuals. The solver receives target colours, never the target
parameter object. Coarse angle profiling is still used to enter a useful basin.
The six-scalar woven-lacquer challenge converges in six accepted steps to below
1e-10 MSE in the tested browser. This is a matched synthetic problem, not a general
global convergence guarantee. Whole textures require stronger observations and
priors; the current texture unknown is one scalar coefficient, not every texel.

`Slow transitions for inspection` is presentation only. Turning it off removes
intentional delay; the same numerical solve runs in bounded frame work slices.
The report distinguishes measured CPU numerical time from wall time including
animation and suspension. No fixed cross-device performance claim is made.

`rive-bridge.js` projects the same analytic scene into shaded triangular facets
and writes an actual Rive 7 document. Sphere/floor identities, camera, light,
colour, roughness, pattern, relief and contrast all feed the facet computation.
The official runtime renders the resulting native paths and solid fills. No
shader, image, script, 3D scene or inverse solve is hidden in the output. This is
a faceted, fixed-view approximation. With `Live update` enabled, scene edits
rebuild the drawing automatically: a smaller facet budget follows a drag, then
the selected density refines the result after input settles. With it disabled,
the drawing holds until `Rebuild vector scene` is pressed. The exported .riv is
exactly the bytes shown by the native preview. Its coarse shadows and highlights
are part of the chosen tessellation budget, not an equivalent live PBR renderer.

The same study is available at `projects/inverse-render-lab/material-recovery.html`.
Run `python scripts/sync-inverse-material-study.py` after changing the shared HTML
shell. Both entry points use the identical solver, GPU model and Rive converter;
the research project therefore includes the enhancement directly. The solver
family connects to the existing Inverse Render Lab residual-vector Gauss–Newton
path. The compact GGX pair is a new controlled adaptation, not a direct port of
the research renderer, PRB, radiative backpropagation or visibility derivatives.

Additional regression: `node scripts/check-rivx-inverse-scalars.cjs` checks target
isolation, six-variable recovery, instant mode, measured work, real Rive bytes,
fixed-snapshot/rebuild behaviour and narrow layout. Private visual QA resides in
`portfolio-work/inverse-morevars`, outside the published repository.
