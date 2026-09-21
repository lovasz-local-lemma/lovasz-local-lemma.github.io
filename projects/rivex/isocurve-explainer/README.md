# Isocurve construction schematic

Compact event-driven SVG diagram of the conversion from a sampled scalar field
to filled contour bands. Controls change a real threshold, band count and optional
Chaikin smoothing. The diagram imports `isoLoops` from the existing Iso Studio,
so its contours use the same zero-padded marching squares, linear edge crossing,
shared-edge chaining and separated saddle pairing as that browser adaptation.

The enlarged cell is selected from the displayed field at the current threshold;
both endpoint values and the interpolation parameter are actual sample values.
Final fills use compound paths with the even-odd rule. The cyan inspection level
is independent of the discrete fill levels, deliberately explained in the UI.

Native mechanism checked in `backend/src/scene3d/scene3d_iso.cpp`, especially
`isoCurves` and `isoBandsFromGrid`: the native pipeline samples premultiplied RGBA,
smooths its luminance and assembles bands with source color/alpha and optional
component, gradient, depth-of-field and feather behavior. This schematic isolates
contour geometry on a synthetic scalar field; it does not claim to run the native
renderer, render via Rive, or export a file. Full scene conversion/export lives in
the linked Iso Studio. Native source is unchanged.

No continuous animation, resize observer, viewport-height sizing or parent-height
messaging: the diagram uses intrinsic SVG ratios and a compact responsive layout.
There is no hidden-tab work to suspend and no motion to disable for reduced motion.
