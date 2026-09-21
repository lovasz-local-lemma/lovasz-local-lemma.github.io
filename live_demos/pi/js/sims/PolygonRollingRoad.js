import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

export class PolygonRollingRoad extends Simulation {
  static id = 'polygon-rolling-road';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Polygon Rolling Road';
  static description = 'Showcase rolling — triangle and square need a shaped road to roll smoothly';
  static piMechanism = 'showcase only: non-circular rolling geometry';
  static rigor = 'Experimental';
  static sortOrder = 129;
  static piNature = 'extension';
  static piLabel = 'Status';
  static explanation = {
    setup: 'A triangle or square rolls along a stylized shaped road. The road hints at the special support curve needed to keep a polygonal roller from bouncing.',
    insight: 'On a flat road, a polygon’s center rises and falls. Smooth rolling is possible only if the support path is shaped to match the polygon’s changing contact geometry.',
    contrast: 'This is intentionally last in the experimental list: it is visually useful, but it is not a π calculator yet. It suggests a future mechanical cam/road family rather than providing a clean count.',
    formula: 'Showcase only: no direct π readout.',
    getExpected: (params) => {
      const sides = params.sides || 3;
      return `${sides}-gon rolling is shown as a shaped-road concept. Watch the contact pivot jump from vertex to vertex.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.sides = params.sides || 3;
    this.reset();
  }

  reset() {
    super.reset();
    this.time = 0;
    this.collisionCount = 0;
    this.finished = false;
  }

  getControls() {
    return [
      {
        type: 'select', id: 'sides', label: 'Roller',
        default: this.sides,
        options: [
          { value: 3, label: 'Triangle' },
          { value: 4, label: 'Square' },
        ],
        onChange: (val) => { this.sides = Number(val); this.reset(); this.initSimScene(); }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 60, step: 0.1, default: 6 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'roll-phase', label: 'roll phase vs center height', dimension: 2, primary: true, axisLabels: { x: 'roll phase', y: 'center height' } }
    ];
  }

  step(dt) {
    this.time += dt;
    const newCount = Math.floor(this.time * this.sides / (Math.PI * 2));
    const changed = newCount > this.collisionCount;
    this.collisionCount = newCount;
    if (changed) this.pendingPhasePoints.push([...this.getPhasePoint()]);
    return changed;
  }

  getCountLabel() {
    return 'Vertex pivots';
  }

  getPiReadout() {
    return 'showcase only';
  }

  getPhasePoint() {
    const phase = (this.time * this.sides / (Math.PI * 2)) % 1;
    const height = 0.55 + 0.18 * Math.cos((phase - 0.5) * Math.PI * 2);
    return [phase * 2 - 1, height * 2 - 1];
  }

  getPhaseExtractor() {
    return (pt) => pt;
  }

  makePolygonPoints(radius) {
    const pts = [];
    const offset = this.sides === 3 ? Math.PI / 2 : Math.PI / 4;
    for (let i = 0; i <= this.sides; i++) {
      const a = offset + (i / this.sides) * Math.PI * 2;
      pts.push(new THREE.Vector3(radius * Math.cos(a), radius * Math.sin(a), 0));
    }
    return pts;
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.1, 3.4, 1.15, -0.25, 0.1, 10);
    this.simCamera.position.z = 1;

    const roadPts = [];
    for (let i = 0; i <= 240; i++) {
      const x = (i / 240) * 3.3;
      const y = 0.06 * Math.sin(x * this.sides * 2.1);
      roadPts.push(new THREE.Vector3(x, y, 0));
    }
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(roadPts),
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.65 })
    ));

    this.poly = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(this.makePolygonPoints(0.22)),
      new THREE.LineBasicMaterial({ color: 0xf7c948 })
    );
    this.simScene.add(this.poly);
    this.pivotDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.02, 12),
      new THREE.MeshBasicMaterial({ color: 0xe94560 })
    );
    this.simScene.add(this.pivotDot);
  }

  updateSimScene() {
    if (!this.poly) return;
    const phase = (this.time * this.sides / (Math.PI * 2)) % 1;
    const x = 0.28 + (this.time * 0.28) % 2.75;
    const y = 0.3 + 0.08 * Math.cos((phase - 0.5) * Math.PI * 2);
    this.poly.position.set(x, y, 0);
    this.poly.rotation.z = -this.time;
    this.pivotDot.position.set(x, Math.max(0, y - 0.24), 0.02);
  }
}

registerSim(PolygonRollingRoad);
