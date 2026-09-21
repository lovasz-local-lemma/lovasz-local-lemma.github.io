import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

export class GaussCircleLattice extends Simulation {
  static id = 'gauss-circle-lattice';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Gauss Circle Lattice';
  static description = 'Count integer lattice points inside a growing circle — π = N / R²';
  static piMechanism = 'asymptotic count: lattice points inside disk of radius R → πR²';
  static rigor = 'Statistical';
  static sortOrder = 70;
  static piNature = 'statistical';
  static piLabel = 'π ≈';
  static alternatives = [
    { id: 'sphere-volume-mc', label: 'Back: Monte Carlo geometry' },
    { id: 'visible-lattice-trees', label: 'Visible lattice points' },
  ];
  static explanation = {
    setup: 'A disk of radius R is laid over the integer lattice Z². As R grows, the disk sweeps over more lattice points. Each lattice point that enters the disk is a discrete counted event.',
    insight: 'The number N(R) of lattice points (a,b) with a² + b² ≤ R² is approximately the disk area: N(R) ≈ πR². So π ≈ N(R) / R² as R → ∞. The Gauss circle problem bounds the error as O(R^{0.6 …}), so this converges quickly.',
    contrast: 'Unlike Buffon needles, no randomness is involved. The lattice is fixed and the radius grows deterministically. The "count" is genuinely a count of integer pairs, not a probability.',
    formula: 'π ≈ N(R) / R²,  where N(R) = #{(a,b) ∈ Z² : a² + b² ≤ R²}',
    getExpected: (params) => {
      const R = params.R || 8;
      const expected = Math.PI * R * R;
      return `Radius R=${R}. Expect about ${expected.toFixed(1)} lattice points inside the disk; π ≈ count / R² ≈ ${(Math.PI).toFixed(4)}.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.maxR = params.maxR || 18;
    // Growth rate scaled so the disk visibly expands. Sim time advances at
    // ~0.06 per wall-second, so growthRate=50 gives ~3 R/wall-sec, reaching
    // R=18 in ~6 wall seconds.
    this.growthRate = params.growthRate || 50;
    this.reset();
  }

  reset() {
    super.reset();
    // Start at R=2 so the user immediately sees a few lattice points inside.
    this.R = 2.0;
    this.count = 0;
    this.lastCounted = 0;
    this.points = [];
    for (let a = -this.maxR; a <= this.maxR; a++) {
      for (let b = -this.maxR; b <= this.maxR; b++) {
        this.points.push({ a, b, dist: Math.sqrt(a * a + b * b), inside: false });
      }
    }
    this.points.sort((p, q) => p.dist - q.dist);
    // Pre-mark points already inside the initial radius.
    for (const pt of this.points) {
      if (pt.dist <= this.R) {
        pt.inside = true;
        this.count++;
      }
    }
    this.collisionCount = this.count;
    this.finished = false;
  }

  getControls() {
    return [
      { type: 'slider', id: 'maxR', label: 'Lattice extent', min: 6, max: 30, step: 1, default: this.maxR,
        onChange: (val) => { this.maxR = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'growthRate', label: 'Radius growth /s', min: 1, max: 200, step: 1, default: this.growthRate,
        onChange: (val) => { this.growthRate = val; } },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 30, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'count-vs-area', label: 'count vs πR² (line slope = π)', dimension: 2, primary: true,
        axisLabels: { x: 'R² (normalized)', y: 'count (normalized)' } }
    ];
  }

  step(dt) {
    if (this.finished) return false;
    const prevR = this.R;
    this.R += this.growthRate * dt;
    if (this.R > this.maxR) {
      this.R = this.maxR;
      this.finished = true;
    }
    let changed = false;
    for (const pt of this.points) {
      if (!pt.inside && pt.dist <= this.R) {
        pt.inside = true;
        this.count++;
        this.collisionCount = this.count;
        changed = true;
        this.pendingPhasePoints.push([...this.getPhasePoint()]);
      }
    }
    return changed;
  }

  getCountLabel() {
    return 'Lattice points inside';
  }

  getPiApproximation() {
    return this.R > 0 ? this.count / (this.R * this.R) : 0;
  }

  getPiReadout() {
    return this.R > 0 ? this.getPiApproximation().toFixed(6) : 'n/a';
  }

  getFormulaHTML() {
    const value = this.getPiApproximation().toFixed(6);
    return `
      <strong>Gauss circle</strong>:
      <span class="f-angle">N(R) ≈ πR²</span><br>
      <span class="f-result">π</span> ≈
      <span class="f-count">${this.count}</span> /
      <span class="f-angle">${(this.R * this.R).toFixed(3)}</span> =
      <span class="f-result">${value}</span>
      <span class="f-muted">(R = ${this.R.toFixed(3)})</span>
    `;
  }

  getPhasePoint() {
    const norm = this.maxR * this.maxR;
    const x = (this.R * this.R) / norm;
    const yScale = Math.PI * norm;
    return [x * 2 - 1, (this.count / yScale) * 2 - 1];
  }

  getPhaseExtractor() { return (pt) => pt; }

  initSimScene() {
    this.simScene.clear();
    const half = this.maxR + 1;
    this.simCamera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 10);
    this.simCamera.position.z = 1;

    // Faint axes
    const axisGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, 0, 0), new THREE.Vector3(half, 0, 0),
      new THREE.Vector3(0, -half, 0), new THREE.Vector3(0, half, 0),
    ]);
    this.simScene.add(new THREE.LineSegments(
      axisGeom,
      new THREE.LineBasicMaterial({ color: 0x2a2a4a, transparent: true, opacity: 0.55 })
    ));

    const insidePos = new Float32Array(this.points.length * 3);
    const outsidePos = new Float32Array(this.points.length * 3);
    this.insideGeom = new THREE.BufferGeometry();
    this.insideGeom.setAttribute('position', new THREE.BufferAttribute(insidePos, 3));
    this.insideGeom.setDrawRange(0, 0);
    this.insidePts = new THREE.Points(
      this.insideGeom,
      new THREE.PointsMaterial({ color: 0xf7c948, size: 0.36 })
    );
    this.simScene.add(this.insidePts);

    this.outsideGeom = new THREE.BufferGeometry();
    this.outsideGeom.setAttribute('position', new THREE.BufferAttribute(outsidePos, 3));
    this.outsideGeom.setDrawRange(0, 0);
    this.outsidePts = new THREE.Points(
      this.outsideGeom,
      new THREE.PointsMaterial({ color: 0x4cc9f0, size: 0.22, transparent: true, opacity: 0.5 })
    );
    this.simScene.add(this.outsidePts);

    // Circle ring for current R
    const ringGeom = new THREE.RingGeometry(0.99, 1.0, 96);
    this.circleRing = new THREE.Mesh(
      ringGeom,
      new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    this.simScene.add(this.circleRing);
  }

  updateSimScene() {
    if (!this.insideGeom) return;
    const inPos = this.insideGeom.attributes.position.array;
    const outPos = this.outsideGeom.attributes.position.array;
    let inIdx = 0;
    let outIdx = 0;
    for (const pt of this.points) {
      if (pt.inside) {
        inPos[inIdx * 3] = pt.a;
        inPos[inIdx * 3 + 1] = pt.b;
        inPos[inIdx * 3 + 2] = 0;
        inIdx++;
      } else {
        outPos[outIdx * 3] = pt.a;
        outPos[outIdx * 3 + 1] = pt.b;
        outPos[outIdx * 3 + 2] = 0;
        outIdx++;
      }
    }
    this.insideGeom.attributes.position.needsUpdate = true;
    this.outsideGeom.attributes.position.needsUpdate = true;
    this.insideGeom.setDrawRange(0, inIdx);
    this.outsideGeom.setDrawRange(0, outIdx);

    const r = Math.max(1e-3, this.R);
    this.circleRing.scale.set(r, r, 1);
  }
}

registerSim(GaussCircleLattice);
