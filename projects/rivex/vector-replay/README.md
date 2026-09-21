# Retained light, live Rive vectors

Serve this directory using `python serve.py` and open `http://127.0.0.1:4206/`.
Any HTTP static server is suitable if `.js` is served as JavaScript and `.wasm`
as WebAssembly. The module files use `.js` to avoid Windows MIME registration
issues for `.mjs`. Direct `file://` loading of modules is not supported.

The player uses the unmodified, locally bundled official Rive WebGL2 advanced
runtime 2.37.8. The native generator supplies `beam-pool.riv`: 384 ordinary
named shapes. The browser moves these Rive nodes after projecting retained 3D
geometry. `renderer.flush()` is required for the direct low-level renderer.

`paths.json` is loaded automatically. The shipped example is an actual native
Cornell-fog trace of 256 paths, with 1,337 nonzero legs. Native export writes
the selected trace-node cache here; no per-view images are added. The geometric
fixture button provides a constructed convergence/divergence example with
explicit provenance. It does not claim to be a physical caustic.

The native clock is currently geometric distance at one scene unit per ns,
without IOR slowdown. The file's clock description is displayed verbatim as
text. All files are processed locally; no upload service is used.

`node geometry.test.mjs` checks temporal clipping, perspective and input
validation. Native pool/serializer tests live with the native exporter.

This is a bounded representation player, not the complete native 3D renderer,
not a general `.rivx` loader and not a radiance estimator. It deliberately
shows the cost of points versus clipped segments under a finite vector budget.
Four palette groups, fixed pool paint order, no visibility solve, and no
feather/optical weighting are explicit limitations. CPU submission time is
reported separately from any claim about GPU completion time.

The parent brochure can send same-origin messages
`{type:'portfolio-lab-visibility',visible:false}` to suspend with state retained.
The first rendered frame announces `portfolio-lab-preview-ready`; a later true
message resumes. Standalone time play/pause and orbit controls remain local.
