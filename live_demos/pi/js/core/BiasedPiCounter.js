import { Simulation } from './Simulation.js';
import { BiasModel, formatBiasReadout } from './bias-model.js';

// Base for "rough pi with bias" sims.
//   measuredPi() -> pi-FREE estimate (subclass)
//   getBand()    -> {lo, mid, hi} pi-free range, or null (subclass)
//   idealPi()    -> Math.PI, REFERENCE ONLY (true-pi line + delta)
export class BiasedPiCounter extends Simulation {
  static piNature = 'biased';
  static rigor = 'Biased';

  constructor(params = {}) { super(params); this.biasModel = new BiasModel(); }
  reset() { super.reset(); if (this.biasModel) this.biasModel.reset(); }

  idealPi() { return Math.PI; }
  measuredPi() { return NaN; }       // subclass overrides
  getBand() { return null; }          // subclass overrides
  idealKnobValue() { return null; }
  biasSource() { return ''; }

  // Optional per-event sample machinery (π-free) for the intrinsic band.
  localSample() { return NaN; }                    // subclass overrides
  recordBiasSample() { this.biasModel.record(this.localSample()); }

  actualBias() { return this.measuredPi() - this.idealPi(); }
  getPiApproximation() { return this.measuredPi(); }
  getCountLabel() { return 'Rolling odometer'; }
  getPiReadout() {
    const m = this.measuredPi();
    if (!Number.isFinite(m)) return 'n/a';
    return formatBiasReadout({ measuredPi: m, band: this.getBand(), idealPi: this.idealPi() });
  }
}
