import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// J0(x) — power series for small x and Miller's downward recursion for
// larger x. Both formulations are π-free (the series defines J0 by its
// definition, and Miller's recursion uses only J_{n-1} = (2n/x)J_n - J_{n+1}
// plus the normalization J_0 + 2(J_2 + J_4 + …) = 1). Numerically stable
// for any x; the previous direct power series exploded at x ≳ 30.
function besselJ0(x) {
  if (x === 0) return 1;
  const ax = Math.abs(x);
  if (ax < 8) {
    let term = 1;
    let sum = 1;
    const x2 = x * x;
    for (let k = 1; k <= 50; k++) {
      term *= -x2 / (4 * k * k);
      sum += term;
      if (Math.abs(term) < 1e-16 * Math.abs(sum)) break;
    }
    return sum;
  }
  // Miller's algorithm: pick M sufficiently above x and recurse down.
  let M = Math.floor(ax) + 24;
  if (M % 2 !== 0) M++;
  let jPrev = 0; // J_{n+1} (initially J_{M+1} = 0)
  let j = 1;     // J_n     (initially J_M     = 1, arbitrary)
  let normSum = 0;
  // Include J_M (initial j=1) in the even-index sum if M is even ≥ 2.
  if (M >= 2 && M % 2 === 0) normSum += j;
  for (let n = M; n >= 1; n--) {
    const jMinus1 = (2 * n / ax) * j - jPrev;
    if (n - 1 >= 2 && (n - 1) % 2 === 0) {
      normSum += jMinus1;
    }
    jPrev = j;
    j = jMinus1;
    if (Math.abs(j) > 1e15) {
      const inv = 1e-15;
      j *= inv;
      jPrev *= inv;
      normSum *= inv;
    }
  }
  // After the loop j = J_0(x). Normalize by the identity above.
  const totalSum = j + 2 * normSum;
  return j / totalSum;
}

// main.js advances 1e-4 sim-seconds per step() and ~speed*10 steps per frame,
// so raw sim time runs at ~0.06 s per wall second at speed 1. Rescale (the
// GaltonBoardPi pattern) so one sweep-second ≈ one wall second at speed 1.
const TIME_SCALE = 16.7;
const SAMPLE_STEP = 0.04;  // x-resolution of zero detection (~78 samples/period)
const MAX_X = 600;         // sweep end: ~191 zeros, π to ~6 digits
const TURBO_FACTOR = 30;   // turbo sweeps the whole range in a couple of seconds
const CURVE_KEEP = 1500;   // curve points retained (60 x-units > the window)
const VIEW_W = 28;         // visible x-window (~9 zeros on screen)
const Y_TOP = 7;           // camera half-height (window aspect = 2:1)
const CURSOR_FRAC = 0.8;   // cursor parks at 80% across the window
const AMP = 6;             // display gain: plot J0(x)·√(1+x)·AMP (zeros unmoved)
const MARKER_H = 4.2;      // half-height of the red zero markers
const MAX_MARKERS = 80;    // recent zeros drawn (older ones scroll out anyway)

export class BesselZeroCounter extends Simulation {
  static id = 'bessel-zero-counter';
  static title = 'Bessel Zero Counter';
  static description = 'Sweep J₀(x) and count its zeros — the N-th sits at (N − ¼)π, so each crossing reads out π';
  static piMechanism = 'deterministic asymptotics: zeros of J₀ are spaced π apart; π ≈ x_N/(N − ¼), error ~1/N²';
  static rigor = 'Exact Asymptotic';
  static sortOrder = 78;
  static piNature = 'exact';
  static piLabel = 'π ≈';
  static previewSteps = 9;   // hub thumbnail: mid-sweep near x ≈ 60, scroll engaged
  static alternatives = [{ id: 'standing-wave-node-pi', label: 'Nodes on a string' }];
  static explanation = {
    setup: 'A cursor sweeps along the x-axis tracing the Bessel function J₀(x); every sign change is a detected zero — one countable event. The display multiplies the decaying curve by √x so late oscillations stay visible; the zero positions are untouched.',
    insight: 'For large x, J₀(x) ≈ √(2/(πx)) · cos(x − π/4). The cosine pins the N-th zero at x_N ≈ (N − ¼)π, so consecutive zeros are asymptotically exactly π apart. Reading the latest zero as π ≈ x_N/(N − ¼) converges deterministically with error ≈ 1/(8πN²).',
    contrast: 'No geometry and no randomness: π appears as the asymptotic period of a special function defined purely by its power series and recurrence. Unlike the Monte Carlo cards nearby, every digit is reproducible — convergence is a clean 1/N² law, not 1/√samples.',
    formula: 'π ≈ x_N / (N − ¼)  (x_N = N-th zero of J₀; error ≈ 1/(8πN²))  [EXACT ASYMPTOTIC]',
    getExpected: () => 'Zero #1 already gives 2.4048/0.75 ≈ 3.206. Zero #5 gives 3.14335, #20 gives 3.14169, and the last zero of the sweep (#191, near x = 600) gives 3.141594 — six digits. The consecutive-zero spacing x_N − x_{N−1} also approaches π (its readout is limited by the 0.04 sampling grid).'
  };

  constructor(params = {}) {
    super(params);
    this.sweepRate = params.sweepRate || 10;  // x-units per sweep-second
    this.maxX = params.maxX || MAX_X;
    this.turbo = false;
    this.reset();
  }

  reset() {
    super.reset();
    this.x = 0;
    this.prevJ = besselJ0(0);
    this.curve = [[0, this.prevJ]];
    this.zeros = [];
    this.sweepCarry = 0;
    this.collisionCount = 0;
    this.lastPhasePoint = [-1, 0];
    this.finished = false;
  }

  getControls() {
    return [
      { type: 'slider', id: 'sweepRate', label: 'Sweep speed (x units/s)', min: 2, max: 40, step: 1,
        default: this.sweepRate, highlight: true,
        onChange: (val) => { this.sweepRate = val; } },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×30 sweep', default: this.turbo },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'n-vs-pi', label: 'zero index vs π estimate (line = π)', dimension: 2, primary: true,
        boundary: 'none',
        axisLabels: { x: 'log₁₀ N', y: 'x_N/(N−¼) − π' } }
    ];
  }

  step(dt) {
    if (this.finished) return false;
    // Carry accumulator: dt=1e-4 advances the sweep by far less than one
    // sample, so fractional progress must persist across calls (the old code
    // recomputed the target from this.x each call and froze forever).
    const rate = this.sweepRate * (this.turbo ? TURBO_FACTOR : 1);
    this.sweepCarry += rate * TIME_SCALE * dt;
    let found = false;
    while (this.sweepCarry >= SAMPLE_STEP && !this.finished) {
      this.sweepCarry -= SAMPLE_STEP;
      const xNext = this.x + SAMPLE_STEP;
      const jNext = besselJ0(xNext);
      this.curve.push([xNext, jNext]);
      if (this.curve.length > CURVE_KEEP) this.curve.shift();
      // Sign change → zero (linearly interpolated inside the sample)
      if (this.prevJ * jNext < 0) {
        const t = this.prevJ / (this.prevJ - jNext);
        const xZero = this.x + t * SAMPLE_STEP;
        this.zeros.push(xZero);
        const N = this.zeros.length;
        this.collisionCount = N;
        const est = xZero / (N - 0.25);
        this.lastPhasePoint = [
          Math.min(1, Math.log10(N) / Math.log10(250)) * 2 - 1,
          Math.max(-1, Math.min(1, (est - Math.PI) * 15))
        ];
        this.pendingPhasePoints.push([...this.lastPhasePoint]);
        found = true;
      }
      this.prevJ = jNext;
      this.x = xNext;
      if (this.x >= this.maxX) this.finished = true;
    }
    return found;
  }

  getCountLabel() {
    return 'J₀ zeros';
  }

  getPiApproximation() {
    const N = this.zeros.length;
    if (N === 0) return 0;
    return this.zeros[N - 1] / (N - 0.25);
  }

  getPiReadout() {
    return this.zeros.length > 0 ? this.getPiApproximation().toFixed(8) : 'sweeping…';
  }

  getFormulaHTML() {
    const N = this.zeros.length;
    if (N === 0) {
      return `
        <strong>Bessel zero counter</strong>:
        <span class="f-angle">J₀(x) ≈ √(2/(πx)) cos(x − π/4) ⇒ N-th zero x_N ≈ (N − ¼)π</span><br>
        <span class="f-muted">sweeping… waiting for the first sign change of J₀</span>
      `;
    }
    const xN = this.zeros[N - 1];
    const spacing = N >= 2 ? xN - this.zeros[N - 2] : null;
    return `
      <strong>Bessel zero counter</strong>:
      <span class="f-angle">x_N ≈ (N − ¼)π ⇒ π ≈ x_N / (N − ¼)</span><br>
      <span class="f-result">π</span> ≈
      <span class="f-count">${xN.toFixed(4)}</span> / (<span class="f-count">${N}</span> − ¼) =
      <span style="font-size:1.1em">${piDigitsHTML(this.getPiApproximation(), 6)}</span>
      ${spacing !== null ? `<br><span class="f-muted">consecutive spacing x_${N} − x_${N - 1} = ${piDigitsHTML(spacing, 5)} → π</span>` : ''}
    `;
  }

  getPhasePoint() { return [...this.lastPhasePoint]; }
  getPhaseExtractor() { return (pt) => pt; }

  getPreviewBox() {
    return { x0: 0, x1: VIEW_W, y0: -Y_TOP, y1: Y_TOP };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(0, VIEW_W, Y_TOP, -Y_TOP, 0.1, 10);
    this.simCamera.position.z = 1;

    // Fixed x-axis spanning the window; everything else scrolls inside a group.
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1, 0, 0), new THREE.Vector3(VIEW_W + 1, 0, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
    ));

    this.world = new THREE.Group();
    this.simScene.add(this.world);

    // Ticks every 10 x-units make the scrolling motion legible.
    const tickPts = [];
    for (let tx = 0; tx <= this.maxX; tx += 10) {
      tickPts.push(new THREE.Vector3(tx, -0.35, 0), new THREE.Vector3(tx, 0.35, 0));
    }
    this.world.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(tickPts),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
    ));

    // J0 curve (amplitude-compensated at display time)
    this.curveGeom = new THREE.BufferGeometry();
    this.curveGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CURVE_KEEP * 3), 3));
    this.curveGeom.setDrawRange(0, 0);
    this.world.add(new THREE.Line(
      this.curveGeom,
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.9 })
    ));

    // Detected-zero markers
    this.zerosGeom = new THREE.BufferGeometry();
    this.zerosGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_MARKERS * 6), 3));
    this.zerosGeom.setDrawRange(0, 0);
    this.world.add(new THREE.LineSegments(
      this.zerosGeom,
      new THREE.LineBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.95 })
    ));

    // Sweep cursor
    this.cursor = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 20),
      new THREE.MeshBasicMaterial({ color: 0xf7c948 })
    );
    this.world.add(this.cursor);
  }

  updateSimScene() {
    if (!this.curveGeom) return;
    const arr = this.curveGeom.attributes.position.array;
    const cap = Math.floor(arr.length / 3);
    const start = Math.max(0, this.curve.length - cap);
    const n = this.curve.length - start;
    for (let i = 0; i < n; i++) {
      const pt = this.curve[start + i];
      arr[i * 3] = pt[0];
      arr[i * 3 + 1] = pt[1] * AMP * Math.sqrt(1 + pt[0]);
      arr[i * 3 + 2] = 0;
    }
    this.curveGeom.attributes.position.needsUpdate = true;
    this.curveGeom.setDrawRange(0, n);

    const z = this.zerosGeom.attributes.position.array;
    const zStart = Math.max(0, this.zeros.length - MAX_MARKERS);
    const Z = this.zeros.length - zStart;
    for (let i = 0; i < Z; i++) {
      const zx = this.zeros[zStart + i];
      z[i * 6] = zx; z[i * 6 + 1] = -MARKER_H; z[i * 6 + 2] = 0;
      z[i * 6 + 3] = zx; z[i * 6 + 4] = MARKER_H; z[i * 6 + 5] = 0;
    }
    this.zerosGeom.attributes.position.needsUpdate = true;
    this.zerosGeom.setDrawRange(0, Z * 2);

    this.cursor.position.set(this.x, this.prevJ * AMP * Math.sqrt(1 + this.x), 0.02);
    // Scroll the world so the cursor parks at CURSOR_FRAC of the window.
    this.world.position.x = -Math.max(0, this.x - VIEW_W * CURSOR_FRAC);
  }
}

registerSim(BesselZeroCounter);
