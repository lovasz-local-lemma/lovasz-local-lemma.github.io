# Animation Assets Folder

This folder should contain your `.riv` animation files for the graph visualizer.

## Required Files

Place these animation files here:

- `node-pulse.riv` - Node pulse/glow animation
- `edge-flow.riv` - Particle flow along edges
- `explosion.riv` - Burst effect for events
- `trail.riv` - Path trail visualization

## Creating Animation Files

See `../ANIMATION_GUIDE.md` for detailed instructions on creating these animations in the animation editor.

## Quick Start

1. Go to [rive.app](https://rive.app)
2. Create animations following RIVE_GUIDE.md
3. Export as `.riv` files
4. Place them in this folder
5. Enable "Enhanced Animations" in the visualizer

## Note

If these files don't exist, the visualizer will automatically use programmatic fallback animations. The app works fine without them!

## File Structure

```
assets/
├── node-pulse.riv      (Pulse animation for node visits)
├── edge-flow.riv       (Particles flowing along edges)
├── explosion.riv       (Burst effect for algorithm events)
└── trail.riv          (Path visualization)
```

Each file should be under 50KB for optimal performance.
