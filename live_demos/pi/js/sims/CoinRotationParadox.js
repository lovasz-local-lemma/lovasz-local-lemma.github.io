import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

const TAU = Math.PI * 2;

// The coin-rotation paradox. A small coin (radius r) rolls without slipping
// around the outside of a fixed circle (radius R). Naively you'd expect R/r
// turns (the ratio of circumferences) — but in the lab frame it makes R/r + 1:
// rolling contributes R/r, and going once around the loop adds one more turn.
// This is NOT a π counter: the π in the path length and the coin circumference
// cancel, leaving the pure ratio. It's a rolling-and-counting curiosity.
export class CoinRotationParadox extends Simulation {
  static id = 'coin-rotation-paradox';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Coin Rotation Paradox';
  static description = 'Roll a coin around a circle: it turns R/r + 1 times, not R/r (a curiosity — not a π counter)';
  static piMechanism = 'not π: a rolling-rotation count — the surprising +1 from the path curvature';
  static rigor = 'Curiosity';
  static sortOrder = 200;
  static piNature = 'curiosity';
  static piLabel = 'turns / orbit';
  static explanation = {
    setup: 'A small coin of radius r rolls without slipping around the outside of a fixed circle of radius R. A mark on the coin lets you count its rotations as it travels once around.',
    insight: 'You might guess R/r turns (ratio of circumferences). But in the lab frame the coin makes R/r + 1: the rolling contributes R/r, and going once around the loop adds one extra full turn. For R = r (equal coins) that is 2 turns, not 1 — the classic paradox.',
    contrast: 'This is NOT a way to compute π: the π in the path length (2π(R+r)) and the π in the coin\'s circumference (2πr) cancel, so the turn count is the pure ratio R/r + 1. It lives here as a rolling-and-counting curiosity.',
    formula: 'turns per orbit = (R + r) / r = R/r + 1   (π cancels — no π)',
    getExpected: (params) => {
      const ratio = params.ratio ?? 3;
      return `R/r = ${ratio}: expect ${ratio} + 1 = ${ratio + 1} turns per orbit (the naïve guess R/r = ${ratio} is wrong by exactly 1).`;
    },
  };

  constructor(params = {}) {
    super(params);
    this.ratio = params.ratio ?? 3;    // R / r
    this.R = 0.55;
    this.orbitRate = 0.7;
    this.reset();
  }

  reset() {
    super.reset();
    this.r = this.R / this.ratio;
    this.psi = 0;          // orbit angle of the coin's center
    this.finished = false;
  }

  getControls() {
    return [
      { type: 'slider', id: 'ratio', label: 'Size ratio R/r', min: 1, max: 8, step: 1, default: this.ratio,
        onChange: (v) => { this.ratio = v; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 10, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [{ id: 'turns', label: 'coin turns vs orbits (gains one extra turn per loop)', dimension: 2, primary: true, boundary: 'none',
      axisLabels: { x: 'orbits', y: 'coin turns' } }];
  }

  step(dt) {
    this.psi += this.orbitRate * dt;
    return true;
  }

  get orbits() { return this.psi / TAU; }
  get turns() { return this.psi * (this.ratio + 1) / TAU; }   // (R+r)/r = ratio+1 turns per orbit

  getCountLabel() { return 'Coin turns'; }
  getCollisionCount() { return Math.floor(this.turns); }
  getPiApproximation() { return this.ratio + 1; }
  getPiReadout() {
    return `${(this.ratio + 1).toFixed(2)} turns/orbit  (naïve R/r = ${this.ratio.toFixed(2)})`;
  }
  getFormulaHTML() {
    return `<strong>coin rotation paradox</strong>: rolling R/r = ${this.ratio} gives
      <span class="f-result">${this.ratio} + 1 = ${this.ratio + 1}</span> turns per orbit.
      <span class="f-muted">orbits ${this.orbits.toFixed(2)}, turns ${this.turns.toFixed(2)} — π cancels, so this is not a π counter.</span>`;
  }

  getPhasePoint() {
    const maxOrbits = 5;
    const x = Math.max(-1, Math.min(1, this.orbits / maxOrbits * 2 - 1));
    const y = Math.max(-1, Math.min(1, this.turns / (maxOrbits * (this.ratio + 1)) * 2 - 1));
    return [x, y];
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.4, 1.4, 1.4, -1.4, 0.1, 10);
    this.simCamera.position.z = 1;

    // big fixed circle
    const big = [];
    for (let i = 0; i <= 96; i++) { const a = TAU * i / 96; big.push(new THREE.Vector3(this.R * Math.cos(a), this.R * Math.sin(a), 0)); }
    this.simScene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(big),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })));
    this.simScene.add(new THREE.Mesh(new THREE.CircleGeometry(this.R, 96),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.08 })));

    // orbit path of the coin center
    const Rc = this.R + this.r;
    const orb = [];
    for (let i = 0; i <= 96; i++) { const a = TAU * i / 96; orb.push(new THREE.Vector3(Rc * Math.cos(a), Rc * Math.sin(a), 0)); }
    this.simScene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(orb),
      new THREE.LineBasicMaterial({ color: 0x7c83fd, transparent: true, opacity: 0.3 })));

    // rolling coin: rim + radius line + mark
    this.coin = new THREE.Group();
    this.coin.add(new THREE.Mesh(new THREE.CircleGeometry(this.r, 48),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.22 })));
    this.coin.add(new THREE.Mesh(new THREE.RingGeometry(this.r * 0.92, this.r, 48),
      new THREE.MeshBasicMaterial({ color: 0xf7c948, side: THREE.DoubleSide })));
    this.coin.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(this.r, 0, 0.02)]),
      new THREE.LineBasicMaterial({ color: 0xffffff })));
    const mark = new THREE.Mesh(new THREE.CircleGeometry(this.r * 0.2, 14), new THREE.MeshBasicMaterial({ color: 0xe94560 }));
    mark.position.set(this.r * 0.68, 0, 0.03);
    this.coin.add(mark);
    this.simScene.add(this.coin);

    this._place();
  }

  _place() {
    if (!this.coin) return;
    const Rc = this.R + this.r;
    this.coin.position.set(Rc * Math.cos(this.psi), Rc * Math.sin(this.psi), 0.01);
    this.coin.rotation.z = this.psi * (this.ratio + 1);   // lab-frame rotation = (ratio+1)*psi
  }

  updateSimScene() { this._place(); }
}

registerSim(CoinRotationParadox);
