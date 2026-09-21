import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// main.js advances 1e-4 sim-seconds per step() and ~speed*10 steps per frame,
// so rescale to board-seconds: at speed 1 / 60 fps one board-second is roughly
// one wall-clock second (GaltonBoardPi pattern). The rate slider is then an
// honest "integers tested per second".
const TIME_SCALE = 16.7;
const TURBO_RATE = 1500;          // integers per board-second in turbo mode

const COLS = 36;                  // grid width in cells
const ROWS = 28;                  // visible rows -> window of the last 1008 integers
const CELL = 1 / COLS;
const GRID_H = ROWS * CELL;
const STRIP_TOP = -0.05;          // running-density strip below the grid
const STRIP_BOT = -0.21;
const DMIN = 0.45, DMAX = 0.80;   // density axis range of the strip
const REF = 6 / (Math.PI * Math.PI);   // 0.60793…
const HIST = 512;                 // density samples drawn across the strip
const FLASH = 0.9;                // board-seconds a fresh verdict stays bright

const COL_DIM = [0.10, 0.14, 0.26];      // unchecked cell
const COL_SF = [0.20, 0.50, 0.30];       // settled squarefree green
const COL_SF_HI = [0.49, 0.99, 0.54];    // fresh squarefree flash
const STRIKE_COLS = {
  2: [0.91, 0.27, 0.38],                 // struck by 4 = 2²  (red-ish)
  3: [0.97, 0.79, 0.28],                 // struck by 9 = 3²  (gold)
  5: [0.30, 0.79, 0.94],                 // struck by 25 = 5² (cyan)
};
const COL_OTHER = [0.62, 0.42, 1.00];    // struck by p² with p ≥ 7 (purple)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class SquareFreeSieve extends Simulation {
  static id = 'square-free-sieve';
  static title = 'Square-Free Sieve';
  static description = 'Strike out multiples of 4, 9, 25, … — the green survivors have density 6/π²';
  static piMechanism = 'number-theoretic count: squarefree density → 6/π²';
  static rigor = 'Statistical';
  static sortOrder = 72;
  static piNature = 'statistical';
  static piLabel = 'π ≈';
  static previewSteps = 250;
  static alternatives = [
    { id: 'visible-lattice-trees', label: 'Same density, coprime version' },
    { id: 'basel-sum-walker', label: 'The sum behind 6/π²' },
  ];
  static explanation = {
    setup: 'The integers 1, 2, 3, … march through a grid, 36 per row, newest row at the bottom. Each one is tested against the prime squares 4, 9, 25, 49, …. If some p² divides it, it is struck in that prime\'s colour (2² red, 3² gold, 5² cyan, larger purple); the survivors — the squarefree numbers — settle to green.',
    insight: 'A random integer is divisible by p² with probability 1/p², and divisibility by 4, by 9, by 25, … behave like independent events (they involve different primes). So the surviving fraction is the Euler product over primes ∏(1 − 1/p²) = 1/(1 + 1/2² + 1/3² + …) = 1/ζ(2) = 6/π² ≈ 0.6079. Inverting the count: π ≈ √(6N / S(N)).',
    contrast: 'No circle and no randomness — pure divisibility. The strip under the grid plots the running density S(n)/n against the 6/π² line: 2² alone removes a quarter of all integers, 3² a ninth of what is left, and the fraction that survives every prime square is exactly the number 6/π² that the Basel problem ties to π.',
    formula: 'π ≈ √(6N / S(N)),  S(N)/N → ∏ₚ (1 − 1/p²) = 1/ζ(2) = 6/π²',
    getExpected: (params) => {
      const N = params.N || 4000;
      return `For N=${N}, expect S(N) ≈ ${Math.round(N * REF)} squarefree survivors (density 0.6079), giving π ≈ ${Math.PI.toFixed(4)}. The estimate typically lands within ~10⁻³ of π by N ≈ 10⁴ — turbo gets you there.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.N = params.N || 4000;
    this.rate = params.rate || 6;
    this.turbo = !!params.turbo;
    this.reset();
  }

  reset() {
    super.reset();
    this.flags = new Uint8Array(this.N + 1);     // 0 unknown, 1 squarefree, 2 struck
    this.strikeP = new Uint8Array(this.N + 1);   // smallest prime whose square divides n
    this.struckAt = new Float32Array(this.N + 1); // board-time of the verdict (for the flash)
    this.densityHist = new Float32Array(HIST);
    this.histLen = 0;
    this.sampleEvery = Math.max(1, Math.round(this.N / HIST));
    this.strikeCounts = [0, 0, 0, 0];            // strikes by 2², 3², 5², larger p²
    this.maxStrikeP = 0;
    this.cursor = 1;
    this.checked = 0;
    this.squarefree = 0;
    this.boardTime = 0;
    this.carry = 0;
    this.nextPhaseAt = 1;
    this.collisionCount = 0;
    this.lastPhasePoint = [-1, 0, -1, 0];
    this.finished = false;
  }

  // Smallest prime p with p² | n, or 0 if n is squarefree. Honest trial division.
  strikePrime(n) {
    let x = n;
    for (let p = 2; p * p <= x; p++) {
      if (x % p === 0) {
        let count = 0;
        while (x % p === 0) { x /= p; count++; if (count >= 2) return p; }
      }
    }
    return 0;
  }

  checkOne() {
    const n = this.cursor;
    const p = this.strikePrime(n);
    if (p === 0) {
      this.flags[n] = 1;
      this.squarefree++;
    } else {
      this.flags[n] = 2;
      this.strikeP[n] = Math.min(p, 255);
      if (p === 2) this.strikeCounts[0]++;
      else if (p === 3) this.strikeCounts[1]++;
      else if (p === 5) this.strikeCounts[2]++;
      else this.strikeCounts[3]++;
      if (p > this.maxStrikeP) this.maxStrikeP = p;
    }
    this.struckAt[n] = this.boardTime;
    this.checked++;
    this.cursor++;
    if (this.checked % this.sampleEvery === 0 && this.histLen < HIST) {
      this.densityHist[this.histLen++] = this.squarefree / this.checked;
    }
  }

  getControls() {
    return [
      { type: 'slider', id: 'N', label: 'Range N', min: 500, max: 30000, step: 500, default: this.N,
        onChange: (val) => { this.N = val; this.reset(); this.initSimScene(); } },
      { type: 'slider', id: 'rate', label: 'Numbers / s', min: 1, max: 60, step: 1, default: this.rate,
        highlight: true,
        onChange: (val) => { this.rate = val; } },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×1500 (statistics speed)', default: this.turbo },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: 'convergence', label: 'log₁₀ n vs π̂ error (axis = π)', dimension: 2, primary: true,
        boundary: 'none', axisLabels: { x: 'log₁₀ n', y: '(π̂ − π)/π' } },
      { id: 'n-density', label: 'n vs running density (axis = 6/π²)', dimension: 2,
        boundary: 'none', axisLabels: { x: 'n / N', y: 'S(n)/n − 6/π²' } },
    ];
  }

  step(dt) {
    if (this.finished) return false;
    const t = dt * TIME_SCALE;
    this.boardTime += t;
    this.carry += (this.turbo ? TURBO_RATE : this.rate) * t;
    let m = Math.floor(this.carry);
    this.carry -= m;
    let changed = false;
    for (; m > 0 && this.cursor <= this.N; m--) {
      this.checkOne();
      changed = true;
    }
    if (this.cursor > this.N) this.finished = true;
    this.collisionCount = this.squarefree;
    if (changed && this.checked >= this.nextPhaseAt) {
      // One convergence point per ~2% growth keeps the trail readable in turbo.
      this.pendingPhasePoints.push(this.getPhasePoint());
      this.nextPhaseAt = Math.max(this.checked + 1, Math.ceil(this.checked * 1.02));
    }
    return changed;
  }

  getCollisionCount() {
    return `${this.squarefree}/${this.checked}`;
  }

  getCountLabel() {
    return 'Squarefree / checked';
  }

  getPiApproximation() {
    return this.squarefree > 0 ? Math.sqrt(6 * this.checked / this.squarefree) : 0;
  }

  getPiReadout() {
    return this.squarefree > 0 ? this.getPiApproximation().toFixed(8) : 'n/a';
  }

  getFormulaHTML() {
    const c = this.strikeCounts;
    const d = this.checked > 0 ? this.squarefree / this.checked : 0;
    const live = this.squarefree > 0 ? piDigitsHTML(this.getPiApproximation(), 6) : 'sieving…';
    const biggest = this.maxStrikeP >= 7
      ? ` &nbsp;<span class="f-muted">largest so far: ${this.maxStrikeP}² = ${this.maxStrikeP * this.maxStrikeP}</span>`
      : '';
    return `
      <strong>square-free sieve</strong>:
      <span class="f-angle">S(n)/n → ∏ₚ(1 − 1/p²) = 6/π²</span><br>
      <span style="color:#e94560">■</span> 4 ×${c[0]}
      &nbsp;<span style="color:#f7c948">■</span> 9 ×${c[1]}
      &nbsp;<span style="color:#4cc9f0">■</span> 25 ×${c[2]}
      &nbsp;<span style="color:#9d6bff">■</span> p²≥49 ×${c[3]}
      &nbsp;<span style="color:#7CFC8A">■</span> squarefree ×${this.squarefree}${biggest}<br>
      density <span class="f-count">${this.squarefree}</span> / <span class="f-count">${this.checked}</span>
      = <span class="f-count">${d.toFixed(4)}</span>
      <span class="f-muted">(target 6/π² = ${REF.toFixed(4)})</span><br>
      <span class="f-result">π</span> ≈ √(6n / S) =
      <span style="font-size:1.1em">${live}</span>
    `;
  }

  getPhasePoint() {
    if (this.checked === 0) return [...this.lastPhasePoint];
    const est = this.getPiApproximation();
    const cx = clamp(Math.log10(Math.max(this.checked, 1)) / 5 * 2 - 1, -1, 1);
    const cy = clamp((est - Math.PI) / Math.PI * 50, -1, 1);
    const dx = (this.checked / this.N) * 2 - 1;
    const dy = clamp((this.squarefree / this.checked - REF) / 0.1, -1, 1);
    this.lastPhasePoint = [cx, cy, dx, dy];
    return [cx, cy, dx, dy];
  }

  getPhaseExtractor(viewId) {
    if (viewId === 'n-density') return (pt) => [pt[2], pt[3]];
    return (pt) => [pt[0], pt[1]];
  }

  getPreviewBox() {
    return { x0: -0.03, x1: 1.03, y0: STRIP_BOT - 0.03, y1: GRID_H + 0.06 };
  }

  mapD(d) {
    return STRIP_BOT + (clamp(d, DMIN, DMAX) - DMIN) / (DMAX - DMIN) * (STRIP_TOP - STRIP_BOT);
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.03, 1.03, GRID_H + 0.06, STRIP_BOT - 0.03, 0.1, 10);
    this.simCamera.position.z = 1;

    // Instanced cell grid: fixed window of ROWS×COLS quads; only the per-cell
    // colours change as the window scrolls. No per-frame allocation.
    const cellGeom = new THREE.PlaneGeometry(CELL * 0.86, CELL * 0.86);
    const cellMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.cellMesh = new THREE.InstancedMesh(cellGeom, cellMat, ROWS * COLS);
    const mtx = new THREE.Matrix4();
    const dim = new THREE.Color(COL_DIM[0], COL_DIM[1], COL_DIM[2]);
    for (let vr = 0; vr < ROWS; vr++) {
      for (let col = 0; col < COLS; col++) {
        const idx = vr * COLS + col;
        mtx.makeTranslation((col + 0.5) * CELL, GRID_H - (vr + 0.5) * CELL, 0);
        this.cellMesh.setMatrixAt(idx, mtx);
        this.cellMesh.setColorAt(idx, dim);
      }
    }
    this.cellMesh.instanceMatrix.needsUpdate = true;
    this.simScene.add(this.cellMesh);

    // White frame around the integer currently under test.
    this.cursorGeom = new THREE.BufferGeometry();
    this.cursorGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
    this.cursorFrame = new THREE.LineLoop(
      this.cursorGeom,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
    );
    this.cursorFrame.position.z = 0.02;
    this.simScene.add(this.cursorFrame);

    // Density strip frame.
    const framePts = [
      new THREE.Vector3(0, STRIP_BOT, 0), new THREE.Vector3(1, STRIP_BOT, 0),
      new THREE.Vector3(1, STRIP_TOP, 0), new THREE.Vector3(0, STRIP_TOP, 0),
    ];
    this.simScene.add(new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(framePts),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 })
    ));

    // 6/π² reference line.
    const yRef = this.mapD(REF);
    this.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, yRef, 0), new THREE.Vector3(1, yRef, 0)
      ]),
      new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.75 })
    ));

    // Running-density polyline (one sample every N/512 integers spans the run).
    this.densGeom = new THREE.BufferGeometry();
    this.densGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(HIST * 3), 3));
    this.densGeom.setDrawRange(0, 0);
    this.simScene.add(new THREE.Line(
      this.densGeom,
      new THREE.LineBasicMaterial({ color: 0x7cfc8a, transparent: true, opacity: 0.9 })
    ));

    this.densDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.008, 16),
      new THREE.MeshBasicMaterial({ color: 0x7cfc8a })
    );
    this.densDot.visible = false;
    this.densDot.position.z = 0.02;
    this.simScene.add(this.densDot);
  }

  updateSimScene() {
    if (!this.cellMesh) return;
    const colAttr = this.cellMesh.instanceColor;
    if (!colAttr) return;
    const arr = colAttr.array;
    const cursorRow = Math.floor((Math.min(this.cursor, this.N) - 1) / COLS);
    const baseRow = Math.max(0, cursorRow - ROWS + 1);
    const bt = this.boardTime;

    for (let vr = 0; vr < ROWS; vr++) {
      for (let col = 0; col < COLS; col++) {
        const idx = vr * COLS + col;
        const n = (baseRow + vr) * COLS + col + 1;
        let r = COL_DIM[0], g = COL_DIM[1], b = COL_DIM[2];
        if (n <= this.N) {
          const flag = this.flags[n];
          if (flag === 1) {
            const f = clamp(1 - (bt - this.struckAt[n]) / FLASH, 0, 1);
            r = COL_SF[0] + (COL_SF_HI[0] - COL_SF[0]) * f;
            g = COL_SF[1] + (COL_SF_HI[1] - COL_SF[1]) * f;
            b = COL_SF[2] + (COL_SF_HI[2] - COL_SF[2]) * f;
          } else if (flag === 2) {
            const base = STRIKE_COLS[this.strikeP[n]] || COL_OTHER;
            const s = 0.45 + 0.55 * clamp(1 - (bt - this.struckAt[n]) / FLASH, 0, 1);
            r = base[0] * s; g = base[1] * s; b = base[2] * s;
          }
        }
        const j = idx * 3;
        arr[j] = r; arr[j + 1] = g; arr[j + 2] = b;
      }
    }
    colAttr.needsUpdate = true;

    // Cursor frame on the integer being tested.
    if (!this.finished && this.cursor <= this.N) {
      const col = (this.cursor - 1) % COLS;
      const vr = Math.floor((this.cursor - 1) / COLS) - baseRow;
      const cx = (col + 0.5) * CELL;
      const cy = GRID_H - (vr + 0.5) * CELL;
      const h = CELL * 0.5;
      const cArr = this.cursorGeom.attributes.position.array;
      cArr[0] = cx - h; cArr[1] = cy - h;
      cArr[3] = cx + h; cArr[4] = cy - h;
      cArr[6] = cx + h; cArr[7] = cy + h;
      cArr[9] = cx - h; cArr[10] = cy + h;
      this.cursorGeom.attributes.position.needsUpdate = true;
      this.cursorFrame.visible = true;
    } else {
      this.cursorFrame.visible = false;
    }

    // Running-density strip.
    const dArr = this.densGeom.attributes.position.array;
    for (let i = 0; i < this.histLen; i++) {
      dArr[i * 3] = this.histLen > 1 ? i / (HIST - 1) : 0;
      dArr[i * 3 + 1] = this.mapD(this.densityHist[i]);
      dArr[i * 3 + 2] = 0.01;
    }
    this.densGeom.attributes.position.needsUpdate = true;
    this.densGeom.setDrawRange(0, this.histLen);
    if (this.histLen > 0) {
      this.densDot.visible = true;
      this.densDot.position.set((this.histLen - 1) / (HIST - 1), this.mapD(this.densityHist[this.histLen - 1]), 0.02);
    } else {
      this.densDot.visible = false;
    }
  }
}

registerSim(SquareFreeSieve);
