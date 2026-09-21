import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// Same rescale as GaltonBoardPi: main.js advances 1e-4 sim-seconds per step(),
// so one board-second is roughly one wall second at speed 1 / 60 fps.
const TIME_SCALE = 16.7;
const TURBO_RATE = 1000;    // invisible statistical trials per board-second
const KMIN = 2, KMAX = 10;

const CUP_X = -0.72;
const CUP_W = 0.46;
const CUP_BOT = -0.66;
const FILL_H = 1.26;        // scene height of fill level 1.0 (the rim)
const RIM = CUP_BOT + FILL_H;
const LEVEL_CLAMP = 1.04;   // draw the body at most this far up (a little overshoot)

const HIST_X0 = -0.12;
const HIST_DX = 0.135;
const BAR_FLOOR = -0.66;
const BAR_MAX_H = 1.05;

// --- visible-cup animation (cosmetic; trial logic never reads any of this) ---
// One representative trial animates pour-by-pour at a calm, watchable pace; all
// other demanded trials + turbo run invisibly straight into the statistics.
const T_DROP = 0.62;        // board-s: droplet falls from the spout to the surface (slow, liquid)
const T_RISE = 0.32;        // board-s: droplet merges and the new band rises
const T_HOLD = 0.18;        // board-s: pause so each pour is countable
const T_SPILL = 0.66;       // board-s: overflow crests, sheets down the sides
const T_DRAIN = 0.62;       // board-s: cup empties for the next trial
const T_IDLE = 0.3;         // board-s: empty-cup beat between trials

const M = 26;               // surface samples across the cup width
const SURF_X0 = CUP_X - CUP_W / 2 + 0.02;
const SURF_X1 = CUP_X + CUP_W / 2 - 0.02;
const AMP = 0.04;           // max surface wobble (scene units)
const MENISCUS = 0.06;      // thickness of the wavy top skin
const DROP_R = 0.052;
const MAX_BANDS = 14;       // P(K>14) ~ 1e-11 — pool never overflows
const SPILL_MAX = 30;

// Distinct per-pour colours so a trial's pours are easy to count.
const PALETTE = [0x77dfbd, 0xe5bf78, 0x70b6bd, 0xeee1ba, 0x9eac84, 0xd79876, 0x60ad98, 0xb2c7cf];

// --- standard-simplex inset (pure display; top-right of the scene) ---
// Shows WHERE the 1/k! comes from: P(K>k) = P(ΣU < 1) = vol(standard k-simplex).
// A vertical stack — unit segment (1), triangle U₁+U₂<1 (½), tetra U₁+U₂+U₃<1 (⅙)
// — lights up shape k as the trial's k-th pour lands.
const INS_X0 = 0.54, INS_X1 = 1.12, INS_Y0 = 0.04, INS_Y1 = 0.92;
const INS_SHAPE_X = 0.70;              // shape anchor x
const INS_LABEL_X = 0.985;             // label anchor x
const INS_D = 0.15;                    // shape size (scene units)
const INS_CY = [0.68, 0.42, 0.16];     // centres: segment, triangle, tetra
const INS_BRIGHT = 0x77dfbd, INS_MED = 0xa9b6af, INS_DIM = 0x3a4a43;
// Oblique projection of the 3-simplex vertices for the tetra sketch.
const INS_TZ_X = 0.42, INS_TZ_Y = 0.30;

const easeIn = (p) => p * p;
const easeOut = (p) => 1 - (1 - p) * (1 - p);

export class UniformSumE extends Simulation {
  static id = 'uniform-sum-e';
  static title = 'Sum to One — e from random pours';
  static description = 'Pour random amounts until the cup overflows; the average pour count is exactly e';
  static piMechanism = 'statistical: E[draws until ΣU(0,1) > 1] = e — first non-π constant';
  static rigor = 'Statistical';
  static sortOrder = 200;
  static piNature = 'statistical';
  static piLabel = 'e ≈';
  static previewSteps = 200;
  static alternatives = [{ id: 'derangement-e', label: 'e from shuffles that fix nothing' }];
  static explanation = {
    setup: 'One cup holds exactly 1 unit. Add independent random pours, each between 0 and 1, and stop as soon as the total exceeds 1. Count every pour, including the last one. The coloured layers show the amounts in one slow demonstration; the histogram also includes the faster trials running alongside it. Droplets are illustrative; layer heights show the sampled amounts.',
    insight: 'K exceeds k exactly when the first k pours still fit: P(K > k) = P(U₁ + … + U_k < 1) = 1/k!, the volume of the standard simplex — that is where the factorials come from. Summing the tail, E[K] = Σ P(K > k) = Σ 1/k! = e.',
    contrast: 'Try counting a few cups: most overflow after two or three pours, while an occasional cup takes longer. No individual cup has to give 2.71828 pours. That number emerges as the average across many independent cups. The faint line on the histogram is the exact distribution; the bars are the measurements.',
    formula: 'e ≈ total pours / total trials,   P(K=k) = (k−1)/k!',
    getExpected: () => 'E[K] = e = 2.71828… exactly — the estimator is unbiased at every sample size. The only enemy is Monte-Carlo noise, shrinking like 1/√N (σ(K) ≈ 0.87): about ±0.0009 after a million trials.'
  };

  constructor(params = {}) {
    super(params);
    this.trialRate = params.trialRate || 30;
    this.turbo = false;
    // P(K=k) = (k-1)/k! envelope for the histogram overlay.
    this.kProb = new Array(KMAX + 1).fill(0);
    let fact = 1;
    for (let k = 1; k <= KMAX; k++) {
      fact *= k;
      if (k >= KMIN) this.kProb[k] = (k - 1) / fact;
    }
    // Surface wave (deviation from the flat level) + velocity.
    this.s = new Float32Array(M);
    this.sv = new Float32Array(M);
    // Spill-droplet pool (overflow cascade) — preallocated, no per-frame alloc.
    this.spX = new Float32Array(SPILL_MAX);
    this.spY = new Float32Array(SPILL_MAX);
    this.spVX = new Float32Array(SPILL_MAX);
    this.spVY = new Float32Array(SPILL_MAX);
    this.spLife = new Float32Array(SPILL_MAX);
    this._mtx = new THREE.Matrix4();
    this._col = new THREE.Color();
    this.reset();
  }

  reset() {
    super.reset();
    this.totalTrials = 0;
    this.totalDraws = 0;
    this.kCounts = new Array(32).fill(0);
    this.trialCarry = 0;
    this.turboCarry = 0;
    this.nextMilestone = 1;
    this.collisionCount = 0;
    this.collisionEffects = [];

    // Visible cup state.
    this.pours = [];           // pour amounts this trial
    this.pourCols = [];        // hex colour per pour
    this.pourSum = 0;
    this.risenCount = 0;       // pours that have finished rising
    this.risenLevel = 0;       // fill fraction from risen pours
    this.level = 0;            // displayed fill fraction
    this.cupPhase = 'idle';
    this.phaseT = 0;
    this.impactX = CUP_X;
    this.isBust = false;
    this.spCount = 0;
    this.s.fill(0); this.sv.fill(0);
    this.impactAge = 10;
    this._demoSet = false;
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'trialRate', label: 'Trials/s (statistics)',
        min: 1, max: 200, step: 1, default: this.trialRate,
        onChange: (val) => { this.trialRate = val; }
      },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×1000 (statistics only)', default: this.turbo },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'convergence', label: 'log trials vs estimate error', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'log10 trials', y: '(ê − e)/e' }
      }
    ];
  }

  step(dt) {
    const t = dt * TIME_SCALE;
    let recorded = false;

    // Coarse dt (the hub thumbnail drives step(0.04)) -> freeze a pretty demo
    // cup and just pour invisible trials into the histogram.
    if (dt >= 0.02) { this._setupDemo(); }
    else {
      if (this._advanceCup(t)) recorded = true;
      this._stepWave(t);
      this.impactAge += t;
      for (let i = 0; i < this.spCount; i++) {
        if (this.spLife[i] <= 0) continue;
        this.spVY[i] -= 5.5 * t;
        this.spX[i] += this.spVX[i] * t;
        this.spY[i] += this.spVY[i] * t;
        if (this.spY[i] < CUP_BOT - 0.5) this.spLife[i] = 0;
      }
    }

    // Invisible statistics throughput: trialRate/s + optional turbo.
    this.trialCarry += this.trialRate * t;
    let n = Math.floor(this.trialCarry); this.trialCarry -= n;
    if (n > 0) recorded = true;
    for (; n > 0; n--) this._sampleInvisibleTrial();
    if (this.turbo) {
      this.turboCarry += TURBO_RATE * t;
      let m = Math.floor(this.turboCarry); this.turboCarry -= m;
      if (m > 0) recorded = true;
      for (; m > 0; m--) this._sampleInvisibleTrial();
    }

    this.collisionCount = this.totalTrials;
    if (this.totalTrials >= this.nextMilestone) {
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      this.nextMilestone = Math.max(this.totalTrials + 1, Math.ceil(this.totalTrials * 1.02));
    }
    return recorded;
  }

  // Cup state machine. Returns true on a recorded (busted) trial.
  _advanceCup(t) {
    this.phaseT += t;
    let recorded = false;
    switch (this.cupPhase) {
      case 'idle':
        if (this.phaseT >= T_IDLE) this._startTrial();
        break;
      case 'drop':
        if (this.phaseT >= T_DROP) this._beginRise();
        break;
      case 'rise':
        if (this.phaseT >= T_RISE) {
          this.risenLevel += this.pours[this.risenCount];
          this.risenCount++;
          if (this.isBust) {
            this._record(this.pours.length);
            recorded = true;
            this._beginSpill();
          } else {
            this.cupPhase = 'hold'; this.phaseT = 0;
          }
        }
        break;
      case 'hold':
        if (this.phaseT >= T_HOLD) this._beginPour();
        break;
      case 'spill':
        if (this.phaseT >= T_SPILL) { this.cupPhase = 'drain'; this.phaseT = 0; }
        break;
      case 'drain':
        if (this.phaseT >= T_DRAIN) {
          this.cupPhase = 'idle'; this.phaseT = 0;
          this.risenLevel = this.level = this.risenCount = 0;
          this.pours.length = this.pourCols.length = 0;
        }
        break;
    }
    return recorded;
  }

  _startTrial() {
    this.pours.length = 0;
    this.pourCols.length = 0;
    this.pourSum = 0;
    this.risenCount = 0;
    this.risenLevel = 0;
    this.level = 0;
    this.s.fill(0); this.sv.fill(0);
    this.impactAge = 10;
    this.spCount = 0;
    this._beginPour();
  }

  _beginPour() {
    const u = Math.random();
    this.pours.push(u);
    this.pourCols.push(PALETTE[(this.pours.length - 1) % PALETTE.length]);
    this.pourSum += u;
    this.isBust = this.pourSum > 1;
    this.impactX = CUP_X + (Math.random() - 0.5) * CUP_W * 0.5;
    this.cupPhase = 'drop';
    this.phaseT = 0;
  }

  _beginRise() {
    this.cupPhase = 'rise';
    this.phaseT = 0;
    this.impactAge = 0;
    this.impactY = CUP_BOT + this.risenLevel * FILL_H;
    // Splash: kick the surface down at the impact column.
    const col = Math.max(0, Math.min(M - 1, Math.round((this.impactX - SURF_X0) / (SURF_X1 - SURF_X0) * (M - 1))));
    this.sv[col] -= 6;
    if (col > 0) this.sv[col - 1] -= 3;
    if (col < M - 1) this.sv[col + 1] -= 3;
    // A countable "plop" (drives the collision sound) at the surface.
    this.collisionEffects.push({ x: this.impactX, y: CUP_BOT + this.risenLevel * FILL_H, time: performance.now(), type: 'block' });
  }

  _beginSpill() {
    this.cupPhase = 'spill';
    this.phaseT = 0;
    // A crown of droplets bursts up-and-out over the rim; alternating sides feed
    // the two sheets running down the cup walls (pooled, no per-frame alloc).
    const nSpill = 28;
    this.spCount = Math.min(SPILL_MAX, nSpill);
    const hw = CUP_W / 2;
    for (let i = 0; i < this.spCount; i++) {
      const left = i % 2 === 0;
      // fan the crown from near the rim edge outward
      const spread = (i / this.spCount);
      this.spX[i] = CUP_X + (left ? -1 : 1) * (hw - 0.02) + (Math.random() - 0.5) * 0.04;
      this.spY[i] = RIM + 0.01 + Math.random() * 0.03;
      this.spVX[i] = (left ? -1 : 1) * (0.08 + spread * 0.12 + Math.random() * 0.1);
      this.spVY[i] = 0.45 + Math.random() * 0.6;   // a compact crown around the rim
      this.spLife[i] = 1;
    }
    this.collisionEffects.push({ x: CUP_X, y: RIM, time: performance.now(), type: 'wall' });
  }

  _record(k) {
    this.totalTrials++;
    this.totalDraws += k;
    this.kCounts[Math.min(k, this.kCounts.length - 1)]++;
  }

  _sampleInvisibleTrial() {
    let sum = 0, k = 0;
    do { sum += Math.random(); k++; } while (sum <= 1);
    this._record(k);
  }

  // A fixed, pretty cup state for the hub thumbnail (3 bands + a falling drop).
  _setupDemo() {
    if (this._demoSet) return;
    this._demoSet = true;
    this.pours = [0.3, 0.32, 0.23];
    this.pourCols = [PALETTE[0], PALETTE[1], PALETTE[2]];
    this.risenCount = 3;
    this.risenLevel = 0.85;
    this.level = 0.85;
    this.pourSum = 0.85 + 0.3;
    this.pours.push(0.3);
    this.pourCols.push(PALETTE[3]);
    this.impactX = CUP_X + 0.04;
    this.cupPhase = 'drop';
    this.phaseT = T_DROP * 0.55;
    this.isBust = false;
  }

  getCountLabel() { return 'Trials'; }

  getPiApproximation() {
    return this.totalTrials > 0 ? this.totalDraws / this.totalTrials : 0;
  }

  getPiReadout() {
    return this.totalTrials > 0 ? this.getPiApproximation().toFixed(6) : 'collecting…';
  }

  getFormulaHTML() {
    const live = this.totalTrials > 0
      ? piDigitsHTML(this.getPiApproximation(), 4, Math.E) : 'collecting…';
    return `<div style="width:100%;text-align:left">
      <strong>Count pours. Average cups.</strong><br>
      <span class="f-result">ê</span> =
      <span class="f-count">${this.totalDraws}</span> pours /
      <span class="f-count">${this.totalTrials}</span> cups = <span style="font-size:1.1em">${live}</span>
      <br><span class="f-angle">P(K &gt; k) = 1/k! ⇒ E[K] = Σ 1/k! = e</span>
      <br><span class="f-muted">The slow cup shows one trial; the histogram includes them all.</span>
    </div>`;
  }

  getPhasePoint() {
    const eHat = this.getPiApproximation();
    const x = Math.min(1, Math.max(-1, Math.log10(Math.max(this.totalTrials, 1)) / 6 * 2 - 1));
    const y = Math.min(1, Math.max(-1, (eHat - Math.E) / Math.E * 8));
    return [x, y];
  }

  getPhaseExtractor() { return (pt) => pt; }

  getPreviewBox() {
    return { x0: -1.06, x1: 1.1, y0: -0.78, y1: 0.86 };
  }

  _cupOutlinePoints() {
    const hw = CUP_W / 2, r = 0.05, bot = CUP_BOT, rim = RIM;
    const pts = [
      new THREE.Vector3(CUP_X - hw - 0.045, rim, 0),
      new THREE.Vector3(CUP_X - hw, rim, 0),
      new THREE.Vector3(CUP_X - hw, bot + r, 0),
    ];
    for (let i = 1; i <= 6; i++) {
      const a = Math.PI + (i / 6) * Math.PI / 2;
      pts.push(new THREE.Vector3(CUP_X - hw + r + r * Math.cos(a), bot + r + r * Math.sin(a), 0));
    }
    for (let i = 0; i <= 6; i++) {
      const a = 1.5 * Math.PI + (i / 6) * Math.PI / 2;
      pts.push(new THREE.Vector3(CUP_X + hw - r + r * Math.cos(a), bot + r + r * Math.sin(a), 0));
    }
    pts.push(new THREE.Vector3(CUP_X + hw, rim, 0));
    pts.push(new THREE.Vector3(CUP_X + hw + 0.045, rim, 0));
    return pts;
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.15, 1.15, 0.95, -0.95, 0.1, 10);
    this.simCamera.position.z = 1;

    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(this._cupOutlinePoints()),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
    ));

    // A quiet glass backplate and edge reflections give the liquid a vessel.
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(CUP_W, FILL_H),
      new THREE.MeshBasicMaterial({ color: 0xb3ddd0, transparent: true, opacity: 0.045, depthWrite: false }));
    glass.position.set(CUP_X, CUP_BOT + FILL_H / 2, -0.02);
    this.simScene.add(glass);
    for (const side of [-1, 1]) {
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.009, FILL_H - 0.12),
        new THREE.MeshBasicMaterial({ color: 0xe8f4e9, transparent: true, opacity: side < 0 ? 0.25 : 0.11 }));
      edge.position.set(CUP_X + side * (CUP_W / 2 - 0.008), CUP_BOT + FILL_H / 2, 0.035);
      this.simScene.add(edge);
    }
    const marks = [];
    for (let i = 1; i <= 4; i++) {
      const y = CUP_BOT + FILL_H * i / 4;
      marks.push(new THREE.Vector3(CUP_X - CUP_W / 2 - 0.036, y, 0.04),
        new THREE.Vector3(CUP_X - CUP_W / 2 - 0.01, y, 0.04));
    }
    this.simScene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(marks),
      new THREE.LineBasicMaterial({ color: 0xe5bf78, transparent: true, opacity: 0.5 })));
    this._insLabel('1', CUP_X - CUP_W / 2 - 0.07, RIM);
    const cupCaption = this._insLabel('a random pour', CUP_X, RIM + 0.31);
    cupCaption.scale.set(0.44, 0.063, 1);

    // Per-pour colour bands (pooled flat rectangles, each its own material).
    this.bandMeshes = [];
    const bandGeom = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < MAX_BANDS; i++) {
      const m = new THREE.Mesh(bandGeom, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6 }));
      m.position.z = 0.01; m.visible = false;
      this.simScene.add(m);
      this.bandMeshes.push(m);
    }

    // Wavy top "skin": a meniscus strip (top edge follows the surface wave) +
    // a bright highlight line right on the surface.
    const menPos = new Float32Array(2 * M * 3);
    const menIdx = [];
    for (let i = 0; i < M - 1; i++) {
      const a = 2 * i, b = 2 * i + 1, c = 2 * i + 2, d = 2 * i + 3;
      menIdx.push(a, b, c, c, b, d);
    }
    this.menGeom = new THREE.BufferGeometry();
    this.menGeom.setAttribute('position', new THREE.BufferAttribute(menPos, 3));
    this.menGeom.setIndex(menIdx);
    this.meniscus = new THREE.Mesh(this.menGeom, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6 }));
    this.meniscus.position.z = 0.02; this.meniscus.visible = false;
    this.simScene.add(this.meniscus);

    this.skinGeom = new THREE.BufferGeometry();
    this.skinGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M * 3), 3));
    this.skinLine = new THREE.Line(this.skinGeom, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    this.skinLine.position.z = 0.03; this.skinLine.visible = false;
    this.simScene.add(this.skinLine);

    // Falling droplet: a soft halo + a slightly translucent liquid blob, a bright
    // specular highlight, plus a merge "neck". Higher-segment circles read rounder.
    this.dropHalo = new THREE.Mesh(new THREE.CircleGeometry(DROP_R * 1.8, 28),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.24 }));
    const droplet = new THREE.Shape();
    droplet.moveTo(0, DROP_R * 1.5);
    droplet.bezierCurveTo(-DROP_R * 0.18, DROP_R * 0.62, -DROP_R, DROP_R * 0.12, -DROP_R, -DROP_R * 0.2);
    droplet.bezierCurveTo(-DROP_R, -DROP_R * 1.2, DROP_R, -DROP_R * 1.2, DROP_R, -DROP_R * 0.2);
    droplet.bezierCurveTo(DROP_R, DROP_R * 0.12, DROP_R * 0.18, DROP_R * 0.62, 0, DROP_R * 1.5);
    this.dropMesh = new THREE.Mesh(new THREE.ShapeGeometry(droplet, 20),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.88 }));
    this.dropHi = new THREE.Mesh(new THREE.CircleGeometry(DROP_R * 0.34, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    this.dropNeck = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7 }));
    for (const d of [this.dropHalo, this.dropMesh, this.dropHi, this.dropNeck]) { d.position.z = 0.04; d.visible = false; this.simScene.add(d); }

    this.impactRings = [];
    const rippleGeom = new THREE.RingGeometry(0.93, 1, 40);
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(rippleGeom,
        new THREE.MeshBasicMaterial({ color: 0xe4f8ed, transparent: true, opacity: 0, depthWrite: false }));
      ring.visible = false;
      this.simScene.add(ring);
      this.impactRings.push(ring);
    }
    this.impactSpray = new THREE.InstancedMesh(new THREE.CircleGeometry(0.008, 10),
      new THREE.MeshBasicMaterial({ color: 0xcaf1df, transparent: true, opacity: 0.8 }), 8);
    this.impactSpray.frustumCulled = false;
    this.impactSpray.visible = false;
    this.simScene.add(this.impactSpray);

    // Overflow sheets: a translucent curtain of liquid running down each cup wall.
    const sheetGeom = new THREE.PlaneGeometry(1, 1);
    this.sheetL = new THREE.Mesh(sheetGeom, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    this.sheetR = new THREE.Mesh(sheetGeom, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    for (const s of [this.sheetL, this.sheetR]) { s.position.z = 0.015; s.visible = false; this.simScene.add(s); }

    // Spill cascade (instanced circles).
    this.spillMesh = new THREE.InstancedMesh(
      new THREE.CircleGeometry(0.022, 12),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }), SPILL_MAX);
    this.spillMesh.frustumCulled = false;
    const zero = this._mtx.makeScale(0, 0, 0);
    for (let i = 0; i < SPILL_MAX; i++) { this.spillMesh.setMatrixAt(i, zero); this.spillMesh.setColorAt(i, this._col.set(0x9fd8ef)); }
    this.spillMesh.instanceMatrix.needsUpdate = true;
    this.simScene.add(this.spillMesh);

    // Overflow flash ring at the rim.
    this.flashRing = new THREE.Mesh(new THREE.RingGeometry(0.955, 1, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
    this.flashRing.position.set(CUP_X, RIM, 0.05);
    this.flashRing.visible = false;
    this.simScene.add(this.flashRing);

    // --- histogram (unchanged) ---
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(HIST_X0 - HIST_DX * 0.6, BAR_FLOOR, 0),
        new THREE.Vector3(HIST_X0 + (KMAX - KMIN + 0.6) * HIST_DX, BAR_FLOOR, 0),
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.34 })
    ));
    const barGeom = new THREE.PlaneGeometry(1, 1);
    const barGold = new THREE.MeshBasicMaterial({ color: 0xe5bf78, transparent: true, opacity: 0.85 });
    const barCyan = new THREE.MeshBasicMaterial({ color: 0x77dfbd, transparent: true, opacity: 0.65 });
    this.barMeshes = [];
    for (let k = KMIN; k <= KMAX; k++) {
      const m = new THREE.Mesh(barGeom, k === KMIN ? barGold : barCyan);
      m.position.set(HIST_X0 + (k - KMIN) * HIST_DX, BAR_FLOOR, 0);
      m.scale.set(HIST_DX * 0.8, 1e-4, 1);
      this.simScene.add(m);
      this.barMeshes.push(m);
      this._insLabel(String(k), m.position.x, BAR_FLOOR - 0.065);
    }
    const envPositions = new Float32Array((KMAX - KMIN + 1) * 3);
    for (let k = KMIN; k <= KMAX; k++) {
      envPositions[(k - KMIN) * 3] = HIST_X0 + (k - KMIN) * HIST_DX;
      envPositions[(k - KMIN) * 3 + 1] = BAR_FLOOR;
      envPositions[(k - KMIN) * 3 + 2] = 0.01;
    }
    this.envGeom = new THREE.BufferGeometry();
    this.envGeom.setAttribute('position', new THREE.BufferAttribute(envPositions, 3));
    this.simScene.add(new THREE.Line(this.envGeom,
      new THREE.LineBasicMaterial({ color: 0xece4cf, transparent: true, opacity: 0.55 })));
    const histogramCaption = this._insLabel('pours until overflow', 0.42, BAR_FLOOR - 0.14);
    histogramCaption.scale.set(0.62, 0.062, 1);

    this._initSimplexInset();
  }

  _insLabel(text, cx, cy) {
    const c = document.createElement('canvas');
    c.width = Math.max(128, text.length * 25 + 24); c.height = 64;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, 64);
    g.fillStyle = '#d8e3d8';
    g.font = text.length > 5 ? '40px Georgia, serif' : '44px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, 36, c.width - 12);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthTest: false }));
    sp.position.set(cx, cy, 0.08);
    sp.scale.set(0.088, 0.060, 1);
    this.simScene.add(sp);
    return sp;
  }

  // Build the standard-simplex inset once; updateSimScene only recolours it.
  _initSimplexInset() {
    // Panel frame.
    this.simScene.add(new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(INS_X0, INS_Y0, 0.06), new THREE.Vector3(INS_X1, INS_Y0, 0.06),
        new THREE.Vector3(INS_X1, INS_Y1, 0.06), new THREE.Vector3(INS_X0, INS_Y1, 0.06),
      ]),
      new THREE.LineBasicMaterial({ color: 0xe5bf78, transparent: true, opacity: 0.22 })
    ));

    // k=1: unit segment.
    const sy = INS_CY[0];
    this._insSeg = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(INS_SHAPE_X - INS_D / 2, sy, 0.07),
        new THREE.Vector3(INS_SHAPE_X + INS_D / 2, sy, 0.07),
      ]),
      new THREE.LineBasicMaterial({ color: INS_DIM, transparent: true, opacity: 0.3 })
    );
    this.simScene.add(this._insSeg);

    // k=2: triangle U₁+U₂<1 (area 1/2).
    const tox = INS_SHAPE_X - INS_D / 2, toy = INS_CY[1] - INS_D / 2;
    const tv = [
      new THREE.Vector3(tox, toy, 0.07),
      new THREE.Vector3(tox + INS_D, toy, 0.07),
      new THREE.Vector3(tox, toy + INS_D, 0.07),
    ];
    this._insTriFill = new THREE.Mesh(
      new THREE.BufferGeometry().setFromPoints(tv),
      new THREE.MeshBasicMaterial({ color: INS_DIM, transparent: true, opacity: 0.05, depthWrite: false })
    );
    this._insTriFill.geometry.setIndex([0, 1, 2]);
    this._insTriFill.position.z = -0.005;
    this.simScene.add(this._insTriFill);
    this._insTriLine = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(tv),
      new THREE.LineBasicMaterial({ color: INS_DIM, transparent: true, opacity: 0.3 })
    );
    this.simScene.add(this._insTriLine);

    // k=3: tetrahedron U₁+U₂+U₃<1 (volume 1/6), oblique sketch.
    const kox = INS_SHAPE_X - INS_D / 2, koy = INS_CY[2] - INS_D / 2;
    const proj = (X, Y, Z) => new THREE.Vector3(
      kox + (X + INS_TZ_X * Z) * INS_D, koy + (Y + INS_TZ_Y * Z) * INS_D, 0.07);
    const O = proj(0, 0, 0), A = proj(1, 0, 0), B = proj(0, 1, 0), C = proj(0, 0, 1);
    this._insTetFill = new THREE.Mesh(
      new THREE.BufferGeometry().setFromPoints([O, A, B, A, B, C]),
      new THREE.MeshBasicMaterial({ color: INS_DIM, transparent: true, opacity: 0.06, depthWrite: false })
    );
    this._insTetFill.position.z = -0.005;
    this.simScene.add(this._insTetFill);
    this._insTet = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([O, A, O, B, A, B, O, C, A, C, B, C]),
      new THREE.LineBasicMaterial({ color: INS_DIM, transparent: true, opacity: 0.3 })
    );
    this.simScene.add(this._insTet);

    // Labels: title + 1/k! per shape.
    this._insTitle = this._insLabel('k-simplex', (INS_X0 + INS_X1) / 2, INS_Y1 - 0.045);
    this._insTitle.scale.set(0.32, 0.064, 1);
    this._insLabels = [
      this._insLabel('1', INS_LABEL_X, INS_CY[0]),
      this._insLabel('1/2', INS_LABEL_X, INS_CY[1]),
      this._insLabel('1/6', INS_LABEL_X, INS_CY[2]),
    ];
  }

  // Recolour the inset to the current trial's running pour count (no allocation).
  _updateSimplexInset() {
    if (!this._insSeg) return;
    const active = Math.min(this.risenCount, 3);   // shape k that has just been reached
    const col = (i) => (active === i ? INS_BRIGHT : (i < active ? INS_MED : INS_DIM));
    const op = (i) => (active === i ? 0.95 : (i < active ? 0.6 : 0.28));
    this._insSeg.material.color.set(col(1)); this._insSeg.material.opacity = op(1);
    this._insTriLine.material.color.set(col(2)); this._insTriLine.material.opacity = op(2);
    this._insTet.material.color.set(col(3)); this._insTet.material.opacity = op(3);
    this._insTriFill.material.color.set(col(2));
    this._insTriFill.material.opacity = active === 2 ? 0.34 : (active > 2 ? 0.16 : 0.05);
    this._insTetFill.material.color.set(col(3));
    this._insTetFill.material.opacity = active === 3 ? 0.32 : 0.06;
    for (let i = 0; i < 3; i++) {
      this._insLabels[i].material.opacity = (active === i + 1) ? 1 : (i + 1 < active ? 0.55 : 0.22);
    }
  }

  _surfX(i) { return SURF_X0 + (i / (M - 1)) * (SURF_X1 - SURF_X0); }

  _stepWave(dt) {
    if (dt <= 0) return;
    const s = this.s, v = this.sv;
    const sub = Math.min(5, Math.max(1, Math.ceil(dt / 0.008)));
    const h = dt / sub;
    for (let n = 0; n < sub; n++) {
      for (let i = 0; i < M; i++) {
        const l = i > 0 ? s[i - 1] : s[i];
        const r = i < M - 1 ? s[i + 1] : s[i];
        const a = 42 * (l + r - 2 * s[i]) - 26 * s[i] - 5.5 * v[i];
        v[i] += a * h;
      }
      for (let i = 0; i < M; i++) {
        s[i] += v[i] * h;
        if (s[i] > AMP) { s[i] = AMP; v[i] *= 0.4; }
        else if (s[i] < -AMP) { s[i] = -AMP; v[i] *= 0.4; }
      }
    }
  }

  updateSimScene() {
    if (!this.bandMeshes) return;
    const P = this.cupPhase;

    // --- displayed fill level ---
    let level = this.risenLevel;
    if (P === 'rise') level = this.risenLevel + this.pours[this.risenCount] * easeOut(this.phaseT / T_RISE);
    else if (P === 'drain') level = this.risenLevel * (1 - easeIn(Math.min(1, this.phaseT / T_DRAIN)));
    this.level = level;
    const levelDraw = Math.min(level, LEVEL_CLAMP);
    const waterTopY = CUP_BOT + levelDraw * FILL_H;
    const menBot = Math.max(CUP_BOT, waterTopY - MENISCUS);

    // --- colour bands ---
    let below = 0;
    let topIdx = -1;
    for (let i = 0; i < MAX_BANDS; i++) {
      const m = this.bandMeshes[i];
      if (i >= this.pours.length) { m.visible = false; continue; }
      // band i occupies [below, below+amt]; the rising band only up to `level`.
      const amt = this.pours[i];
      const isRising = (P === 'rise' && i === this.risenCount);
      const naturalTop = (i < this.risenCount || isRising) ? Math.min(below + amt, levelDraw) : below;
      if (naturalTop > below) topIdx = i;
      const botY = CUP_BOT + below * FILL_H;
      const topY = Math.min(CUP_BOT + naturalTop * FILL_H, menBot);
      if (topY > botY + 1e-4 && (i < this.risenCount || isRising)) {
        m.visible = true;
        m.scale.set(CUP_W - 0.04, topY - botY, 1);
        m.position.set(CUP_X, (botY + topY) / 2, 0.01);
        m.material.color.set(this.pourCols[i]);
        topIdx = i;
      } else {
        m.visible = false;
      }
      below += amt;
    }
    // --- wavy meniscus skin on top of the water ---
    const showWater = levelDraw > 0.004 && topIdx >= 0;
    this.meniscus.visible = showWater;
    this.skinLine.visible = showWater;
    if (showWater) {
      const mp = this.menGeom.attributes.position.array;
      const sp = this.skinGeom.attributes.position.array;
      for (let i = 0; i < M; i++) {
        const x = this._surfX(i);
        const topY = waterTopY + this.s[i] * Math.min(1, levelDraw * 10);
        mp[6 * i] = x; mp[6 * i + 1] = topY; mp[6 * i + 2] = 0;
        mp[6 * i + 3] = x; mp[6 * i + 4] = menBot; mp[6 * i + 5] = 0;
        sp[3 * i] = x; sp[3 * i + 1] = topY; sp[3 * i + 2] = 0;
      }
      this.menGeom.attributes.position.needsUpdate = true;
      this.skinGeom.attributes.position.needsUpdate = true;
      this.meniscus.material.color.set(this.pourCols[topIdx]);
    }

    // --- falling droplet + merge neck ---
    const showDrop = (P === 'drop' || P === 'rise') && this.pours.length > 0;
    const dcol = showDrop ? this.pourCols[this.pours.length - 1] : 0xffffff;
    const surfaceY = CUP_BOT + this.risenLevel * FILL_H;
    if (P === 'drop') {
      const fall = Math.min(1, this.phaseT / T_DROP);
      const p = easeIn(fall);                    // accelerates under gravity
      const startY = RIM + 0.22;
      const y = startY + (surfaceY - startY) * p;
      const squash = 1 + 0.3 * p;
      const amountScale = 0.64 + 0.48 * Math.cbrt(this.pours[this.pours.length - 1]);
      const sx = amountScale / Math.sqrt(squash), sy = amountScale * squash;
      this.dropMesh.visible = this.dropHalo.visible = this.dropHi.visible = true;
      this.dropNeck.visible = false;
      this.dropMesh.position.set(this.impactX, y, 0.04);
      this.dropMesh.scale.set(sx, sy, 1);
      this.dropMesh.material.color.set(dcol);
      this.dropHalo.position.set(this.impactX, y, 0.039);
      this.dropHalo.scale.set(sx, sy, 1);
      this.dropHalo.material.color.set(dcol);
      // specular glint rides high on the blob
      this.dropHi.position.set(this.impactX - DROP_R * 0.28, y + DROP_R * 0.34 * sy, 0.041);
      this.dropHi.scale.set(sx, sy, 1);
    } else if (P === 'rise') {
      // droplet splats on contact (wide->flat) then sinks; a tapering neck bridges them
      const p = this.phaseT / T_RISE;
      const sc = 1 - easeOut(p);
      const splat = 1 - p;                        // 1 at impact, 0 as it settles
      const sw = sc * (1 + 0.9 * splat);          // widen on impact
      const sh = sc * (1 - 0.45 * splat);         // squash flat on impact
      this.dropMesh.visible = sc > 0.02;
      this.dropHalo.visible = false;
      this.dropHi.visible = false;
      this.dropMesh.position.set(this.impactX, waterTopY + DROP_R * sh, 0.04);
      this.dropMesh.scale.set(sw, sh, 1);
      this.dropMesh.material.color.set(dcol);
      const neckH = Math.max(0, DROP_R * 1.6 * (1 - p));
      this.dropNeck.visible = neckH > 0.004;
      this.dropNeck.scale.set(DROP_R * 1.1 * sc + 0.004, neckH, 1);
      this.dropNeck.position.set(this.impactX, waterTopY + neckH / 2, 0.038);
      this.dropNeck.material.color.set(dcol);
    } else {
      this.dropMesh.visible = this.dropHalo.visible = this.dropHi.visible = this.dropNeck.visible = false;
    }

    // Contact rings and a small crown follow the simulated impact age. Rendering
    // never advances them, so a paused scene is exactly still.
    for (let i = 0; i < this.impactRings.length; i++) {
      const ring = this.impactRings[i];
      const age = this.impactAge - i * 0.1;
      const p = age / 0.45;
      ring.visible = showWater && p >= 0 && p < 1;
      if (!ring.visible) continue;
      const room = Math.min(this.impactX - SURF_X0, SURF_X1 - this.impactX);
      const r = Math.min(room, 0.028 + 0.16 * p);
      ring.scale.set(r, r * 0.24, 1);
      ring.position.set(this.impactX, waterTopY + 0.003, 0.055);
      ring.material.opacity = (1 - p) * 0.6;
    }
    this.impactSpray.visible = this.impactAge < 0.32;
    if (this.impactSpray.visible) {
      const age = this.impactAge;
      this.impactSpray.material.color.set(dcol);
      for (let i = 0; i < 8; i++) {
        const vx = (i - 3.5) * 0.12;
        const vy = 0.75 + 0.22 * Math.sin(i * 2.1);
        const y = this.impactY + vy * age - 2.4 * age * age;
        const size = y > this.impactY ? 1 - age / 0.36 : 0;
        this._mtx.makeScale(size, size * 1.3, 1);
        this._mtx.setPosition(this.impactX + vx * age, y, 0.055);
        this.impactSpray.setMatrixAt(i, this._mtx);
      }
      this.impactSpray.instanceMatrix.needsUpdate = true;
    }

    // --- spill cascade + flash + wall sheets ---
    const flashFrac = (P === 'spill') ? (1 - this.phaseT / T_SPILL) : 0;
    this.flashRing.visible = flashFrac > 0;
    if (flashFrac > 0) {
      this.flashRing.material.opacity = 0.65 * flashFrac;
      const sc = 1 + 0.25 * (1 - flashFrac);
      this.flashRing.scale.set(CUP_W * 0.5 * sc, CUP_W * 0.11 * sc, 1);
    }

    // translucent liquid sheets crest the rim and run down both cup walls
    const showSheet = (P === 'spill' || P === 'drain');
    this.sheetL.visible = this.sheetR.visible = showSheet;
    if (showSheet) {
      const runP = (P === 'spill') ? Math.min(1, this.phaseT / T_SPILL) : 1;
      const fade = (P === 'drain') ? Math.max(0, 1 - this.phaseT / T_DRAIN) : 1;
      const len = 0.06 + 0.62 * easeOut(runP);    // curtain lengthens as it pours
      const scol = this.pourCols.length ? this.pourCols[this.pourCols.length - 1] : 0x9fd8ef;
      const hw = CUP_W / 2, w = 0.05;
      this.sheetL.scale.set(w, len, 1);
      this.sheetL.position.set(CUP_X - hw - w * 0.4, RIM - len / 2, 0.015);
      this.sheetL.material.color.set(scol);
      this.sheetL.material.opacity = 0.32 * fade;
      this.sheetR.scale.set(w, len, 1);
      this.sheetR.position.set(CUP_X + hw + w * 0.4, RIM - len / 2, 0.015);
      this.sheetR.material.color.set(scol);
      this.sheetR.material.opacity = 0.32 * fade;
    }
    const sm = this.spillMesh, mtx = this._mtx;
    for (let i = 0; i < SPILL_MAX; i++) {
      if (i < this.spCount && this.spLife[i] > 0) {
        const stretch = 1 + Math.min(0.9, Math.abs(this.spVY[i]) * 0.2);
        const size = 0.55 + (i % 4) * 0.13;
        mtx.makeScale(size / Math.sqrt(stretch), size * stretch, 1);
        mtx.setPosition(this.spX[i], this.spY[i], 0.05);
        sm.setColorAt(i, this._col.set(this.pourCols.length ? this.pourCols[this.pourCols.length - 1] : 0x9fd8ef));
      } else {
        mtx.makeScale(0, 0, 0);
      }
      sm.setMatrixAt(i, mtx);
    }
    sm.instanceMatrix.needsUpdate = true;
    if (sm.instanceColor) sm.instanceColor.needsUpdate = true;

    // trim the sound-effect list
    if (this.collisionEffects.length > 8) this.collisionEffects.splice(0, this.collisionEffects.length - 8);

    // --- histogram (unchanged) ---
    let maxC = 1;
    for (let k = KMIN; k <= KMAX; k++) if (this.kCounts[k] > maxC) maxC = this.kCounts[k];
    for (let k = KMIN; k <= KMAX; k++) {
      const m = this.barMeshes[k - KMIN];
      const h = Math.max(this.kCounts[k] / maxC * BAR_MAX_H, 1e-4);
      m.scale.y = h;
      m.position.y = BAR_FLOOR + h / 2;
    }
    const env = this.envGeom.attributes.position.array;
    for (let k = KMIN; k <= KMAX; k++) {
      const h = this.totalTrials > 0 ? this.totalTrials * this.kProb[k] / maxC * BAR_MAX_H : 0;
      env[(k - KMIN) * 3 + 1] = BAR_FLOOR + h;
    }
    this.envGeom.attributes.position.needsUpdate = true;

    this._updateSimplexInset();
  }
}

registerSim(UniformSumE);
