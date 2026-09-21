# Photon foundry: ordinary Rive + WebGPU compute

A bounded browser companion demonstrating a concrete API distinction, not a new
native RIVX export route. The existing ordinary `vector-backend/beam-cursor.riv`
draws a source-axis reticle and progress rail through the official Rive runtime.
The authored `photon-instrument.riv` owns native preset/view listeners. Its view-model callbacks configure the host renderer; 64 bins of actual deposited energy return as a data-bound Rive path. HTML controls remain for fine adjustments and keyboard-accessible presets. Rive does not itself dispatch the compute shader.

Rebuild the script-free instrument with `python scripts/build-photon-instrument.py`; this uses the local official CLI without publication/signing.

`trace.wgsl` is a real `@compute` shader with 128 invocations per workgroup.
Each independent photon samples a uniform disk or annulus perpendicular to a
collimated beam. The annulus spans radii 0.38–0.42; the disk radius is 0.64. Both
emit the same total power. The halo preset uses the annulus to make the three
refractive-index footprints visibly separable, with no synthetic ring overlay. It intersects a sphere, refracts at entry and exit using Snell's law,
retains Schlick Fresnel transmission and a Beer attenuation factor, then hits
the horizontal receiver. One of three RGB bands is selected uniformly and its
weight is multiplied by three. Reflected and TIR branches are discarded.

The invocation deposits positive, fixed-point flux with `atomicAdd` into a
256×256×RGB uint storage buffer. A separate fragment stage reads this exact
buffer, reconstructs it with a small spatial filter, divides by emitted count
and cell area, then tone maps. The glass in the beauty view is a bounded display
shader, not a second image of the Monte Carlo estimator. Top view and false
colour are direct views of the same receiver data.

The quantum is 1/256, maximum contribution per ray per channel is 768, and the
4,194,304-ray cap bounds any one uint sum below 2^32. The filter, finite cells,
three-band spectrum, quantization, discarded branches and finite batches are
explicit approximation limits. This is neither progressive photon mapping with
a shrinking radius nor unbiased full light transport.

Optical edits clear the field; exposure/view edits retain it. Sampling pauses
offscreen, in hidden tabs and on parent suspension. Reduced motion starts held
after a single batch. At the cap, submission stops. Stats readback copies only
272 bytes once per 16 batches: counts and 64 marginal energy bins. The marginal is peak-normalized for the Rive plot and does not drive the optical render.

## Capability boundary

The official documentation currently lists vertex and fragment shaders but no
compute shaders: https://rive.app/docs/scripting/wgsl-shaders#wgsl-support . This
particular compute/storage-atomic algorithm is not a direct GPU Canvas port.
An alternative caustic algorithm can use render passes, texture feedback or CPU
work; equivalent-looking imagery is not claimed impossible in GPU Canvas.

Flashlight Atlas uses vertex/fragment passes for its base optical renderer; its
optional Living fog mode now adds a compute simulation in the host. Prismatic
Garden remains a host delivery choice, not an exclusive effect. The native RIVX Lab3D implementation contains related compute
traces and atomic volume deposits, but this small page is independently adapted.

## Checks

The DOM exposes `data-ready`, `data-route`, `data-photons`, `data-batches`,
`data-compute-workgroups`, and readback counts `data-accepted`, `data-missed`,
`data-rejected`. `computePhotonState()` returns a local diagnostic snapshot.
Verify presets change the actual field, Hold stops emitted counts, exposure and
view leave counts intact, and optical changes restart accumulation. GPU shader
compilation errors are surfaced visibly. `node --check app.js` checks syntax.
