# Curve Atelier

RIVX is the authoring and construction layer in this study; official Rive is the
drawing endpoint. The browser does not run the complete native RIVX renderer.

A browser port of the native RIVX local curve construction, drawn through the
unmodified official Rive WebGL2 runtime. The host evaluates local triplet fits
and a trigonometric blend, then positions a fixed pool of 2,048 ordinary filled
paths. The gold reference uses 48 samples per span; the coral overlay uses the chosen
coarser budget. Their sampled geometric distance is an approximation residual,
not a certified continuous-curve error bound. Basis selection is retained
separately from display sampling. The
spatial loom is a procedural lifting of these 2D samples, not a 3D hair solver.

The native variant uses a chord-dependent triplet parameter from a cubic root,
a quadratic angular map, a monotonic-angle guard and parabolic fallbacks. It
is based on Cem Yuksel's 2020 interpolating-spline work. The paper's theoretical
guarantees must not automatically be attached to all numerical variants.

A .riv snapshot stores the current drawing as ordinary filled quadrilaterals.
It contains no script, bitmap or GPU Canvas and does not retain the curve
construction. A separate JSON records the points, basis and view choices for
host integration; it is a study record, not a universal native .rivx container.

The native editor has a different serialization route. Its editor .rivx record
retains curve kinds, points and supported handles/style. `editorNativePaths`
writes Cubic Pen as true cubic Bézier vertices; other families, including
Yuksel and B-spline, become sampled polylines in ordinary .riv. The custom editor
also samples its retained construction to draw it. “Retained” describes the
editable model, not exact analytic pixel coverage. Neither this browser snapshot
nor the native spline export implements a fitted cubic approximation.

`node scripts/check-rivx-curve-studio.cjs` checks circular reconstruction and
interpolation, edit responses, approximation error reduction, basis variants,
actual official playback, round-trip .riv import, visible strands, suspension
and mobile width. Unvisited embeds are loaded by the shared lazy host.

Reference: https://cemyuksel.com/research/interpolating_curves/
Native provenance: backend/src/curve/curve_eval.cpp in the read-only AIO copy.
