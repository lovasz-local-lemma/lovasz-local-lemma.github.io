export const DEFAULT_QUALITY = 'rich';
export const DEFAULT_VOXEL_GRID = 28;
export const QUALITY = {
  smooth: { label: 'Smooth', width: 224, steps: 16, cloth: 25, threads: 8,
    detail: 'Adaptive 160–256 px · 16 volume samples · 25² canopy · full 48³ fluid. Prioritizes motion.' },
  balanced: { label: 'Balanced', width: 320, steps: 24, cloth: 33, threads: 12,
    detail: '320 × 240 · 24 volume samples · 33² canopy · full 48³ fluid. More folds and image detail.' },
  rich: { label: 'Rich', width: 448, steps: 32, cloth: 45, threads: 16,
    detail: '448 × 336 · 32 volume samples · 45² canopy. Original detail, fixed resolution; the default.' },
  splats: { label: 'Voxel motion', width: 448, steps: 32, cloth: 45, threads: 16, splats: DEFAULT_VOXEL_GRID,
    detail: '448 × 336 · 28³ voxel supports · 45² canopy. A finer world-space plume, with the same 48³ fluid.' },
};

// Advisory only: no automatic preset change. A window rejects startup/frame
// spikes; sustained recovery clears the hint. A dismissal buys a full minute.
export function createQualityAdvisory() {
  let samples = [], firstTime = null, visible = false, mutedUntil = 0;
  return {
    reset() { samples = []; firstTime = null; visible = false; },
    dismiss(now) { mutedUntil = now + 60000; samples = []; firstTime = null; visible = false; },
    update(ms, now, active = true) {
      if (!active || !Number.isFinite(ms) || ms <= 0) {
        samples = []; firstTime = null; visible = false; return false;
      }
      if (firstTime === null) firstTime = now;
      samples.push(ms); if (samples.length > 32) samples.shift();
      if (samples.length < 24 || now - firstTime < 8000 || now < mutedUntil) return visible;
      const sorted = [...samples].sort((a,b) => a-b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (median > 110) visible = true;
      else if (median < 80) visible = false;
      return visible;
    },
  };
}
// Slow hysteresis avoids alternating sizes or chasing individual frame spikes.
// Only the image dimensions adapt: no gravity, timestep, solver or cloth changes.
export function nextAdaptiveWidth(width, samples) {
  if (samples.length < 24) return width;
  const sorted = [...samples].sort((a,b) => a-b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (median > 42 && width > 160) return Math.max(160, width - 32);
  if (median < 23 && width < 256) return Math.min(256, width + 32);
  return width;
}
