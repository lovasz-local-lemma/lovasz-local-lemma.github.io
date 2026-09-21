# A camera becomes a small lattice

Actual ordinary Rive file: `camera-lattice.riv` (1,898,557 bytes).

- 9 azimuth samples from −60° to +60°, 15° spacing.
- 5 elevation samples from 15° to 65°, 12.5° spacing.
- 45 embedded 256×192 PNG images; 8,847,360 decoded RGBA bytes (8.44 MiB).
- Two ordinary Rive rectangle ticks with held transform keys.
- One 1 fps animation, used as a 45-pose address space. Images hold between keys.
- No scripts, GPU Canvas, custom components or retained 3D in the file.

The browser maps both camera controls to `row * 9 + column`, then seeks the
unmodified official Rive runtime. Drag left moves the selected camera to the
right, matching the other orbit studies. Keyboard and lattice cells provide the
same selection. The static drawing does not render continuously when idle.

Images are generated from the existing browser transport-bake renderer, whose
finite hourglass volume/receiver reconstruction and glass beauty pass are biased.
This route is an intentionally coarse browser-authored bake study, not a claim
that the native desktop enhanced renderer executes in JavaScript.

Regeneration (local server at port 4185):

1. `node scripts/bake-rivx-camera-lattice.cjs` captures the 45 actual views into
   the private `portfolio-work/rivex-next-showcases/camera-captures/` folder.
2. `python scripts/pack-rivx-camera-lattice.py` writes the ordinary .riv, receipt
   and preview using the existing verified Rive 7 image/mesh/key format.
3. `node scripts/check-rivx-fine-transport-camera.cjs` verifies official playback,
   image changes under both camera axes, no shader/3D module loading, mobile
   layout and byte-identical downloaded .riv.

Ordinary .riv download is supported. There is no retained camera outside this
sampled domain; adding a temporal axis multiplies the number of stored views.
