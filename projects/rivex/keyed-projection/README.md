# 3D projection to ordinary Rive keys

Run `python scripts/make-rivx-keyed-projection.py` to reproduce the original
cube and layered artifacts. Then run `python scripts/make-rivx-keyed-npr.py`
and `python scripts/make-rivx-keyed-breakdown.py` for the vector treatments and
the inspection atlas.
The Rive property IDs follow the verified native
`offline_projs/RIVX/backend/src/io/riv_binary_writer.cpp`. No native files are
changed, and no custom type is needed by the official Rive WebGL2 player.

## Original cube, preserved

`keyed-cube.riv` remains byte-for-byte unchanged: 178,787 bytes, 20 vector shapes,
64 scalar tracks, 15,424 keys and zero images. Its four-second orbit has 240
intervals at 60 fps and a matching endpoint. The selected vertex is directly
keyed in x/y; edges use position, unwrapped rotation and length. This small
artifact remains separately downloadable.

## Layered study

`keyed-scene.riv` adds four independent ordinary Node groups:

- **circle:** 48 contour vertices are independently projected through the same
  camera at every frame. This is a projected polygonal approximation to a circle,
  genuinely moving and changing ellipse shape; it is not merely a translated
  screen-space ring. A visible point has its own x/y marker tracks for readback.
- **receiver:** one 512px texture on a 6×6 Rive image mesh. Each mesh vertex has
  x/y keys, with fixed UVs. Piecewise affine triangles approximate the full
  projective texture mapping. The slate texture is procedural. Its fixed caustic
  was generated from 300,000 equal-solid-angle photon directions subtended by
  this sphere, refracted at both boundaries, and deposited onto the floor.
  The result has a finite pixel filter and explicit display normalization; it
  is an illustrative filtered bake, not a live or unbiased caustic estimator.
- **sticker:** ten independently projected concentric vector contours, plus
  ordinary ARGB color keys. This is an artistic iridescent foil response, not
  diffraction simulation. Red/blue charts split one real packed color track.
- **glass:** 240 cropped, embedded RGBA images, each active for one frame.
  The image source is this exact scene and camera, not imagery from the unrelated
  600-angle export. The bake traces ray/sphere intersections, a reflected branch,
  and entry/exit refraction through a homogeneous sphere, using Schlick Fresnel
  and three nearby refractive indices. It samples the same floor bake and an
  analytic studio environment. Higher internal reflections are omitted. Glass
  appearance and geometry are both authored at 60 fps. Images are held, never
  falsely labeled vector refraction or interpolated live shading.

The generated JSON records exact counts and byte size. The first animation,
`Perspective orbit`, drives geometry/color and per-image visibility.
`Visibility circle`, `Visibility receiver`, `Visibility sticker`, and
`Visibility glass` are one-second control animations: time 0 = visible, time 1 =
hidden. These are genuine ordinary Rive animations; the JS binding does not
expose a writable Node opacity property.

Painting order intentionally keeps the schematic and its contours visible
through surfaces. This is an explanatory construction view, not a general
hidden-surface renderer. The baked caustic does not disappear when the glass
layer is hidden, and the glass bake does not change when the receiver is hidden.
Layer visibility and transport recomputation are different operations.

## UI and exports

### Back to ordinary vector drawing

`python scripts/make-rivx-keyed-npr.py` builds `keyed-engraving.riv` and
`keyed-poster.riv` from the same projection metadata. Both have zero image,
script, shader or custom-runtime assets. The official Rive renderer plays their
ordinary paths, ellipses, fill paints, strokes and 60 fps animation keys.

The sphere silhouette is the exact perspective conic, decomposed into a 2D
ellipse group's center, axes and orientation. The drawing inside that group is
authored 2D NPR: curved engraving strokes or nested flat-tone disks. Each of the
23 strokes has an ordinary scaleX animation; each paper disk has ordinary x/y
keys along a small arc that remains inside the silhouette. The receiver
uses ordinary keyed paths, with an explicitly graphic caustic accent. This is
not recovery of the original glass transport, live relighting, automatic
image-to-vector tracing, or a shader hidden behind an SVG-style label.

The drawing selector swaps complete ordinary Rive artifacts, preserving the
orbit playhead, layer selections and track inspection. A standby state covers
the file load. Exports save the selected drawing and parent-layer opacities;
vector exports contain no inactive image baggage. The offline HTML packages
that selected artifact and only the official runtime.

The left panel independently evaluates the 3D geometry in Three.js. The right
panel is drawn only by the vendored, unmodified official Rive WebGL2 runtime.
The source diagram, 3D metadata and charts are not required by the exported file.
The circle and cube marker readouts come from actual Rive node coordinates;
other charts show the authored values. The glass pose-index chart is explicitly
derived from its separate visibility tracks, not an extra authored property.

Layer toggles apply the file's opacity control animations. The `.riv` download
patches only the four default group-opacity floats, so the selected visibility
survives reopening in an ordinary player. Disabled image bytes are retained;
this is not advertised as an image-payload optimization. The standalone HTML
packages the same `.riv`, official runtime module, WASM and MIT license. It can
be opened directly with `file://` and performs no network fetch. Repeated
downloads use numbered names. The page pauses hidden/offscreen or when the
brochure asks it to pause; reduced-motion users start paused.

## Detailed glass tracks

The optional **Detailed glass sphere breakdown** expands a color-coded inspector
and draws matching measurement guides over the official Rive output. The guides
belong to the inspector and are not added to the exported artwork.

- Baked PBR: selected image-quad center x/y and crop width, extracted from the
  actual file. These are explicitly derived measurements of frame-held meshes,
  not fictitious morph or refraction controls. The existing image-opacity chart
  remains available in the main track selector.
- Engraving: projected ellipse axes, plus three representative scaleX tracks out
  of 23 independently keyed strokes. The visible highlight follows the exact
  same path geometry and transform as the corresponding Rive line.
- Paper tones: projected ellipse axes and three representative filled-disk x
  tracks. The color-coded dots show their actual local x/y positions transformed
  by the keyed ellipse group. These ordinary geometry keys survive download.

`make-rivx-keyed-breakdown.py` parses the current `keyed-scene.riv` directly. It
creates `glass-breakdown.json` and a 478 KB lossless atlas showing every fourth
of the 240 glass poses in one fixed crop. The source file is not modified or
rerendered. The metadata records the atlas crop and frame sampling.

## Compute appearance or store its history

The visible follow-up compares a live ray/sphere shader with a stack of actual
baked images. `index.html?focus=glass` opens only that comparison and does not
load the official runtime or full scene binary. It has its own play control and
shares the same 240-frame orbit. The complete page keeps both studies together.

The live side supports refractive-index changes, an inspection grid that is
actually refracted, a second glass body, and 73 transmitted photon paths. The
paths follow Snell refraction at entry and exit and carry optical lengths,
including refractive index × distance through glass. A temporal gate clips the
segments continuously; it does not only turn endpoint samples on and off.

This is an explicitly labeled browser WebGL companion. A GPU Canvas or retained
host pipeline can evaluate this kind of function, but this page does not claim
a new signed GPU Canvas artifact. The path overlay diagnoses geometry and time,
not converged volume radiance. The shader has Fresnel reflection and a dispersed
transmitted branch; it omits higher internal reflections and the floor caustic
remains the original fixed bake when the material or second sphere changes.

The time-volume side displays 60 reduced image planes from the actual exported
file. Its temporal-range control selects a contiguous window, and dragging
orbits the stack. Four seconds shows the entire atlas. The complete .riv retains
all 240 poses and the original 60 fps cadence. This inspection view connects the
space–time workflow to the actual bytes paid for by prebaking.

## Verification

Run `node scripts/check-rivx-keyed-projection.cjs` with Playwright available.
It verifies the original binary and projection math, reads actual Rive node
values at several frames, checks all four visible toggles, validates the
exported opacity defaults, opens the exported standalone HTML offline, and
checks scrubbing, pause/resume, mobile overflow and browser errors. Screenshots
are written outside the site to `portfolio-work/rivx-keyed-projection/`.

`node scripts/check-rivx-keyed-glass-detail.cjs` additionally decodes the NPR
binaries and compares the displayed detail tracks with their real keyed
properties. It checks optical path length through both spheres, browser shader
responses, time-volume clipping, the lightweight focused route, host suspension
and mobile layout.


### Linked optical history overlays

The optical gate has its own adjustable width and play/pause button. It clips
one shared Snell path set before projection into the live camera and every
visible stored pose. The image-stack depth is authored orbit time, not optical
flight time. The two clocks are deliberately independent.

Three right-side layers can be switched independently: original `.riv` image
slices, a freshly computed optical response, and time-gated rays. The response
layer shares IOR, grid and second-body controls with the live shader. Original
atlas pixels never change; this is not a new baked photon map. The luminous-ray
option adds a screen-space Gaussian halo to the actual traced segments.

`node scripts/check-rivx-glass-history.cjs` verifies both views with pixel
comparisons, the unmodified baked-image layer, width/glow controls, animated
pulse, host/BFCache suspension, drag convention and mobile layout.

The separate sparse `live_demos/rivex/exports/time-angle-lightfield.html` export
also supports horizontal dragging and keyboard arrows to select its eight
recorded angles while holding one of twelve optical time slices. It remains a
96-pose ordinary Rive bake, not free-camera rendering. Its payload checksum,
actual Rive pixel changes, independent time selection and mobile controls are
covered by `node scripts/check-rivx-sparse-bake-drag.cjs`.
