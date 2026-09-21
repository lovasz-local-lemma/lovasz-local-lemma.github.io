import * as THREE from 'three';

export class Simulation {
  static id = '';
  static title = '';
  static description = '';
  static piMechanism = '';
  static rigor = 'Exact';
  static sortOrder = 100;
  static piNature = 'exact';

  constructor(params = {}) {
    this.params = params;
    this.collisionCount = 0;
    this.phaseTrail = [];
    this.rawPhaseTrail = [];
    this.pendingPhasePoints = [];   // filled by step() at collision events
    this.pendingRawPhasePoints = []; // same for raw
    this.maxTrailLength = 5000;
    this.playing = false;
    this.speed = 1;
    this.showTrail = true;
    this.showVectors = false;
    this.showGrid = false;
    this.stepMode = false;
    this._pendingStep = false;
    this.simScene = new THREE.Scene();
    this.phaseScenes = {};
  }

  getControls() { return []; }
  // Sims can call this to ask the framework to rebuild the control panel
  // (e.g., when toggling a mode that changes which controls are relevant).
  notifyControlsChanged() {
    if (this._onControlsChanged) this._onControlsChanged();
  }
  getPhaseSpaceViews() { return []; }
  reset() {
    this.collisionCount = 0;
    this.phaseTrail = [];
    this.rawPhaseTrail = [];
    this.pendingPhasePoints = [];
    this.pendingRawPhasePoints = [];
  }
  step(dt) { return false; }
  getCollisionCount() { return this.collisionCount; }
  getPiApproximation() { return this.collisionCount; }
  getPiNature() { return this.constructor.piNature || 'exact'; }
  getPiLabel() { return this.constructor.piLabel || 'π ≈'; }
  getCountLabel() {
    return this.getPiNature() === 'extension' ? 'Chamber hits' : 'Collisions';
  }
  getPiReadout() {
    const value = this.getPiApproximation();
    return Number.isFinite(value) ? value.toFixed(8) : 'n/a';
  }
  getPhasePoint() { return []; }
  initSimScene() {}
  initPhaseScene(viewId) {}
  updateSimScene() {}
  updatePhaseScene(viewId) {}

  recordRawPhasePoint() {
    if (this.getRawPhasePoint) {
      const pt = this.getRawPhasePoint();
      if (pt.length > 0) {
        this.rawPhaseTrail.push([...pt]);
        if (this.rawPhaseTrail.length > this.maxTrailLength) {
          this.rawPhaseTrail.shift();
        }
      }
    }
  }

  recordPhasePoint() {
    const pt = this.getPhasePoint();
    if (pt.length > 0) {
      this.phaseTrail.push([...pt]);
      if (this.phaseTrail.length > this.maxTrailLength) {
        this.phaseTrail.shift();
      }
    }
  }

  /** Flush collision-time phase points into the trail */
  flushPhasePoints() {
    for (const pt of this.pendingPhasePoints) {
      this.phaseTrail.push(pt);
      if (this.phaseTrail.length > this.maxTrailLength) this.phaseTrail.shift();
    }
    for (const pt of this.pendingRawPhasePoints) {
      this.rawPhaseTrail.push(pt);
      if (this.rawPhaseTrail.length > this.maxTrailLength) this.rawPhaseTrail.shift();
    }
    this.pendingPhasePoints = [];
    this.pendingRawPhasePoints = [];
  }

  requestStep() { this._pendingStep = true; }

  shouldStep() {
    if (!this.stepMode) return this.playing;
    if (this._pendingStep) { this._pendingStep = false; return true; }
    return false;
  }
}
