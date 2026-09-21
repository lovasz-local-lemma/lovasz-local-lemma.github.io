// THREE-free sample bookkeeping. Samples are pi-free (widths). idealPi is used
// ONLY to display the signed distance from true pi.
export class BiasModel {
  constructor() { this.reset(); }
  reset() { this.min = Infinity; this.max = -Infinity; this.sum = 0; this.n = 0; }
  record(s) { if (!Number.isFinite(s)) return; if (s < this.min) this.min = s; if (s > this.max) this.max = s; this.sum += s; this.n += 1; }
  stats() { return this.n ? { min: this.min, max: this.max, mean: this.sum / this.n } : null; }
}

export function formatBiasReadout({ measuredPi, band, idealPi }) {
  if (!Number.isFinite(measuredPi)) return 'n/a';
  const d = measuredPi - idealPi;
  const dStr = `Δ=${d >= 0 ? '+' : ''}${d.toFixed(4)}`;
  const bStr = band ? ` · band [${band.lo.toFixed(3)}, ${band.hi.toFixed(3)}]` : '';
  return `${measuredPi.toFixed(4)}${bStr} · ${dStr}`;
}
