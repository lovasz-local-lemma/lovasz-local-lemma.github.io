# Isocurve studio

A live browser counterpart of the native render-to-Rive Iso idea. CPU direct-light
sampling supplies object identity, RGB and luminance. Per-object superlevel sets
use the native algorithm's padded lattice / exact edge adjacency / separated
saddle pairing, followed by optional closed Chaikin passes. Each level becomes
an ordinary Rive compound path with even-odd filling. Earlier Rive siblings paint
on top, so exported groups reverse the ascending tone order.

The official advanced WebGL2 Rive runtime renders the output. Its WebGL renderer
does not make this a GPU Canvas document: the file contains paths and fills only.
The left raster reference is a CPU-generated canvas image. No source images,
embedded shaders, scripts or external host code are needed to play the .riv
snapshot. Live camera and light edits require this page's JavaScript evaluator.

Source mechanism inspected read-only in native scene3d_iso.hpp/.cpp and graph
evaluation. Browser adaptation is authored here, not emitted by the native
application or a full renderer port. This subset omits native gradient/feather,
DOF, per-component fit and arbitrary graph source handling. Four direct-light
samples, ambient term and a finite grid are visualization approximations.

Camera/light/radius/tone/smoothing controls rebuild actual vector geometry.
Default refinement uses 240×192 samples (2.56× the former grid); Sampling width chooses 120–420. Camera and slider drags use at most 120×96, then refine on release. Status reports rebuilding.
Document, host visibility and BFCache lifecycle gates are preserved.
