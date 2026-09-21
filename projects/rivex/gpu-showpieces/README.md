# Studies in light

These instruments combine an embedded GPU scene with ordinary Rive controls, text, animation and vector diagrams. The gallery uses the official Rive WebGL2 runtime; the four established instruments keep their visual interaction in signed documents. The membrane additionally supplies modal parameters to an optional browser Web Audio synthesizer.

**Liquid optics** lets you drag a refractive lens across an iridescent scene and tune its refraction, dispersion and frost. Crystal, Frosted and Liquid finishes share the same native controls and colour-path diagram.

**Material Nocturne** studies patterned metal, clearcoat and compound glass. Its microfacet diagram follows the roughness control. **Spectral Observatory** pairs a seven-wavelength optical scene with an index-of-refraction curve. **Resonant Membrane** preserves its standing-wave study and adds strike-position projection into nine square-membrane modes, mode-dependent decay, a native nodal diagram and audible synthesis. Strike near a nodal line to suppress a mode. The visual oscillation is deliberately slower than the audible frequencies.

**Prismatic Garden** uses the ordinary Rive + WebGPU delivery format within the same five-choice gallery. It lets a draggable prism explore an enamel-like Julia field. A native Rive parameter pad changes the complex parameter while a vector orbit displays the iteration. Dispersion, magnification, prism rotation and palette remain interactive.

Hover a button to illuminate its rim. Click a preset or drag a luminous slider. Control finishes are fixed to the composition: Liquid spring for Material Nocturne and Resonant Membrane, and Constructive geometry for Spectral Observatory. Scene motion can be held independently of interaction feedback.

The shader and diagram share parameters, so moving a control updates both without reading pixels back from the GPU. The controls themselves are part of the Rive document.

## Two ways to deliver the same instrument

Both export formats are supported for the four paired instruments. [The comparison](comparison/index.html) places a complete GPU Canvas document beside an ordinary Rive interface with an external WebGPU renderer. Linked controls align their optical parameters and clocks. Both routes include matching animated control materials and native vector labels. The external route needs a WebGPU-capable browser; the complete document needs a compatible official Rive runtime with GPU Canvas enabled.

GPU Canvas keeps the visual instrument together. The host bundle can connect Rive to custom rendering code, browser APIs and external scene data. These are complementary deployment choices.

The gallery is presentation-only. Editable documents, authoring projects and source archives are kept outside the public site. Browser rendering assets remain inspectable, as with any client-side application; the external comparison necessarily serves its shader separately.

## Rendering choices

Material Nocturne uses analytic geometry and finite area-light quadrature. Studio reflections and the floor caustic are approximations. Spectral Observatory traces analytic glass boundaries at seven wavelengths; its RGB reconstruction and receiver footprint are designed for real-time presentation. Resonant Membrane uses linear square-membrane modes, with exaggerated displacement and illustrative nodal grains rather than simulated sand. Liquid optics samples its procedural scene along separate RGB paths with deterministic aperture blur; its animated capillary distortion is a material effect, not a fluid simulation.

These are original studies authored with the official Rive CLI. They are separate from the desktop RIVX exporter. The signed files retain the official CLI watermark. Playback is self-hosted and requires no visitor account or connection to the signing service.

The embedded [Inter](licenses/Inter-OFL.txt) and [KaTeX_Main](licenses/KaTeX-fonts-LICENSE.txt) fonts carry their SIL Open Font License notices. The [KaTeX software MIT notice](licenses/KaTeX-software-MIT.txt) is retained separately; it is not the font license. Official Rive runtime attribution is in [vendor/LICENSE](vendor/LICENSE).

## Modal sound

Choose Listen inside the membrane, then strike its surface or diagram. Both delivery routes use the same small host audio bridge. Audio is opt-in, stops when hidden and is disposed when switching instruments. The standalone .riv retains its visual instrument; procedural audio needs this host bridge. This makes the packaging boundary explicit.

The impulse bank uses modes 1 through 3 on each axis. Frequencies are proportional to sqrt((n²+m²)/2); excitation weights sample each eigenfunction at the strike position, with a high-mode rolloff. Each mode has its own exponential decay. The browser creates sine oscillators at audible frequencies; the GPU and Rive curves display the slowed modal motion. [Modal’s original studies](../../modal2d/index.html#manual-excitation) cover the underlying excitation and decay ideas in more detail.


The membrane player now has a default-on **Crisp details** presentation toggle,
also applied equally to both comparison routes. It lifts display contrast at
fine edges and raises the native Rive canvas density ceiling to 2×. It does not
claim a higher-resolution modal solve or change the signed artifact.
Prismatic Garden stays inside the gallery as a time-section instrument: the prism reveals a moving
Julia parameter, while a native Rive curve traces its periodic path. Its updated
host controls are separate from the four signed documents.

## Time sections in Prismatic Garden

Outside the prism, the field evaluates the held complex parameter c. Inside,
`sectionParameter` moves c along a periodic ellipse with independent phase,
excursion and W offset. Tilted mode couples vertical position to that phase.
The Rive gold path and marker inspect the same section through native bound
vertices; the orbit follows its current centre parameter. The mint crosshair
continues to set the base parameter, so the two operations remain distinct.

This connects to High-dimensional Fields & Shadow Design through the idea of
holding a field fixed while moving its section. A Julia family has four real
coordinates (two for z, two for c); time parameterizes a path in c and W offsets
it. This is not the full 5D volume model. Its fragment shader, uniforms and vector
bindings fit the GPU Canvas model as well. This instrument is delivered as an ordinary Rive interface plus WebGPU host. It stays within the five-choice gallery; the paired comparison contains only the four instruments supplied in both formats.

The three garden presets, held time scrubber, W/extent controls and tilted/frozen
comparisons are keyboard accessible; the prism also accepts arrow keys. Reduced
motion starts time held. Both the image and the Rive diagram stop submitting
frames when the host suspends the study. `check-rivx-garden-sections.cjs` verifies
actual changed pixels inside the prism, unchanged pixels outside, real Rive
marker values, controls, mobile width and suspension.
