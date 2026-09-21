# Portfolio report shell

The `portfolio-*` files and identity mark are local snapshots of the portfolio
navigation, animated elevator and atmosphere modules. They share the main
site's visual behavior. `report.css` adapts the retained report layout;
`report.js` supplies one cancellable browser scroll for each floor selection.
The atmosphere owns its own clock and continues during elevator movement.
Hidden pages and reduced-motion preferences suspend its animation.

`report_shell.py` installs these assets alongside a native report. It only
changes HTML presentation: image data, SVG charts, timings and result records
are untouched. Reapplying it replaces its marked shell sections.

The source portfolio checkpoint for these snapshots was `f9b767e8d5cd8ca0`.
To bring a refreshed native report into the portfolio, run
`python scripts/import-radiance-validation.py` from the portfolio repository.
It reads `AIO/offline_projs/RadianceLab` by default; canonical backup projects
are not modified.
