# Four instruments, two export formats

Choose Material nocturne, Spectral observatory, Resonant membrane, Liquid
optics. Each is supplied in both formats. Each paired comparison loads a complete signed GPU Canvas document on the left
and an ordinary, script-free Rive interface on the right. JavaScript owns the
right-hand WebGPU renderer, continuous gestures and diagram updates. The bundle can connect the interface to a larger application; GPU Canvas keeps the visual instrument together. This is a
hybrid host route, not a native RIVX file player.

Both interfaces retain native Rive buttons and bindings. The hybrid side adds
matching GPU control-material skins over ordinary vector labels and geometry, with host pointer handling. Its diagrams use
bound native vertices: material / dispersion curves, modal nodal segments and
an excitation trace, or three chromatic bending paths. No image readback creates
these paths. Liquid optics also permits direct dragging of the lens. The signed
side keeps its own native gestures and embedded control-material skins. Both routes use the same fixed finish per instrument: Liquid spring for Nocturne and Membrane, Constructive geometry for Spectral Observatory.

Linked controls propagate changes in either direction. Material, spectral and
liquid clocks come from their signed document's view model. The membrane clock
follows the official runtime's advance events, starts after the signed document's
intro, and applies the same hold/resume rule and pi/2 phase rate as its authored
timeline. Unlinking allows independent controls and clocks.

The four paired studies retain the canonical WGSL assets from their respective
private authoring sources. Before native WebGPU compilation, `driver.js` guards
negative bases of even literal powers with `abs`: `pow(x, 6)` becomes
`pow(abs(x), 6)`. This preserves the intended even polynomial while avoiding
WebGPU NaNs for negative bases; the Rive backend already folds those powers.
The comparison therefore shares the scene equations and canonical source, with
an explicit compatibility lowering on the host backend. Other backend precision
and rasterization differences remain measurable.

The script-free `.riv` files in `interfaces/` contain no ScriptAsset,
ScriptedDrawable, ScriptedLayout or shader asset. They need no script signing.
Opening one alone preserves its interface and bindings; the external scene and
host-driven diagrams need this page. Editable RML, Luau, fonts, .rev documents,
source archives and the interface generator stay outside the public site.
The build report and generator are in the private authoring workspace.

Direct entries accept `#material-nocturne`, `#spectral-observatory`,
`#resonant-membrane` and `#interactive-optics` (or the `piece` query parameter). An unsupported selection falls back to Spectral Observatory without leaving the comparison.
Legacy `interface.riv` and `runtime/spectral.wgsl` paths remain available.

`node scripts/check-rivx-gpu-comparison.cjs` verifies the available signed studies in Chrome:
linked native controls, host slider/lens gestures, unlinking, responsive layout,
self-hosted playback and actual held-frame pixel agreement. `SITE_URL` selects
the server; `QA_OUTPUT` optionally saves screenshots and the measured report.
Additional control checks cover fixed finishes, membrane strike projection and opt-in sound. A single Web Audio bridge prevents doubled sound when the instruments are linked.

The membrane uses a nine-mode impulse bank with position-dependent weights and mode-dependent decay. The signed file owns its visual response and native gestures; both routes use host audio for the audible-frequency sum.

## Membrane presentation

Crisp details adds the same mild display-space sharpening kernel to both
composed membrane instruments. It is enabled by default and can be switched off;
it neither changes modal displacement nor adds samples to the signed shader.
The Rive presentation uses up to 2× device pixel density for native text and
curves. The signed .riv and its original shader remain unchanged.
