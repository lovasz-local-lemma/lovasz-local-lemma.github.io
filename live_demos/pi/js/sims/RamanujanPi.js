import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

const TIME_SCALE = 16.7;     // board-seconds per sim-second (house convention)
const LEIB_RATE = 800;       // Leibniz terms per board-second
const TAPE_DIGITS = 56;
const PULSE_SEC = 0.9;

// π reference for display/checking ONLY — the series never reads it.
const PI_60 = '3.141592653589793238462643383279502884197169399375105820974944';
const PI_REF = PI_60.replace('.', '');

// 72-digit fixed point. Doubles top out at ~16 digits; Ramanujan adds ~8 digits
// per TERM, so the series core must be exact BigInt.
const SCALE = 10n ** 72n;

function isqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length >> 1) + 1);  // guaranteed > √n
  let y = (x + n / x) >> 1n;
  while (y < x) { x = y; y = (x + n / x) >> 1n; }
  return x;
}
const SQRT2_FP = isqrt(2n * SCALE * SCALE);   // √2·SCALE, exact

// How many leading digits of a digit string agree with π.
function lockedDigits(str) {
  const n = Math.min(str.length, PI_REF.length);
  let i = 0;
  while (i < n && str[i] === PI_REF[i]) i++;
  return i;
}

// Scene layout: digit tape on top (two rows of 28 cells), race bars below.
const TAPE_X0 = -1.08, TAPE_COLS = 28, TAPE_DX = 2.16 / TAPE_COLS;
const ROW_Y = [0.60, 0.45];
const CELL_W = 0.064, CELL_H = 0.105;
const BAR_X0 = -1.05, BAR_W = 2.10, BAR_H = 0.10;
const BAR_Y_R = -0.26, BAR_Y_L = -0.52;

export class RamanujanPi extends Simulation {
  static id = 'ramanujan-pi';
  static title = 'Ramanujan Engine — 8 digits per term';
  static description = 'Ramanujan\'s 1/π series locks ~8 digits of π with every term — raced against crawling Leibniz';
  static piMechanism = 'series: 1/π = (2√2/9801)Σ(4k)!(1103+26390k)/((k!)⁴396⁴ᵏ) — ~8 digits/term';
  static rigor = 'Exact';
  static piNature = 'exact';
  static piLabel = 'π ≈';
  static sortOrder = 69;
  static previewSteps = 400;
  static alternatives = [{ id: 'leibniz-walk', label: 'The slow series it races' }];
  static explanation = {
    setup: 'In 1917 Ramanujan wrote down this 1/π series with no proof attached — the proof arrived decades later. The constants 9801, 1103 and 26390 are not arbitrary: they fall out of deep modular-function theory (class invariants of the number 58), which is exactly why the series converges so absurdly fast. Here each landed term is an exact BigInt event: 72-digit fixed-point arithmetic, no floating point in the engine.',
    insight: 'Each term multiplies the accuracy by roughly 10⁸ — every landing locks ~8 more decimal digits. Digit production is LINEAR in terms. Leibniz\'s 4(1 − 1/3 + 1/5 − …) produces digits only LOGARITHMICALLY: every additional digit costs about 10× more terms than the previous one.',
    contrast: 'Leibniz needs ~10⁸ terms to match what one Ramanujan term delivers. The Chudnovsky brothers\' refinement of the same modular-function idea yields ~14 digits per term — it is how every record π computation works today.',
    formula: '1/π = (2√2/9801) Σₖ (4k)!(1103 + 26390k)/((k!)⁴·396⁴ᵏ)  [EXACT]',
    getExpected: () => 'Digits of π locked after each term (exact BigInt): k=0 → 7, k=1 → 16, k=2 → 24, k=3 → 32, k=4 → 40, k=5 → 48, k=6 → 54, k=7 → 61 — a clean ~8-digit staircase (asymptotic slope 7.98 digits/term), filling the whole 56-cell tape by the eighth term. Leibniz after 10,000 terms is still stuck near 4.'
  };

  constructor(params = {}) {
    super(params);
    this.termRate = params.termRate || 0.5;
    this.maxTerms = params.maxTerms || 8;
    this.reset();
  }

  reset() {
    super.reset();
    this.termCount = 0;
    this.S = 0n;            // Σ termₖ · SCALE (exact)
    this.piStr = '';        // digit string of the fixed-point π estimate
    this.digitsR = 0;
    this.leibSum = 0;
    this.leibTerms = 0;
    this.digitsL = 0;
    this.ramCarry = 0;
    this.leibCarry = 0;
    this.nextLeibMilestone = 1;
    this._pulseFrom = 0;
    this._pulseTo = 0;
    this._pulseStart = -1e9;
    this._dispR = 0;
    this._dispL = 0;
    this._lastDraw = 0;
    this.finished = false;  // never finishes: Leibniz keeps crawling
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'termRate', label: 'Terms/s (Ramanujan)',
        min: 0.2, max: 5, step: 0.1, default: this.termRate, highlight: true,
        onChange: (val) => { this.termRate = val; }
      },
      {
        type: 'slider', id: 'maxTerms', label: 'Max terms',
        min: 1, max: 8, step: 1, default: this.maxTerms,
        onChange: (val) => { this.maxTerms = val; }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'digits', label: 'digit production race', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'terms (R) / log terms (L)', y: 'digits locked /56' }
      }
    ];
  }

  step(dt) {
    const t = dt * TIME_SCALE;
    let landed = false;

    if (this.termCount < this.maxTerms) {
      this.ramCarry += this.termRate * t;
      let m = Math.floor(this.ramCarry);
      this.ramCarry -= m;
      for (; m > 0 && this.termCount < this.maxTerms; m--) {
        this._landTerm();
        landed = true;
      }
    } else {
      this.ramCarry = 0;
    }

    this.leibCarry += LEIB_RATE * t;
    let lm = Math.floor(this.leibCarry);
    this.leibCarry -= lm;
    if (lm > 0) {
      for (; lm > 0; lm--) {
        this.leibSum += (this.leibTerms % 2 === 0 ? 1 : -1) / (2 * this.leibTerms + 1);
        this.leibTerms++;
      }
      this.digitsL = lockedDigits((4 * this.leibSum).toFixed(14).replace('.', ''));
      if (this.leibTerms >= this.nextLeibMilestone) {
        this.pendingPhasePoints.push([
          Math.log10(this.leibTerms) / 8 * 2 - 1,
          Math.min(this.digitsL, TAPE_DIGITS) / TAPE_DIGITS * 2 - 1,
        ]);
        this.nextLeibMilestone = Math.max(this.leibTerms + 1, Math.ceil(this.leibTerms * 1.02));
      }
    }

    this.collisionCount = this.termCount;
    return landed;
  }

  // One Ramanujan term, exact: (4k)!(1103+26390k) / ((k!)⁴·396⁴ᵏ) in SCALE units.
  _landTerm() {
    const k = BigInt(this.termCount);
    let f4 = 1n;
    for (let i = 4n * k; i > 1n; i--) f4 *= i;   // (4k)!  (k ≤ 8, tiny)
    let fk = 1n;
    for (let i = k; i > 1n; i--) fk *= i;        // k!
    this.S += (f4 * (1103n + 26390n * k) * SCALE) / (fk ** 4n * 396n ** (4n * k));
    this.termCount++;

    const invPi = (2n * SQRT2_FP * this.S) / (9801n * SCALE);  // ≈ SCALE/π
    this.piStr = ((SCALE * SCALE) / invPi).toString();         // ≈ π·SCALE → '3141…'

    const prev = Math.min(this.digitsR, TAPE_DIGITS);
    this.digitsR = lockedDigits(this.piStr);
    this._pulseFrom = prev;
    this._pulseTo = Math.min(this.digitsR, TAPE_DIGITS);
    this._pulseStart = performance.now();

    this.pendingPhasePoints.push([
      this.termCount / 8 * 2 - 1,
      Math.min(this.digitsR, TAPE_DIGITS) / TAPE_DIGITS * 2 - 1,
    ]);
  }

  getCountLabel() { return 'Terms'; }

  getPiApproximation() {
    if (!this.piStr) return 0;
    return parseFloat(this.piStr[0] + '.' + this.piStr.slice(1, 16));
  }

  getPiReadout() {
    if (!this.piStr) return 'priming…';
    return this.piStr[0] + '.' + this.piStr.slice(1, 12);
  }

  getFormulaHTML() {
    const locked = Math.min(this.digitsR, TAPE_DIGITS);
    const ds = PI_REF.slice(0, TAPE_DIGITS);
    let green = ds.slice(0, locked);
    let gray = ds.slice(locked);
    if (locked >= 1) green = green[0] + '.' + green.slice(1);
    else gray = gray[0] + '.' + gray.slice(1);
    const exhausted = this.termCount >= this.maxTerms
      ? '<br><span class="f-muted">series exhausted at the display precision</span>' : '';
    return `
      <span class="f-result">1/π</span> = (2√2/9801) Σₖ
      <span class="f-angle">(4k)!(1103 + 26390k) / ((k!)⁴·396⁴ᵏ)</span><br>
      <span style="font-family:monospace;font-size:1.05em;letter-spacing:0.04em;word-break:break-all">
        <span style="color:#7CFC8A;font-weight:bold">${green}</span><span style="color:#666">${gray}</span>
      </span><br>
      Ramanujan: <span class="f-count">${this.termCount}</span> terms →
      <span style="color:#7CFC8A;font-weight:bold">${this.digitsR}</span> digits locked
      &nbsp;|&nbsp; Leibniz: <span class="f-count">${this.leibTerms}</span> terms →
      <span style="color:#ef476f;font-weight:bold">${this.digitsL}</span> digits
      (${piDigitsHTML(4 * this.leibSum, 8)})${exhausted}
    `;
  }

  getPhasePoint() {
    return [
      this.termCount / 8 * 2 - 1,
      Math.min(this.digitsR, TAPE_DIGITS) / TAPE_DIGITS * 2 - 1,
    ];
  }

  getPhaseExtractor() {
    return (pt) => pt;
  }

  getPreviewBox() {
    return { x0: -1.12, x1: 1.12, y0: -0.72, y1: 0.76 };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-1.15, 1.15, 0.8, -0.8, 0.1, 10);
    this.simCamera.position.z = 1;

    // Digit tape: 56 cells that flip dark → green as digits lock (the digit
    // characters themselves live in the formula panel, where HTML can do text).
    this.matDark = new THREE.MeshBasicMaterial({ color: 0x252a40 });
    this.matGreen = new THREE.MeshBasicMaterial({ color: 0x35c46a });
    this.matGold = new THREE.MeshBasicMaterial({ color: 0xf7c948 });
    const cellGeom = new THREE.PlaneGeometry(CELL_W, CELL_H);
    this.cells = [];
    for (let i = 0; i < TAPE_DIGITS; i++) {
      const m = new THREE.Mesh(cellGeom, this.matDark);
      m.position.set(
        TAPE_X0 + ((i % TAPE_COLS) + 0.5) * TAPE_DX,
        ROW_Y[Math.floor(i / TAPE_COLS)], 0);
      this.simScene.add(m);
      this.cells.push(m);
    }

    // Race bar tracks + digit ticks (every digit faint, every 8th = one Ramanujan
    // term's worth = brighter).
    const unit = new THREE.PlaneGeometry(1, 1);
    const trackMat = new THREE.MeshBasicMaterial({ color: 0x1c2136 });
    for (const y of [BAR_Y_R, BAR_Y_L]) {
      const tr = new THREE.Mesh(unit, trackMat);
      tr.position.set(BAR_X0 + BAR_W / 2, y, -0.01);
      tr.scale.set(BAR_W, BAR_H, 1);
      this.simScene.add(tr);
    }
    const faint = [], strong = [];
    for (let d = 0; d <= TAPE_DIGITS; d++) {
      const x = BAR_X0 + d / TAPE_DIGITS * BAR_W;
      for (const y of [BAR_Y_R, BAR_Y_L]) {
        (d % 8 === 0 ? strong : faint).push(
          new THREE.Vector3(x, y - BAR_H * 0.72, 0.02),
          new THREE.Vector3(x, y + BAR_H * 0.72, 0.02));
      }
    }
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(faint),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })));
    this.simScene.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(strong),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.38 })));

    this.barR = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: 0x35c46a }));
    this.barL = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: 0xef476f }));
    this.barR.position.set(BAR_X0, BAR_Y_R, 0.01);
    this.barL.position.set(BAR_X0, BAR_Y_L, 0.01);
    for (const b of [this.barR, this.barL]) {
      b.scale.set(1e-4, BAR_H * 0.78, 1);
      this.simScene.add(b);
    }
  }

  updateSimScene() {
    if (!this.cells) return;
    const now = performance.now();
    const dtv = this._lastDraw ? Math.min((now - this._lastDraw) / 1000, 0.1) : 0.016;
    this._lastDraw = now;

    // Tape: locked cells green; the freshly locked block pulses gold and pops.
    const lockedR = Math.min(this.digitsR, TAPE_DIGITS);
    const age = (now - this._pulseStart) / 1000;
    const pulse = age < PULSE_SEC ? 1 - age / PULSE_SEC : 0;
    for (let i = 0; i < TAPE_DIGITS; i++) {
      const c = this.cells[i];
      const fresh = pulse > 0 && i >= this._pulseFrom && i < this._pulseTo;
      c.material = i < lockedR ? (fresh ? this.matGold : this.matGreen) : this.matDark;
      const s = fresh ? 1 + 0.35 * pulse : 1;
      c.scale.set(s, s, 1);
    }

    // Race bars ease toward their true digit counts.
    const ease = 1 - Math.exp(-dtv * 6);
    this._dispR += (lockedR - this._dispR) * ease;
    this._dispL += (Math.min(this.digitsL, TAPE_DIGITS) - this._dispL) * ease;
    const wR = Math.max(this._dispR / TAPE_DIGITS * BAR_W, 1e-4);
    const wL = Math.max(this._dispL / TAPE_DIGITS * BAR_W, 1e-4);
    this.barR.scale.x = wR;
    this.barR.position.x = BAR_X0 + wR / 2;
    this.barL.scale.x = wL;
    this.barL.position.x = BAR_X0 + wL / 2;
  }
}

registerSim(RamanujanPi);
