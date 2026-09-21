# RIVX: scene structure, drawing and delivery

RIVX is an **experimental graphics authoring platform built around Rive**. It combines a native studio, an enhanced rendering framework, and pipelines for converting or baking scene information into a chosen drawing. Its central question is **what information should remain live, and what should become a drawing?**

The platform covers both creation and delivery. The native studio assembles scenes, effects and representations; the rendering framework evaluates and draws them through several backends; the export pipelines produce ordinary `.riv` drawings and animations or specialized browser suites. The GPU Canvas studies add signed instruments authored through the official toolchain. A scene can use rich intermediate computation and still finish as ordinary Rive geometry.

These parts have working implementations with different scopes. The native application is the broadest authoring and research environment. Browser instruments expose selected workflows and reopenable artifacts; they do not collectively constitute a general browser port of every native feature.

## The narrative

The project started with 3D in Rive scripting. Moving into a native renderer made paths, motion, coverage and intermediate fields available to inspect and modify. That led to experiments in soft primitives, extra curve families, geometry-aware effects and 3D scenes.

The return to ordinary Rive was a representation problem: project 3D motion into keyed paths, place baked illumination on image meshes, turn scalar fields into contours, or approximate a soft field with a bounded number of marks. These are useful outputs because they offer an authored drawing language and a particular playback contract.

GPU Canvas adds a way to package live computation inside the Rive document. It changes the delivery choices, rather than invalidating vector reconstruction. A contour drawing, a per-pixel lighting model and a retained scene preserve different things. The appropriate choice depends on the appearance, interaction, compatibility and resource budget.

The project can therefore make a concrete claim: **RIVX extends the authoring and drawing pipeline, then carries selected results into independently playable presentations.** It does not need to claim that every experiment is a universal scene format or that its renderer replaces all of official Rive.

## Three independent decisions

| Decision | Options in this project | Responsibility |
|---|---|---|
| Evaluate | Official Rive core; native Scene3D graph; a specialized browser host | Animation, scene state, geometry and interaction |
| Draw | Official Rive; custom Rive renderer adapter; direct GPU scene rendering | Primitive interpretation, coverage, compositing and auxiliary fields |
| Deliver | Ordinary `.riv`; GPU Canvas `.riv`; browser hybrid | The data and computation that travel to the audience |

An authoring backend is not an output format. Using the custom renderer to inspect or generate a result does not make that backend necessary when the exported result consists entirely of supported ordinary Rive objects.

## Rive-friendly rendering is a research track

GPU Canvas makes live shader computation available inside a Rive presentation. It does not decide whether that presentation would be better as tone regions, stroked contours, fitted soft marks, textured surfaces or a full shader image. RIVX investigates those representation choices as well as the renderer that executes them.

The NPR studies turn illumination into actual geometry. The curve and splat studies expose approximation residuals and primitive budgets. The keyed-motion work measures what can be shared across poses. Paired native performance probes separately measure CPU submission and GPU work for path count, vertices, feather, clips and overdraw. This is a practical study of Rive-friendly drawing, not a universal claim that vectors are faster.

A useful comparison therefore records the source signal, final shapes or images, approximation error, update cost and playback cost. The current native timing evidence supports the workloads and device it measured; the live browser studies make the representation testable without turning those desktop results into browser frame-rate promises. See [the study section](../projects/rivex/index.html#manual-measured-representation-cost) and [live vector reconstruction](../projects/rivex/iso-studio/index.html).

## What the three rendering choices do

**Official Rive** supplies the compatibility baseline and standard playback. In the native imported-artwork workflow, official and custom drawing both retain the official core for import and animation evaluation. The application can therefore change the drawing boundary without replacing the animation engine.

**RIVX Draw**, the working name for the enhanced path backend, implements the Rive renderer/factory boundary. It receives actual paths and transforms. Its value is access to drawing semantics and alternative rendering behavior: contour capture, shape identity, paint-order depth, transform motion, curve fields, experimental coverage and feathering. The paint-order field is not reconstructed physical 3D depth.

Native vector beam is a concrete example. The evaluated artboard supplies transformed contours; an ordered trajectory drives a moving Gaussian spot; analytic segment integration and persistent accumulation determine the appearance. Native contour capture occurs before general clipping and opacity treatment, so these are raw draw contours rather than automatically extracted visible silhouettes. The existing Effect Workshop’s pixel-derived beam is a useful browser treatment with a different input contract.

**Scene3D direct rendering**, labelled “No-Rive” in its interface, draws the laboratory’s own retained geometry and fields directly on the GPU. It supplies reference views and supports representations that do not need an ordinary Rive artboard. Its internal `Backend::Ours` name is separate from the top-level custom Rive renderer. The shared word has obscured two different responsibilities.

The custom route has real limitations. It is not complete official-renderer parity, and ordinary path workloads can benefit from the official renderer’s batching. Its purpose is control and data access where the experiment needs them; profiling measures the resulting tradeoff.

## Working names: Studio, Draw and Suite

| Name | Meaning |
|---|---|
| RIVX Studio | The native authoring application and experimental laboratories |
| RIVX Draw | The experimental, instrumented implementation of the Rive drawing boundary |
| Native `.rivx` project | A particular versioned document family for its intended loader |
| RIVX Suite | A hybrid browser export containing the programs, retained data and optional Rive layers required by its named player |

Draw and Suite are provisional labels, pending a final naming decision. They separate an implementation from a deliverable; no file extension or native format has changed. A Suite can carry a focused browser port of Draw, official Rive with external GPU passes, or a direct custom-WebGL retained scene. It does not imply full enhanced-backend coverage.

Native `.rivx` documents are not universally ordinary `.riv` files with optional bytes appended. The editor document retains curve construction and effect/pipeline settings; `RIVX3S` retains scene/graph state and external asset references; `RIVX3D` retains supported spatial primitives; `RIVXP1` stores a photon cache. Their readers and execution requirements differ.

A hybrid browser deliverable can contain an ordinary `.riv`, a shader and host code without reading every native `.rivx` family. Conversely, the retained custom-WebGL viewer can draw its supported primitive data without using the Rive runtime at all. The artifact and its player should always be named together.

## Curves: retained construction versus ordinary drawing

The native curve editor retains a curve kind, control points and supported handles/style in its `.rivx` editor record. A Yuksel-family construction can remain editable without converting it into manually arranged cubic handles. The custom editor drawing path still samples that construction for rendering; retaining the model is distinct from rendering it without approximation.

The browser [Curve Atelier](../projects/rivex/curve-studio/index.html) ports the local evaluator to JavaScript. It uses the unmodified official Rive WebGL2 runtime to draw a pool of ordinary filled segments. The gold reference is densely sampled; the coral overlay uses the adjustable coarse budget. Its measured residual compares those two sampled drawings. The `.riv` snapshot stores filled quadrilaterals; its separate JSON preserves the construction for the browser host.

The native exporter makes a related but different conversion: Cubic Pen writes true cubic Bézier vertices, while B-spline and Yuksel families become sampled polylines in ordinary `.riv`. It does not perform a fitted cubic conversion. The RIVX label identifies the authoring model and evaluation step; official Rive is a valid endpoint for the resulting drawing. This browser evaluator port is not a port of the complete native renderer.

## GPU Canvas and a host-composed hybrid

Official GPU Canvas is genuinely integrated with the Rive draw stream:

- Its image can be drawn through the normal renderer and participate in transforms, clipping and opacity.
- A color view can feed a subsequent GPU pass.
- The Canvas API can render Rive content into a texture.
- The runtime schedules canvas work and dependencies during draw/replay; scripts can share view-model state.

This supports a Rive → texture → GPU → Rive composition, including multiple dependent canvases. The important advantage is ownership of composition and state inside an authored document, not an exclusive class of shader algorithms. Input routing still needs correct local coordinates and, for instantiated artboards, event forwarding. Shader distortion does not automatically provide physical 3D picking.

A hybrid can implement selected equivalent behavior. Its host then owns shared state and clocks, texture handoff and pass order, coordinate conversion, hit testing, clipping, resize behavior and resource lifetime. The four paired showpieces test matching visual models and selected controls. They do not prove a universal conversion of arbitrary GPU Canvas documents.

The native Browser delivery layer recipe currently composes official Rive underlay and overlay around a retained renderer. Layer stacking alone is not an arbitrary feedback graph. A deeper comparison should inspect dependencies and interaction as well as the resulting image.

Official API references: [GPUCanvas](https://github.com/rive-app/rive-docs/blob/main/scripting/api-reference/gpu/gpu-canvas.mdx), [Canvas](https://github.com/rive-app/rive-docs/blob/main/scripting/api-reference/gpu/canvas.mdx), [Node draw scheduling](https://github.com/rive-app/rive-docs/blob/main/scripting/api-reference/interfaces/node.mdx), [Context and shared view models](https://github.com/rive-app/rive-docs/blob/main/scripting/api-reference/interfaces/context.mdx), [pointer forwarding](https://rive.app/docs/scripting/pointer-events#nested-pointer-events).

## Why some effects need a separate export implementation

Saving an effect’s parameters preserves a recipe. It does not insert the effect’s native renderer into the ordinary Rive runtime.

For example, the native Scene3D_new scope exporter captures its current contour geometry and emits a 60 fps gradient sweep along static stroke legs. It is a real ordinary `.riv` animation, but it does not carry arbitrary imported-artboard contour animation or the live phosphor buffer.

There are three useful ways to deliver it:

1. **Translate the result into ordinary Rive.** Export supported curves, images, meshes and keys. This may preserve only an authored camera or time domain.
2. **Author the computation for GPU Canvas.** Package supported scripts, shaders, resources and Rive interaction in a signed document. The current signed instruments demonstrate this route; the native arbitrary Scene3D/effect-stack converter is not implemented by their existence.
3. **Carry an additional player.** A hybrid includes the code and data needed by that particular live behavior. A focused browser renderer can port one enhanced drawing model without pretending to port the entire native application.

The working [direct vector-backend instrument](../projects/rivex/vector-backend/index.html) now provides this evidence. Official Rive evaluates the original animation and inputs. A command adapter records the actual move, line, cubic and transformed path commands. A custom WebGL renderer integrates the moving beam and retains its phosphor history. An ordinary Rive reticle tracks the beam and a bound rectangle marks the selected path, returning the shared signal to a vector presentation.

Hovering, inspection, isolation and muting operate on captured drawing contributions. Its standalone HTML export includes the original source, official evaluator, adapter, custom renderer and return layer. This demonstrates an extended drawing pipeline whose connection to Rive is the animated geometry itself. It is a focused browser implementation, not official GPU Canvas, a universal native `.rivx` loader or complete native renderer parity. The player names its supported command and rendering contract.

## Three histories, three useful queries

The time-axis studies share an operation—retain successive states and give time a spatial coordinate—but store different signals. They belong to one family of experiments.

| Study | Retained signal | Why keep this version? |
|---|---|---|
| Direct vector instrument: “Give the drawing a time axis” | Evaluated Rive contour coordinates and timestamps | Follow a selected draw call through successive poses; inspect its geometric trajectory. |
| Effect Workshop image-time volume | Rendered colour and motion-density samples in a circular texture history | Slice or ray march appearance, including image content and post-processing. |
| Glass history beside keyed playback | An atlas of baked Rive pose images | Inspect an authored appearance sequence without recomputing its refraction. |

The vector study retains draw-call ordinals rather than guaranteed persistent object IDs across topology-changing animation. Its geometric capture is separate from the beam’s decaying phosphor buffer. The image volume preserves appearance but cannot restore path identity. The glass atlas records authored pose time; its optional computed optical-time overlay has a separate clock and does not modify the baked pixels.

This distinction justifies keeping the studies while explaining them together in [the temporal representation section](../projects/rivex/index.html#manual-beam-spacetime). GPU Canvas can implement compatible variants too; the useful extension is an explicit history contract, not ownership of the idea of time as a dimension.

## The mathematical through-line

| Representation change | Quantity or constraint to preserve |
|---|---|
| 3D motion → 2D keys | Projection, topology and paint order within the authored domain |
| Spatial Gaussian → screen splat | Covariance under the local projection Jacobian |
| Radiance or image → contours / fitted marks | Selected level sets or appearance error under a primitive budget |
| Paths → photon primitives | Sampling measure, valid support, visibility assumptions and optical path time |
| Moving spot → phosphor image | Segment-integrated Gaussian energy and temporal decay |
| Sampled images → opacity keys | The intended effective weights after compositing |

The common research problem is controlled loss of information. A smaller representation is valuable when it retains the behavior that matters. Error, storage, object count, temporal sampling and runtime work belong in the comparison; visual resemblance alone is not the entire result.

## Accumulation and estimator claims

The dense-scattering browser draws independent batches into a framebuffer running mean. Photon and primitive limits bound each batch; they do not cap the accumulated pass count. The current batch and fixed-size image buffers suffice, so memory does not grow with the total paths sampled. A scene or camera edit invalidates the previous mean. This fixes replacing a sparse sample set under a progressive label. It does not prove consistency of the full light-transport estimator: finite footprints, regularized weights, display mapping and limited path branches remain.

Beams fit the segment-and-feather representation particularly well, but that is a drawing advantage rather than an exemption from estimator validation. Higher-dimensional primitives can be stronger estimators when their sampling measure, Jacobian, support and visibility are handled correctly. See [Beyond points and beams](https://cs.dartmouth.edu/~wjarosz/publications/bitterli17beyond.html) and [Photon surfaces](https://cs.dartmouth.edu/~wjarosz/publications/deng19photon.html). [Progressive transient photon beams](https://cs.dartmouth.edu/~wjarosz/publications/marco19progressive.html) additionally distinguishes a progressive bandwidth schedule from simply averaging a fixed kernel. [RadianceLab](../projects/radiance-lab/index.html) is the portfolio's home for the fuller estimator study.

The hourglass separates angular-cell volume sheets from its independent photon surface receiver. The latter removes triangular floor spokes and progressively reduces noise around a finite-kernel expectation. At zero requested radius it still uses a normalized pixel footprint. Neither its sample-complete status nor its beauty reconstruction claims an unbiased or fully converged render.

## What is usable, experimental or still open

**Usable now:** named ordinary `.riv` exports, the four signed GPU Canvas instruments, the direct vector-backend player, specialized retained viewers, and browser laboratories with working standalone export actions. Each has a defined source and player.

**Experimental implementation:** the native custom renderer, auxiliary channels, curve and splat representations, transport primitives and scene graph. These are real working systems with explicit coverage limits, rather than one production-ready replacement runtime.

**Research:** measure-preserving primitives, approximation error, fitting, projection, compositing and representation cost. Their value includes derivations and controlled comparisons, even when the best shipping representation is a bake.

**Expansion:** broader native-to-browser renderer coverage and automatic conversion of more native graph behavior to GPU Canvas. These are concrete extensions of working routes, not prerequisites for claiming the existing result.

## Implementation evidence checked for this account

Native paths are relative to `offline_projs/RIVX/` in the AIO workspace:

- `backend/src/scene/scene_loader.cpp`: official import with a custom factory for the alternate draw route.
- `backend/src/render/gl_stencil_renderer.hpp`: Rive renderer adapter and path contour capture.
- `backend/src/core/player_frame.cpp`: contour-mode artboard draw and auxiliary-field production.
- `backend/src/beam/vector_beam.cpp`: segment integration and persistent accumulation.
- `backend/src/npr/ours_aux_producer.hpp`: identity and geometry-derived field contracts.
- `backend/src/scene3d/scene3d_panel.cpp`: the distinct Scene3D direct/“No-Rive” route.
- `backend/src/editor/shape_editor.cpp`: editor `.rivx` curve/effect/pipeline records and ordinary-Rive conversion boundaries.
- `backend/src/scene3d/scene3d_rivx_record.hpp`: retained scene/graph records and external asset references.
- `backend/src/ui/export_panel.cpp`: native browser suite composition and export actions.

Public browser examples and their README files identify the implemented subset separately from these native capabilities. Authoring sources for the signed showpieces remain outside the public site.

## Extension design brief

The [retained information roadmap](rivx-extension-roadmap.md) distinguishes native capabilities, verified browser subsets and proposed reusable systems. It gives acceptance criteria for semantic fields, curve/splat representations, history buffers, coupled transport and export negotiation.
