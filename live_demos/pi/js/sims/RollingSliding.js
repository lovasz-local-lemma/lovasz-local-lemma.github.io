// js/sims/RollingSliding.js
import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// ONE COUNT, ANY RIGID BODY
//
// A rigid body colliding elastically against a heavy block counts π EXACTLY the
// same as a point mass, because the collision only ever feels the effective
// inertia m_eff = m + I/r². It does not matter HOW that inertia is built.
//
// So the knob here is not a menu of machines — it is the ONE number the physics
// actually cares about: the dimensionless inertia k = I/(m r²), swept
// continuously from 0 to 1. The named rigid bodies are just labelled ticks on
// that axis, not separate code paths:
//
//     k = 0     sliding block (point mass)  → m_eff = m   ← THE CONTROL: Two Blocks
//     k = 2/5   solid sphere                → m_eff = 1.4m
//     k = 1/2   solid disc / cylinder       → m_eff = 1.5m
//     k = 2/3   spherical shell             → m_eff ≈ 1.67m
//     k = 1     hoop / thin ring            → m_eff = 2m
//
// The heavy block is always M = m_eff·100ⁿ, so M/m_eff = 100ⁿ for EVERY k, hence
// α = arctan(√(m_eff/M)) = arctan(10⁻ⁿ) with m_eff cancelled out, hence
// N = ⌊π/α⌋ is the same integer at every k. Sweep the slider: m_eff moves, the
// drawn body morphs, N does not budge. That invariance is the whole card.
//
// (The purely-rotational and geared retellings of the same k = ½ point live on
// as their own hub-hidden cards, 'rotating-discs' and 'gear-rack-counter', and
// are linked as alternatives — they are stories about where the inertia lives,
// not new physics, so they are not separate settings of this slider.)
const BODY_TICKS = [
  { k: 0,     glyph: '0', short: 'block',  name: 'sliding block (point mass)', note: 'I = 0' },
  { k: 2 / 5, glyph: '⅖', short: 'sphere', name: 'solid sphere',               note: 'I = ⅖mr²' },
  { k: 1 / 2, glyph: '½', short: 'disc',   name: 'solid disc / cylinder',      note: 'I = ½mr²' },
  { k: 2 / 3, glyph: '⅔', short: 'shell',  name: 'spherical shell',            note: 'I = ⅔mr²' },
  { k: 1,     glyph: '1', short: 'hoop',   name: 'hoop / thin ring',           note: 'I = mr²' },
];

const DEFAULT_INERTIA = 0.5;   // solid disc — the middle of the axis

// Slider values arrive from the control panel and from the URL hash, so 0 must
// survive (it is the control) and garbage must not.
function clampInertia(v) {
  const k = Number(v);
  if (!Number.isFinite(k)) return DEFAULT_INERTIA;
  return Math.min(1, Math.max(0, k));
}

// Name the body sitting at this point of the inertia axis. Exact ticks get their
// real name; anything else is honestly reported as "between" two of them.
function describeBody(k) {
  for (const t of BODY_TICKS) {
    if (Math.abs(k - t.k) < 5e-3) {
      const exact = Math.abs(k - t.k) < 1e-9;
      return { name: (exact ? '' : '≈ ') + t.name, note: t.note, tick: t };
    }
  }
  let lo = BODY_TICKS[0];
  let hi = BODY_TICKS[BODY_TICKS.length - 1];
  for (const t of BODY_TICKS) if (t.k < k && t.k > lo.k) lo = t;
  for (let i = BODY_TICKS.length - 1; i >= 0; i--) if (BODY_TICKS[i].k > k && BODY_TICKS[i].k < hi.k) hi = BODY_TICKS[i];
  return { name: `wheel between ${lo.short} and ${hi.short}`, note: `I = ${k.toFixed(2)}mr²`, tick: null };
}

export class RollingSliding extends Simulation {
  static id = 'rolling-sliding';
  static previewSteps = 15;   // closest approach
  static title = 'One Count, Any Rigid Body';
  static description = 'One slider sweeps the body\'s inertia I/(m r²) from a sliding block to a hoop — m_eff = m + I/r² absorbs all of it and the π count never moves';
  static piMechanism = 'exact analog: any rigid body reduces to m_eff = m + I/r² → the same π count';
  static rigor = 'Exact Analog';
  static piNature = 'exact';
  static sortOrder = 30;
  static alternatives = [
    { id: 'two-blocks', label: 'The point-mass original (the I=0 control)' },
    { id: 'rotating-discs', label: 'The purely rotational retelling' },
    { id: 'gear-rack-counter', label: 'The geared retelling' },
    { id: 'three-blocks', label: 'The extra dimension (sphere)' },
    { id: 'three-body-pi', label: 'Three free blocks that DO count π' }
  ];
  static explanation = {
    setup: 'A light rigid body (mass m = 1) sits between a wall and a heavy block. ONE slider sets how that mass is distributed: the dimensionless inertia I/(m r²), from 0 (a sliding block — literally Two Blocks, the control) through ⅖ (solid sphere) and ½ (solid disc) to 1 (a hoop, all the mass at the rim). The heavy block is always set to M = m_eff × 100ⁿ, so the mass ratio the collision sees is exactly 100ⁿ.',
    insight: 'The collision only feels the effective inertia m_eff = m + I/r². It does not care HOW you built it. Sweep the slider and m_eff walks from m to 2m, the drawn body morphs from a block to a hoop, the spin appears out of nowhere — and the collision count does not move by one. The proof is one line you can watch in the readout: M is defined as m_eff·100ⁿ, so in α = arctan(√(m_eff/M)) the m_eff cancels, leaving α = arctan(10⁻ⁿ) for every setting. N = ⌊π/α⌋ therefore cannot depend on I.',
    contrast: 'The I = 0 end of the slider is the control: it IS Two Blocks, a momentum CIRCLE with clean digits. Every setting to its right is a different machine handing back the same digits — 31, 314, 3141. Contrast Three Blocks, where a genuine extra degree of freedom lifts the circle to a momentum SPHERE and the digits DO get muddied: bolting on inertia is free, adding a dimension is not.',
    formula: 'π ≈ N / 10ⁿ, because M / m_eff = 100ⁿ for every I ⇒ α = arctan(10⁻ⁿ) ⇒ N = ⌊π/α⌋, independent of I',
    getExpected: (params) => {
      const n = params.n || 2;
      const k = clampInertia(params.inertia);
      const body = describeBody(k);
      const alpha = Math.atan(Math.pow(10, -n));
      // Display-only: Math.PI here is the convergence-truth reference used to
      // state the expected count in prose. The simulation itself never sees it.
      const expected = Math.floor(Math.PI / alpha);
      const mEff = (1 + k).toFixed(3);
      return `For n=${n} at I/(mr²) = ${k.toFixed(2)} (${body.name}, ${body.note}): m_eff = ${mEff}m and M = m_eff·100^${n}. Expect ${expected} collisions, read as ${(expected / Math.pow(10, n)).toFixed(n)}. Now move the inertia slider anywhere from 0 to 1: m_eff and M both change, and ${expected} does not — the count is invariant, and at I = 0 it is exactly the Two Blocks control.`;
    }
  };

  constructor(params = {}) {
    super(params);
    this.n = params.n || 2;
    this.inertia = clampInertia(params.inertia ?? DEFAULT_INERTIA);
    this.initialVelocity = params.velocity || 1;
    // Completed-run ledger: I → final N. Deliberately NOT cleared by reset(), so
    // sweeping the slider and re-running builds a visible column of identical
    // counts. Cleared only when n changes (N legitimately depends on n).
    this.runLog = new Map();
    this.reset();
  }

  reset() {
    super.reset();
    this.m1 = 1;
    this.inertiaFactor = this.inertia;              // k = I/(m r²)
    this.couples = this.inertia > 0;                // k = 0 is a block: nothing spins
    this.bodyDesc = describeBody(this.inertia);     // cached; the readout runs every frame
    this.mEff = this.m1 * (1 + this.inertiaFactor); // m_eff = m + I/r²
    this.m2 = this.mEff * Math.pow(100, this.n);    // M — so M/m_eff = 100ⁿ for EVERY k
    this.r = 0.04;  // body half-extent / rolling radius (visual + collision offset)
    this.x1 = 0.3;  // body center x
    this.x2 = 0.7;  // heavy block left edge x
    this.v1 = 0;
    this.v2 = -this.initialVelocity;
    this.theta = 0; // body rotation angle
    this.omega = 0; // body angular velocity (v = r*omega when coupled)
    this.blockSize2 = Math.min(0.2, 0.06 + 0.02 * this.n);
    this.finished = false;
    this.collisionEffects = [];
  }

  getControls() {
    return [
      {
        // The one knob the physics actually reads. Continuous, because the
        // invariance is a statement about a whole interval, not about five
        // hand-picked machines. Labelled ticks live in the readout strip.
        type: 'slider', id: 'inertia', label: 'Body inertia I/(m r²)',
        min: 0, max: 1, step: 0.01, default: this.inertia, highlight: true,
        onChange: (val) => { this.inertia = clampInertia(val); this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'n', label: 'Digits (100ⁿ)', min: 1, max: 6, step: 1, default: this.n,
        onChange: (val) => { this.n = val; this.runLog.clear(); this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'velocity', label: 'Initial Velocity', min: 0.1, max: 3, step: 0.1, default: this.initialVelocity,
        onChange: (val) => { this.initialVelocity = val; this.reset(); this.initSimScene(); }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'p1-p2',
        label: 'Q_body vs Q_block (effective-mass momentum circle)',
        dimension: 2,
        primary: true,
        axisLabels: {
          x: 'Q_body = sqrt(m_eff) v_body',
          y: 'Q_block = sqrt(M) v_block'
        }
      },
      {
        id: 'rolling-constraint',
        label: 'v_body vs rω (where the inertia lives)',
        dimension: 2,
        primary: false,
        axisLabels: {
          x: 'v_body / v0',
          y: 'rω / v0'
        }
      },
    ];
  }

  /**
   * Event-based collision detection — ONE physics core for the whole slider.
   * Effective mass m_eff = (1 + I/(mr²))·m replaces m1 in the elastic collision
   * formula; M = m_eff·100ⁿ. Exact analytical collision times.
   *
   * The wall reverses v1, and the no-slip constraint ω = v1/r flips ω with it,
   * so ½m_eff v² is conserved there too (an idealized frictionless rolling
   * bounce). At I = 0 nothing rotates and this reduces, line for line, to the
   * Two Blocks integrator.
   */
  step(dt) {
    if (this.finished) return false;
    let remaining = dt;
    let collided = false;
    const now = performance.now();

    while (remaining > 1e-15) {
      // Wall collision: body center reaches r (body edge touches wall at x=0)
      let tWall = Infinity;
      if (this.v1 < 0 && this.x1 > this.r) {
        tWall = (this.x1 - this.r) / (-this.v1);
      }

      // Body-block collision: body right edge meets block left edge
      let tBlock = Infinity;
      const gap = this.x2 - (this.x1 + this.r);
      const closing = this.v1 - this.v2;
      if (closing > 0 && gap > 0) {
        tBlock = gap / closing;
      }

      const tNext = Math.min(tWall, tBlock);

      if (tNext > remaining) {
        this.x1 += this.v1 * remaining;
        this.x2 += this.v2 * remaining;
        this.theta += this.omega * remaining;
        break;
      }

      this.x1 += this.v1 * tNext;
      this.x2 += this.v2 * tNext;
      this.theta += this.omega * tNext;
      remaining -= tNext;

      if (tWall <= tBlock) {
        // Wall: reverse velocity, inertia coupling preserved
        this.x1 = this.r;
        this.v1 = Math.abs(this.v1);
        this.omega = this.couples ? this.v1 / this.r : 0;
        this.collisionCount++;
        this.collisionEffects.push({ x: 0, y: this.r, time: now, type: 'wall' });
      } else {
        // Body-block elastic collision using effective mass for the body
        const mEff = this.mEff;
        const m2 = this.m2;
        const ov1 = this.v1, ov2 = this.v2;
        this.v1 = ((mEff - m2) * ov1 + 2 * m2 * ov2) / (mEff + m2);
        this.v2 = ((m2 - mEff) * ov2 + 2 * mEff * ov1) / (mEff + m2);
        this.x1 = this.x2 - this.r; // body right edge at block left edge
        this.omega = this.couples ? this.v1 / this.r : 0;
        this.collisionCount++;
        this.collisionEffects.push({ x: this.x2, y: this.r, time: now, type: 'block' });
      }
      collided = true;
      // Record the phase point at the exact collision moment so the phase-space
      // trajectory shows a sharp vertex at every reflection (matches TwoBlocks).
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      this.pendingRawPhasePoints.push([...this.getRawPhasePoint()]);
    }

    // Finished: body moving right, block moving right faster (no more collisions)
    if (this.v1 >= 0 && this.v2 > 0 && this.v2 >= this.v1) {
      this.finished = true;
      this.logRun();
    }
    return collided;
  }

  // Ledger of completed runs, keyed by the inertia setting. Run the slider at a
  // few settings and the readout shows the same N next to every one of them.
  logRun() {
    this.runLog.set(this.inertia.toFixed(2), this.collisionCount);
    while (this.runLog.size > 6) this.runLog.delete(this.runLog.keys().next().value);
  }

  getPiApproximation() {
    return this.collisionCount / Math.pow(10, this.n);
  }

  getPiReadout() {
    return this.getPiApproximation().toFixed(this.n + 2);
  }

  getFormulaHTML() {
    const count = this.collisionCount;
    const scale = Math.pow(10, this.n);
    const value = count / scale;
    const body = this.bodyDesc;
    // The invariance, computed live from the CURRENT masses: m_eff cancels
    // between the body and M = m_eff·100ⁿ, so this number never moves.
    const alpha = Math.atan(Math.sqrt(this.mEff / this.m2));
    // ONE top-level block wrapper: `.formula-readout` is itself a flex ROW capped
    // at 520px, so any second top-level node would be laid out BESIDE the text.
    return `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;width:100%;text-align:right">`
      + `<div><strong>same count, any rigid body</strong> — `
      + `<span class="f-mass">I/(m r²) = ${this.inertia.toFixed(2)}</span> · `
      + `<span class="f-mass">${body.name}</span> <span class="f-muted">(${body.note})</span></div>`
      + this.inertiaStripHTML()
      + `<div><span class="f-mass">m_eff = m + I/r² = ${this.mEff.toFixed(3)}m</span> `
      + `<span class="f-muted">moves with the slider</span><br>`
      + `<span class="f-angle">α = atan(√(m_eff/M)) = atan(10^−${this.n}) = ${alpha.toExponential(4)}</span> `
      + `<span class="f-muted">does not</span></div>`
      + `<div><span class="f-count" style="font-size:1.15em">N = ${count}</span> `
      + `<span class="f-muted">collisions</span> · `
      + `<span class="f-result">π digits</span> ≈ `
      + `<span class="f-count">${count}</span>/<span class="f-angle">10^${this.n}</span> = `
      + `<span style="font-size:1.1em">${piDigitsHTML(value, this.n + 2)}</span></div>`
      + this.runLogHTML()
      + `<div class="f-muted">M ≡ m_eff·100^${this.n}, so m_eff cancels out of α and N = ⌊π/α⌋ cannot depend on I. `
      + `Sweep the slider from block to hoop: m_eff, the drawn body and the spin all change — N does not move by one. `
      + `The I = 0 end is the control; it is exactly Two Blocks.</div>`
      + `</div>`;
  }

  // Labelled tick strip for the continuous inertia axis (the control panel's
  // slider can only show a bare number, so the named rungs live here).
  inertiaStripHTML() {
    const W = 268, H = 46, xa = 12, xb = 254, yAxis = 13;
    const px = (k) => xa + k * (xb - xa);
    let ticks = '';
    for (let i = 0; i < BODY_TICKS.length; i++) {
      const t = BODY_TICKS[i];
      const x = px(t.k);
      const xs = x.toFixed(1);
      const ty = (i % 2 === 0) ? 29 : 41;   // stagger, so ⅖ and ½ never collide
      const hot = Math.abs(this.inertia - t.k) < 5e-3;
      ticks += `<line x1="${xs}" y1="7" x2="${xs}" y2="19" stroke="currentColor" opacity="${hot ? 0.9 : 0.5}"/>`
        + `<line x1="${xs}" y1="19" x2="${xs}" y2="${ty - 7}" stroke="currentColor" opacity="0.18"/>`
        + `<text x="${xs}" y="${ty}" font-size="8" text-anchor="middle" `
        + `fill="${hot ? '#e94560' : 'currentColor'}" opacity="${hot ? 1 : 0.75}">${t.glyph} ${t.short}</text>`;
    }
    const m = px(this.inertia);
    return `<svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%;max-width:300px;overflow:visible;color:inherit">`
      + `<line x1="${xa}" y1="${yAxis}" x2="${xb}" y2="${yAxis}" stroke="currentColor" opacity="0.45"/>`
      + ticks
      + `<polygon points="${m.toFixed(1)},${yAxis} ${(m - 4.5).toFixed(1)},3 ${(m + 4.5).toFixed(1)},3" fill="#e94560"/>`
      + `</svg>`;
  }

  runLogHTML() {
    if (this.runLog.size === 0) return '';
    const rows = [...this.runLog.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
    const first = rows[0][1];
    const allSame = rows.every((row) => row[1] === first);
    const cells = rows.map(([k, N]) => `I=${k}→<span class="f-count">N=${N}</span>`).join(' · ');
    const verdict = rows.length < 2
      ? '<span class="f-muted">(move the inertia slider and run again)</span>'
      : (allSame
        ? '<span class="f-result">identical ✓</span>'
        : '<span class="f-warning">counts differ — that would be a bug</span>');
    return `<div style="font-size:.9em"><span class="f-muted">completed runs at n=${this.n}:</span> ${cells} ${verdict}</div>`;
  }

  getPhasePoint() {
    // Use effective mass in rescaled momentum → the momentum circle
    const q1 = Math.sqrt(this.mEff) * this.v1;
    const q2 = Math.sqrt(this.m2) * this.v2;
    const R = Math.sqrt(this.m2) * this.initialVelocity;
    const vScale = this.initialVelocity || 1;
    return [
      q1 / R,
      q2 / R,
      this.v1 / vScale,
      (this.omega * this.r) / vScale,
    ];
  }

  getRawPhasePoint() {
    // p1 = mEff * v1 (effective momentum), p2 = m2 * v2
    const p1 = this.mEff * this.v1;
    const p2 = this.m2 * this.v2;
    const R = this.m2 * this.initialVelocity;
    return [p1 / R, p2 / R];
  }

  getPhaseExtractor(viewId) {
    if (viewId === 'rolling-constraint') {
      return (pt) => [pt[2], pt[3]];
    }
    return (pt) => [pt[0], pt[1]];
  }

  // Hub thumbnail focus: wall + body + block.
  getPreviewBox() {
    const x1 = Math.max(0.55, this.x2 + this.blockSize2 + 0.1);
    return { x0: -0.07, x1, y0: -0.05, y1: 0.3 };
  }

  // --- Three.js rendering ---
  //
  // TWO drawn bodies share the same collider (half-extent r, so both meet the
  // wall and the block at exactly x1 ± r) and cross-fade as the slider moves:
  //   • the sliding block — solid at I = 0, then a faint ghost square that stays
  //     put as a reminder that the control is still sitting under the picture;
  //   • the wheel — invisible at I = 0, fading in and redistributing its mass
  //     from the axis to the rim as I grows.

  // Honest mass distribution: a uniform ring of radii a ≤ b spinning about the
  // contact radius r has I/(mr²) = (a² + b²)/(2r²). Inverting for the slider
  // value k gives a dense core for k ≤ ½ (mass hugging the axis, k → 0 = point
  // mass) and a rim annulus for k ≥ ½ (mass migrating outward, k = 1 = thin
  // hoop). The branches agree at k = ½, the solid disc, so the morph is smooth.
  massRingRadii(k = this.inertia) {
    const r = this.r;
    if (k <= 0.5) return { inner: 0, outer: r * Math.sqrt(2 * k) };
    return { inner: r * Math.sqrt(2 * k - 1), outer: r };
  }

  // Cross-fade weights for the two drawn bodies.
  costumeMix(k = this.inertia) {
    const w = Math.min(1, k / 0.2);   // wheel fully present by I = 0.2
    return { block: 1 - 0.86 * w, wheel: w };
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.OrthographicCamera(-0.1, 1.2, 0.4, -0.15, 0.1, 10);
    this.simCamera.position.z = 1;

    // Wall
    const wallGeom = new THREE.PlaneGeometry(0.015, 0.5);
    const wall = new THREE.Mesh(wallGeom, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    wall.position.set(-0.0075, 0.1, 0);
    this.simScene.add(wall);

    // Floor
    const floorGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.05, 0, 0), new THREE.Vector3(1.2, 0, 0)
    ]);
    this.simScene.add(new THREE.Line(floorGeom, new THREE.LineBasicMaterial({ color: 0x2a2a4a })));

    // Light body — the block and the wheel, both rebuilt when I changes.
    const mix = this.costumeMix();
    this.slideMesh = this.buildSlideMesh(mix.block);
    this.slideMesh.position.set(this.x1, this.r, -0.002);   // ghost sits behind the wheel
    this.simScene.add(this.slideMesh);

    this.wheelGroup = this.buildWheelGroup(mix.wheel);
    this.wheelGroup.position.set(this.x1, this.r, 0);
    this.simScene.add(this.wheelGroup);

    // Heavy block
    const block2Geom = new THREE.PlaneGeometry(this.blockSize2, this.blockSize2);
    this.block2Mesh = new THREE.Mesh(block2Geom, new THREE.MeshBasicMaterial({
      color: 0xe94560, transparent: true, opacity: 0.7
    }));
    this.block2Mesh.position.y = this.blockSize2 / 2;
    this.simScene.add(this.block2Mesh);

    // Velocity arrows
    this.arrow1 = this.makeArrow(0x4cc9f0);
    this.arrow2 = this.makeArrow(0x4cc9f0);
    this.simScene.add(this.arrow1);
    this.simScene.add(this.arrow2);

    // Collision effect rings (pool of 5)
    this.effectMeshes = [];
    for (let i = 0; i < 5; i++) {
      const ringGeom = new THREE.RingGeometry(0.01, 0.015, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.visible = false;
      this.simScene.add(ring);
      this.effectMeshes.push(ring);
    }
  }

  // The I = 0 control, drawn: a square 2r wide so its edges sit exactly at ±r —
  // the same collider the wheel presents.
  buildSlideMesh(opacity) {
    const g = new THREE.PlaneGeometry(2 * this.r, 2 * this.r);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0xe94560, transparent: true, opacity
    }));
  }

  // The rolling body: rolling-radius outline (fixed), mass ring (moves with I),
  // and a spoke so the rotation reads.
  buildWheelGroup(opacity) {
    const r = this.r;
    const group = new THREE.Group();
    if (opacity <= 0.001) { group.visible = false; return group; }

    const { inner, outer } = this.massRingRadii();
    if (outer > 1e-4) {
      const massGeom = inner > 1e-6
        ? new THREE.RingGeometry(inner, outer, 48)
        : new THREE.CircleGeometry(outer, 48);
      const mass = new THREE.Mesh(massGeom, new THREE.MeshBasicMaterial({
        color: 0xe94560, side: THREE.DoubleSide, transparent: true, opacity: 0.9 * opacity
      }));
      group.add(mass);
    }

    // Rolling radius r — constant while the mass migrates inside it.
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.95, r, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, side: THREE.DoubleSide, transparent: true, opacity: 0.55 * opacity
      })
    );
    rim.position.z = 0.005;
    group.add(rim);

    const tick = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0.01), new THREE.Vector3(r, 0, 0.01)
      ]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity })
    );
    group.add(tick);
    return group;
  }

  makeArrow(color) {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)
    ]);
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color }));
    line.visible = false;
    return line;
  }

  updateSimScene() {
    if (!this.slideMesh) return;

    // Both drawn bodies ride the same center; only the wheel spins.
    this.slideMesh.position.x = this.x1;
    this.slideMesh.position.y = this.r;
    this.wheelGroup.position.x = this.x1;
    this.wheelGroup.position.y = this.r;
    if (this.couples) this.wheelGroup.rotation.z = -this.theta;

    // Block: left edge at x2
    this.block2Mesh.position.x = this.x2 + this.blockSize2 / 2;
    this.block2Mesh.position.y = this.blockSize2 / 2;

    // Velocity arrows
    if (this.showVectors) {
      this.arrow1.visible = true;
      this.arrow2.visible = true;
      const scale = 0.1;
      this.updateArrow(this.arrow1, this.x1, this.r * 2 + 0.02, this.v1 * scale);
      this.updateArrow(this.arrow2, this.x2 + this.blockSize2 / 2, this.blockSize2 + 0.02, this.v2 * scale);
    } else {
      this.arrow1.visible = false;
      this.arrow2.visible = false;
    }

    // Collision pulse effects
    const now = performance.now();
    const EFFECT_DURATION = 300;
    this.collisionEffects = this.collisionEffects.filter(e => now - e.time < EFFECT_DURATION);

    for (let i = 0; i < this.effectMeshes.length; i++) {
      const ring = this.effectMeshes[i];
      if (i < this.collisionEffects.length) {
        const effect = this.collisionEffects[i];
        const progress = (now - effect.time) / EFFECT_DURATION;
        const scale = 1 + progress * 5;
        ring.visible = true;
        ring.position.set(effect.x, effect.y, 0.01);
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = (1 - progress) * 0.8;
        ring.material.color.setHex(effect.type === 'wall' ? 0xffffff : 0x4cc9f0);
      } else {
        ring.visible = false;
      }
    }
  }

  updateArrow(arrow, x, y, length) {
    const positions = arrow.geometry.attributes.position.array;
    positions[0] = x; positions[1] = y; positions[2] = 0;
    positions[3] = x + length; positions[4] = y; positions[5] = 0;
    arrow.geometry.attributes.position.needsUpdate = true;
  }
}

registerSim(RollingSliding);
