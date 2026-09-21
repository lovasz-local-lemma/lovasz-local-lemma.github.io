import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a;
}

export class VisibleLatticeTrees extends Simulation {
  static id = 'visible-lattice-trees';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Visible Lattice Trees';
  static description = 'Coprime visibility from the origin — density 6/π² gives π';
  static piMechanism = 'number-theoretic count: gcd(a,b)=1 fraction → 6/π²';
  static rigor = 'Statistical';
  static sortOrder = 71;
  static piNature = 'statistical';
  static piLabel = 'π ≈';
  static alternatives = [
    { id: 'square-free-sieve', label: 'Same density, square-free version' },
    { id: 'sphere-volume-mc', label: 'Back: Monte Carlo geometry' },
    { id: 'circle-coverage', label: 'Circle coverage (2D)' },
  ];
  static explanation = {
    setup: 'Imagine standing at the origin in a forest of trees planted at every integer lattice point (a,b). A tree (a,b) is visible iff no other tree blocks the line of sight, which is equivalent to gcd(|a|,|b|) = 1.',
    insight: 'The fraction of lattice points (a,b) ∈ [1..N]² with gcd(a,b) = 1 tends to 1/ζ(2) = 6/π² as N → ∞. So counting visible trees and total trees gives π = √(6 · total / visible).',
    contrast: 'No randomness, no physics: just a sieve over a finite lattice. Each new lattice point checked is a discrete event. The convergence is power-law fast, with O(log N / N) error.',
    formula: 'visible / total → 6/π²,  so π ≈ √(6 · total / visible)',
    getExpected: (params) => {
      const N = params.N || 40;
      const expected = Math.sqrt(6 / (6 / (Math.PI * Math.PI)));
      return `Lattice extent N=${N} (so ${N*N} candidate trees in the upper-right quadrant). The visible fraction approaches 6/π² ≈ ${(6/(Math.PI*Math.PI)).toFixed(4)}, giving π ≈ ${expected.toFixed(4)}.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.N = params.N || 40;
    this.batch = params.batch || 6;
    this.reset();
  }

  reset() {
    super.reset();
    this.candidates = [];
    for (let a = 1; a <= this.N; a++) {
      for (let b = 1; b <= this.N; b++) {
        this.candidates.push({ a, b, visible: false, checked: false });
      }
    }
    // Shuffle so the visualization fills evenly rather than scanning rows
    for (let i = this.candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.candidates[i], this.candidates[j]] = [this.candidates[j], this.candidates[i]];
    }
    this.cursor = 0;
    this.totalChecked = 0;
    this.visibleCount = 0;
    this.collisionCount = 0;
    this.lastPhasePoint = [0, 0];
    this.finished = false;
  }

  getControls() {
    return [
      { type: 'slider', id: 'N', label: 'Lattice extent N', min: 20, max: 80, step: 5, default: this.N,
        onChange: (val) => { this.N = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'batch', label: 'Trees / tick', min: 1, max: 60, step: 1, default: this.batch,
        onChange: (val) => { this.batch = val; } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 60, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'a-b', label: 'lattice point (a,b)', dimension: 2, primary: true,
        axisLabels: { x: 'a', y: 'b' } }
    ];
  }

  step() {
    if (this.finished) return false;
    const k = Math.max(1, Math.round(this.batch));
    let changed = false;
    for (let i = 0; i < k; i++) {
      if (this.cursor >= this.candidates.length) {
        this.finished = true;
        break;
      }
      const c = this.candidates[this.cursor++];
      c.checked = true;
      c.visible = (gcd(c.a, c.b) === 1);
      this.totalChecked++;
      if (c.visible) this.visibleCount++;
      this.collisionCount = this.visibleCount;
      this.lastPhasePoint = [
        (c.a / this.N) * 2 - 1,
        (c.b / this.N) * 2 - 1
      ];
      this.pendingPhasePoints.push([...this.lastPhasePoint]);
      changed = true;
    }
    return changed;
  }

  getCollisionCount() {
    return `${this.visibleCount}/${this.totalChecked}`;
  }

  getCountLabel() {
    return 'Visible / checked';
  }

  getPiApproximation() {
    return this.visibleCount > 0 ? Math.sqrt(6 * this.totalChecked / this.visibleCount) : 0;
  }

  getPiReadout() {
    return this.visibleCount > 0 ? this.getPiApproximation().toFixed(8) : 'n/a';
  }

  getFormulaHTML() {
    const value = this.visibleCount > 0 ? this.getPiApproximation().toFixed(6) : 'n/a';
    return `
      <strong>visible-fraction sieve</strong>:
      <span class="f-angle">visible / total → 6/π²</span><br>
      <span class="f-result">π</span> ≈
      √(6 · <span class="f-count">${this.totalChecked}</span> /
      <span class="f-count">${this.visibleCount}</span>) =
      <span class="f-result">${value}</span>
    `;
  }

  getPhasePoint() {
    return [...this.lastPhasePoint];
  }

  getPhaseExtractor() { return (pt) => pt; }

  initSimScene() {
    this.simScene.clear();
    const margin = 2;
    this.simCamera = new THREE.OrthographicCamera(-margin, this.N + margin, this.N + margin, -margin, 0.1, 10);
    this.simCamera.position.z = 1;

    // Origin marker
    const originGeom = new THREE.CircleGeometry(0.6, 24);
    this.simScene.add(new THREE.Mesh(
      originGeom,
      new THREE.MeshBasicMaterial({ color: 0xe94560 })
    ));

    // Faint grid box
    const gridPts = [
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(this.N, 0, 0),
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, this.N, 0),
    ];
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(gridPts),
      new THREE.LineBasicMaterial({ color: 0x2a2a4a, transparent: true, opacity: 0.6 })
    ));

    const max = this.candidates.length;
    this.visGeom = new THREE.BufferGeometry();
    this.visGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    this.visGeom.setDrawRange(0, 0);
    this.visPts = new THREE.Points(
      this.visGeom,
      new THREE.PointsMaterial({ color: 0xf7c948, size: 0.55 })
    );
    this.simScene.add(this.visPts);

    this.hidGeom = new THREE.BufferGeometry();
    this.hidGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    this.hidGeom.setDrawRange(0, 0);
    this.hidPts = new THREE.Points(
      this.hidGeom,
      new THREE.PointsMaterial({ color: 0x4cc9f0, size: 0.32, transparent: true, opacity: 0.55 })
    );
    this.simScene.add(this.hidPts);
  }

  updateSimScene() {
    if (!this.visGeom) return;
    const visArr = this.visGeom.attributes.position.array;
    const hidArr = this.hidGeom.attributes.position.array;
    let vi = 0, hi = 0;
    for (const c of this.candidates) {
      if (!c.checked) continue;
      const arr = c.visible ? visArr : hidArr;
      const idx = c.visible ? vi : hi;
      arr[idx * 3] = c.a;
      arr[idx * 3 + 1] = c.b;
      arr[idx * 3 + 2] = 0;
      if (c.visible) vi++; else hi++;
    }
    this.visGeom.attributes.position.needsUpdate = true;
    this.hidGeom.attributes.position.needsUpdate = true;
    this.visGeom.setDrawRange(0, vi);
    this.hidGeom.setDrawRange(0, hi);
  }
}

registerSim(VisibleLatticeTrees);
