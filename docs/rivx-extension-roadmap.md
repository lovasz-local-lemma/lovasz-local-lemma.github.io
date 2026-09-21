# RIVX: what an enhanced drawing system should retain

Status: working design brief, 18 September 2026. **Current**, **browser subset**
and **proposed** below describe different levels of implementation.

RIVX is an experimental graphics authoring platform: a native studio, an enhanced
rendering framework, and representation/export pipelines built around Rive. Its
goal is to turn richer scene structure into a presentation while choosing which
relationships remain live and which become a drawing. This brief concerns the
reusable contracts that connect those parts.

## Three responsibilities

| Working name | Responsibility | Current evidence |
|---|---|---|
| RIVX Studio | Author scenes, curves, effects, animations and output representations | Native scene/curve editors; keyed and retained exports |
| RIVX Draw | Inspect and reinterpret evaluated drawing commands | Native custom renderer, auxiliary fields, specialized splats and vector beam |
| RIVX Suite | Deliver a specific Rive + runtime + data combination | Self-contained browser instruments with their own tested players |

Draw shares the official Rive animation core. It is not a replacement animation
engine. Suite is a delivery contract, not a promise that any native .rivx project
loads in any browser. Existing native .rivx records remain versioned formats.

## What the backends contribute

Official Rive is the compatibility baseline and the player for ordinary exports.
The custom native route sees the evaluated geometry, paint, clipping and shape
identity at the rendering boundary. That permits effects driven by more than the
finished color image, and experiments with different coverage and primitive
models. Its per-shape CPU/tessellation work can also be slower; this is not a
blanket performance claim.

Scene3D's direct route draws its own retained scene and transport primitives.
"No-Rive" describes this intermediate drawing route, not an export ban. A later
stage can turn its results into Rive curves, images or keyed poses. If a delivery
contains no Rive content, a custom WebGL viewer is sufficient; that is a direct
scene artifact, rather than an enhanced Rive runtime.

If an effect depends on a custom renderer feature absent from the destination,
the choices are to approximate it in that destination, bake the dependency, or
ship the needed evaluator. Merely changing the filename cannot preserve it.

## GPU Canvas and interlaced workflows

A GPU Canvas instrument can contain a shader image, ordinary Rive content and
shared animation/data-bound controls. Rive also documents rendering an artboard
to an offscreen canvas and sampling that image from a shader. Its documented
WGSL support currently covers vertex and fragment stages, not compute shaders.
See the [official shader documentation](https://rive.app/docs/scripting/wgsl-shaders).

A Suite can build similar relationships with an explicit host graph: evaluated
Rive paths feed a field; the field affects a material; a shared value moves a
Rive diagram; a later layer composites the result. More canvases alone are not
a differentiator. The difficult engineering is ownership, pass order, coordinate
spaces, clipping, state synchronization and export. Four paired studies verify
selected behavior; there is no general automatic GPU Canvas-to-Suite converter.

## The extension agenda

| Extension | Existing foothold | Proposed reusable contract | A useful acceptance test |
|---|---|---|---|
| Semantic drawing fields | Native shape ID, motion, edge/curve and paint-order fields | Named fields with explicit coordinates, units and lifetime | A moving source path drives an attached effect without image-edge inference |
| Retained curve and splat types | Native Yuksel variants and Gaussian paths; browser curve and cloud comparisons | Preserve evaluator parameters separately from sampled drawing | Edit the same source; report approximation error and exported shape cost |
| Time as a queryable coordinate | Spacetime effects, native slices, browser vector-history sweep and glass history | Timestamped bounded history, interpolation, window/filter rules and invalidation | Hold a pose, sweep it, take a moving or tilted section, export and reopen |
| Coupled surface and volume transport | Recorded clocks, finite photon primitives and synchronized receiver-UV bake | One optical clock and normalization contract for each field | One time gate selects matching medium and receiver events |
| A resource/pass graph | Native graph, ShaderWeave-style persistent resources, dedicated browser renderers | Typed inputs, current/previous versions, scheduling and feedback rules | Several Rive/GPU consumers share state without feedback races or duplicate work |
| Export negotiation | Existing ordinary .riv and specialized hybrid writers | Capability report: exact, approximated, baked or host-required per node | Reopen the artifact in the named player and compare both image and interaction |

These are priorities, not newly shipped generic subsystems. In particular, a
first-class 4D buffer API and automatic arbitrary-graph lowering to signed GPU
Canvas are proposals. A bounded 2D+time history already gives a useful concrete
starting point; 3D+time adds another domain and much larger storage costs.

## Why the return to ordinary Rive still matters

A projected curve drawing keeps geometry that can be restyled and inspected.
Keyed motion shares stable shapes instead of storing every frame as a picture.
NPR can become actual paths and colors. A finite pose atlas trades computation
for storage and restricts the represented view/time domain.

Ordinary Rive can still have native animation, state machines and parameter
interaction. A bake limits the dependencies it discards; it does not inherently
remove all interaction. Adding a camera axis to a bake multiplies its sample
count, while retaining the scene lets a player recompute that dependency.

## An ongoing Rive-friendly rendering program

The ordinary-Rive branch has its own questions: how to encode tone as regions or
strokes, approximate a soft field, preserve a local curve construction during
editing, and share shapes across keyed motion. GPU Canvas offers another endpoint
for the same source information. It does not replace the need to choose a useful
representation or measure its cost.

Current evidence includes live isocurve and fitted-mark output through official
Rive, curve sampling residuals, keyed geometry/NPR demonstrations, and paired
native CPU/GPU probes. Future comparisons should match visual error as well as
source data, and record shape count, covered area, uploads, memory and update cost.
Target-browser measurements remain separate from the existing native timing data.

For curves, the native model retains the evaluator and control points; ordinary
exports convert non-cubic families to sampled paths. Curve Atelier ports the
evaluator to JavaScript and draws ordinary filled segments with official Rive.
A general fitted-cubic exporter would be further work, not an existing feature
implied by that study.

The time-history studies should share vocabulary rather than duplicate claims:
vector snapshots preserve geometric selection, image-time textures preserve
appearance, and baked pose atlases preserve an authored sequence. A reusable
history API should state which signal, clock and identity it actually retains.

## Working demonstrations

- [Curve Atelier](../projects/rivex/curve-studio/index.html): retained evaluator,
  approximation residual, official Rive scene drawing and .riv snapshot.
- [Vector backend](../projects/rivex/vector-backend/index.html): capture evaluated
  paths, reinterpret them as a beam, inspect their time history, package the host.
- [Gaussian scene](../projects/rivex/gsplat/index.html): compare representation
  cost and profile; a learned view field is not new glass transport.
- [Flashlight Atlas](../projects/rivex/flashlight-atlas/index.html): actual Rive
  controls coupled to raster, ray and finite photon passes.
- [One pulse, two representations](../projects/rivex/transport-bake/index.html):
  retained hourglass geometry and 16 or 64 HDR receiver slices share an optical
  clock. A receiver-only comparison exposes the atlas approximation beside
  per-hit evaluation; the linked schematic explains continuous volume gating.
  A self-contained export preserves the actual data. Fixed scene, finite kernels.
- [Two-axis camera lattice](../projects/rivex/camera-lattice/index.html): 45 actual
  low-resolution views stored as images and keys in an ordinary .riv, with native
  vector indicators. The host selects a sampled pose; no live 3D runs in playback.
- [Material recovery](../projects/inverse-render-lab/material-recovery.html): the
  same bounded inverse study is available beside the portfolio's research project.

The strongest claim is a tested workflow from source structure to a named player.
Each example should say what was retained, what was approximated, and what the
export can still do. That is more useful than treating every shader effect as
an exclusive engine capability.
