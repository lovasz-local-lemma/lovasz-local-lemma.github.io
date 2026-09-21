# Photon manifold atlas

Three related geometry constructions, all displayed as actual `.riv` paths by
the official advanced WebGL2 runtime. No GPU Canvas scripts, custom Rive types,
image frames or hidden 3D shader are used. JavaScript constructs and projects
the scene; each update writes and imports an ordinary Rive document. Export
downloads that same document, retaining a fixed view rather than live controls.

* **Caustic:** a meridian ray fan uses closed-form sphere intersections and Snell
  entry/exit refraction. Forward intersections between neighboring exit rays
  approximate the caustic envelope. Revolving the envelope produces the displayed
  support; the moving inspection plane cuts the exit-ray family. RGB offset IORs
  show qualitative dispersion. The projected footprint is a geometric vertical
  projection, not a receiver irradiance solution.
* **Planes:** `P=L+uU+vV+tω` releases the two emitter-position coordinates while
  holding direction and flight distance. The first-leg geometry is exact. The
  area `A=4|U×V|` is reported with the unit-power `1/A` density; the displayed
  transparency is illustrative, not physical radiance. The selected slab makes
  the remaining kernel dimension visible.
* **Volume:** nine explicitly synthetic kernel centers intersect spatial planes.
  Disk radius is `sqrt(r²−dx²)`. The sum of disk areas times plane spacing is a
  midpoint volume quadrature, compared with the sum of exact sphere volumes.
  Overlap is deliberately counted additively, as a sum of kernels, not a union.
  `1−exp(−Δx*1.1)` alpha keeps denser stacks from simply growing brighter.
  Luminous reconstruction replaces each disk with six nested ordinary vector
  disks, using spacing-aware opacity. This optional soft kernel is a deliberate
  visual reconstruction; it does not change the reported geometric quadrature.

Native code inspected read-only: `lab3d/caustic_solver.hpp`,
`lab3d/lab3d_analytic.cpp`, `scene3d/scene3d_plane_estimator.hpp` and the UV-plane
design notes. This browser adaptation is newly authored; it is not a native
export or a port of the enhanced renderer. It omits visibility, radiometric
weights, MIS, multiple scattering and asymptotic consistency. Display uses finite
polylines and painter sorting; translucent overlaps are intentionally schematic.

URLs can select a construction with `?mode=caustic`, `?mode=planes` or
`?mode=volume`. Drag/keyboard orbit, controls and exports are inside one instrument.
The page rebuilds only on input, pauses when hidden, and accepts the shared
portfolio visibility messages. Idle scenes have no animation loop.
