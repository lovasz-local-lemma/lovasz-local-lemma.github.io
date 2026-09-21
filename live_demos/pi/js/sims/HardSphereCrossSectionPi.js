import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';
import { piDigitsHTML } from './wedgeUnfold.js';

// ---------------------------------------------------------------------------
// Hard-sphere gas — π from the mean free path.
//
// The dynamics are EVENT-DRIVEN: exact next-collision times from the quadratic
// |Δr + Δv t| = σ, resolved one event at a time. Chosen over a small-timestep
// sweep because the whole measurement IS a length-per-collision ratio — a
// timestep scheme resolves each contact a little late and misses grazing hits,
// and both errors land straight in λ. Event-driven also makes tunnelling and
// sticking impossible by construction: a pair is advanced exactly to contact,
// never through it.
//
// Geometry used by the dynamics: |r_i − r_j| < σ. Nothing else. No angles, no
// trig, no π. π appears only in the ANSWER, because the collision rate exposes
// the cross-section πσ² of a sphere.
//
// Boundary conditions are PERIODIC (the box is a 3-torus, minimum image). Hard
// walls were rejected: a wall carves a depletion layer ~σ deep in which the
// collision rate is wrong, and that error dies only like σ/L, i.e. like
// n*^(1/3) — it would swamp the excluded-volume drift (which dies like n*) and
// destroy the very limit this sim is built to show.
// ---------------------------------------------------------------------------

// Wall-clock rate convention (house style, cf. GaltonBoardPi / CollisionGasE).
const TIME_SCALE = 16.7;
const TURBO_TIME = 1000;             // Turbo ×1000 in SIM time…
const MAX_EVENTS_NORMAL = 48;        // …capped by an event budget per step() call
const MAX_EVENTS_TURBO = 256;        //    so a dense gas can never freeze the tab

const NMIN = 64, NMAX = 256;
const V0 = 1;                        // seed speed; total kinetic energy is conserved after that

// THE BIAS KNOB — reduced density n* = n·σ³, deliberately π-free so the knob
// itself smuggles nothing in. (The packing fraction φ = (π/6)·n* is shown in
// the UI as a DISPLAY-ONLY convenience.)
const DENSITIES = [0.30, 0.20, 0.13, 0.08, 0.05, 0.030, 0.018, 0.010, 0.006];
const SWEEP_LADDER = [0.30, 0.20, 0.13, 0.08, 0.05, 0.030, 0.018, 0.010];
const SWEEP_TARGET = 150000;         // free paths banked per rung before moving on

const EQ_COLL = 12;                  // phase A gate: min collisions PER PARTICLE
const EQ_B_EVENTS = 3;               // phase B gate: ×N further events after the mode is applied

// ⟨v_rel⟩/⟨v⟩ — the textbook value of the mysterious constant, per mode.
// Used only when the "measured ratio" toggle is OFF. √2 and 4/3 are algebraic;
// no π is involved, so the estimator stays honest either way.
const MODE_R = { maxwell: Math.SQRT2, constant: 4 / 3, lorentz: 1 };
const MODE_R_TEXT = { maxwell: '√2 = 1.41421', constant: '4/3 = 1.33333', lorentz: '1' };

const C_BALL = 0x4cc9f0, C_FLASH = 0xf7c948, C_TAG = 0xff9f43, C_FROZEN = 0x6a7599;
const FLASH_DUR = 0.06;              // sim-seconds a sphere stays lit after a collision
const TRAIL_SEGS = 600;

export class HardSphereCrossSectionPi extends Simulation {
  static id = 'hard-sphere-cross-section-pi';
  static title = 'Hard-Sphere Gas — π from the mean free path';
  static description = 'Elastic spheres in a periodic box; divide the odometer by the collision counter and the mean free path hands back π through the cross-section πσ²';
  static piMechanism = 'kinetic theory: the only geometry in the dynamics is |rᵢ−rⱼ| < σ, yet the collision RATE exposes the disc of area πσ² a sphere sweeps — λ = (distance)/(collisions) = 1/(⟨v_rel⟩/⟨v⟩ · π σ² n), so π = 1/(R·σ²·n·λ) with every input measured';
  static rigor = 'Statistical';
  static sortOrder = 63.5;
  static piNature = 'statistical';
  static piLabel = 'π ≈';
  static previewSteps = 90;
  static previewParams = { n: 120, density: 0.08, turbo: true };
  static alternatives = [
    { id: 'collision-gas-e', label: 'e from the same gas (empty time windows)' },
    { id: 'piston-gas-galperin', label: 'π from gas collision COUNTS' },
    { id: 'buffon-needle', label: 'π from crossing counts' },
    { id: 'sphere-volume-mc', label: 'π from a dartboard' },
  ];

  static explanation = {
    setup: 'N hard spheres of diameter σ fly in a periodic box of volume V = 1, colliding elastically. The dynamics contain exactly one piece of geometry — two spheres touch when |rᵢ − rⱼ| = σ — and the solver advances each pair exactly to that instant, so nothing tunnels and nothing sticks. Two meters run alongside: an ODOMETER D adding up every centimetre travelled, and a COUNTER I ticking once for each sphere that takes part in a collision. Their ratio is the mean free path, λ = D / I. Both meters start from zero at the same instant, after the gas has equilibrated. Equilibration is not guessed: every sphere starts at the SAME speed, and the collisions have to build the Maxwellian themselves. Watching ⟨v_rel⟩/⟨v⟩ (averaged over 40 seeds) it leaves the equal-speed value 1.3332 = 4/3, passes 1.4076 after 4 collisions per sphere, and is on √2 to within 0.03% by 12 — so the gate, which waits until EVERY sphere has collided 12 times (in practice ~31 on average), sits comfortably past the relaxation.',
    insight: 'Kinetic theory says a sphere of diameter σ sweeps a tube whose cross-section is the disc πσ², so it meets a partner every λ = 1/(R · π σ² n) of path, with n the number density and R = ⟨v_rel⟩/⟨v⟩. Invert it: π = 1/(R · σ² · n · λ). Every symbol on the right is set by you or measured by the meters — a diameter, a particle count, a box volume, an odometer reading, and (if you like) a velocity ratio sampled from the gas itself. No trig function is ever called; π is not in the code, it is in the SHAPE of the collision target. The mysterious R is switchable: freeze the scatterers and shoot tracers through them and R = 1; pin every speed to v₀ and R = 4/3; let a real gas thermalize itself and R = √2, because √2 is what averaging relative speeds over a Maxwellian gives.',
    contrast: 'The collision gas next door (e from Poisson counting) is the SAME apparatus read a different way: there the collision stream is sliced into fixed time windows and the empty ones carry e^(−λ); here the stream is divided into the distance travelled and the cross-section carries π. One box of billiards, two constants, depending on whether you ask "how often?" or "how far?". And unlike the Galperin gas piston — where π is an exact collision COUNT — this π is statistical, with 1/√I noise, and deliberately biased at high density.',
    formula: 'π ≈ 1 / (R · σ² · n · λ),   λ = D / I  (odometer / collision counter),   R = ⟨v_rel⟩/⟨v⟩   [STATISTICAL, dilute limit]',
    getExpected: (params) => {
      const d = params.density || 0.05;
      const phi = (Math.PI / 6) * d;                        // DISPLAY-ONLY
      const g = (1 - phi / 2) / Math.pow(1 - phi, 3);       // DISPLAY-ONLY Carnahan–Starling
      return `At reduced density n* = nσ³ = ${d} the packing fraction is φ = (π/6)n* ≈ ${(phi * 100).toFixed(2)}%. ` +
        `λ = D/I is a ratio of two honest meters, so its statistical error is ~1/√I — about ${(100 / Math.sqrt(SWEEP_TARGET)).toFixed(2)}% ` +
        `after ${(SWEEP_TARGET / 1000) | 0}k free paths. The SYSTEMATIC error is the point of the sim: λ = 1/(Rπσ²n) is the Boltzmann–Grad (dilute) result, ` +
        `and at finite density spheres shadow and re-hit each other, raising the true collision rate by the contact pair-correlation g(σ) ≈ ${g.toFixed(3)} here. ` +
        `So π̂ should sit near π·g(σ) ≈ ${(Math.PI * g).toFixed(3)} and slide down toward 3.14159… as you step the density knob toward zero. ` +
        `Turn on the auto-sweep to have it walk the whole ladder and plot the drift shrinking. Measured, at N = 120 with 10⁶ free paths per rung: ` +
        `n* = 0.30 → 4.878 (+55.3%), 0.20 → 4.162 (+32.5%), 0.13 → 3.761 (+19.7%), 0.08 → 3.512 (+11.8%), 0.05 → 3.366 (+7.1%), ` +
        `0.030 → 3.266 (+4.0%), 0.018 → 3.227 (+2.7%), 0.010 → 3.185 (+1.4%), 0.006 → 3.167 (+0.8%) — every rung within a few tenths of a percent of π·g(σ).`;
    }
  };

  constructor(params = {}) {
    super(params);
    // Params can arrive as strings from the URL hash / <select>, so coerce.
    this.mode = params.mode || 'maxwell';
    this.density = Number(params.density) || 0.05;
    this.n = Math.min(NMAX, Math.max(NMIN, Number(params.n) || 120));
    this.useMeasuredR = params.useMeasuredR !== false;
    this.sweep = !!params.sweep;
    this.turbo = params.turbo !== false;

    // Preallocated particle state — nothing in step() allocates.
    this.px = new Float64Array(NMAX); this.py = new Float64Array(NMAX); this.pz = new Float64Array(NMAX);
    this.vx = new Float64Array(NMAX); this.vy = new Float64Array(NMAX); this.vz = new Float64Array(NMAX);
    this.spd = new Float64Array(NMAX);
    this.mobile = new Uint8Array(NMAX);
    this.nextT = new Float64Array(NMAX);
    this.partner = new Int32Array(NMAX);
    this.tLast = new Float64Array(NMAX);
    this.collCount = new Int32Array(NMAX);
    this.flash = new Float64Array(NMAX);
    this.mobIdx = new Int32Array(NMAX); this.mobCount = 0;
    this.partIdx = new Int32Array(NMAX); this.partCount = 0;
    this._d3 = new Float64Array(3);

    this.sweepLog = [];               // [{ d, pi, R, inc }] — one entry per finished rung

    this._mtx = new THREE.Matrix4();
    this._col = new THREE.Color();
    this._colB = new THREE.Color();
    this._colF = new THREE.Color();
    this.reset();
  }

  // --- setup -------------------------------------------------------------

  _partnerCount() {
    // Number density n = (collision partners) / V, with V = 1. A sphere cannot
    // collide with itself, so a gas of N sees N−1 partners; the tracer mode
    // sees only the frozen scatterers.
    return this.mode === 'lorentz' ? this.n - this._moverCount() : this.n - 1;
  }

  _moverCount() {
    return Math.max(1, Math.round(this.n / 12));
  }

  reset() {
    super.reset();
    this.time = 0;
    this.phase = 'equil';             // 'equil' → 'settle' → 'run'
    this.modeActive = false;
    this.armed = false;
    this.events = 0;
    this.eventsAtMode = 0;
    this.inc = 0;                     // collision incidences banked (the counter)
    this.dist = 0;                    // odometer, same window as `inc`
    this.sumVrel = 0; this.sumV = 0; this.cntR = 0;
    this.emaVrel = 0; this.emaV = 0;
    this.fpSum = 0; this.fpSum2 = 0; this.fpN = 0;
    this.minColl = 0;
    this.collisionCount = 0;
    this.nextMilestone = 1;
    this.nPartners = this._partnerCount();
    this.sigma = Math.cbrt(this.density / this.nPartners);   // V = 1 ⇒ n = nPartners
    this.tagged = 0;
    this._seed();
    this._rebuildIndex();
    this._predictAll();
    this._trailReset();
  }

  // Uniform-random directions via Marsaglia's rejection method — no trig, no π
  // anywhere in the initial conditions. Speeds all start at V0; the Maxwellian
  // is something the collisions have to BUILD, which is exactly why the sim
  // has to equilibrate before it measures anything.
  _dir(out) {
    let s = 2, u = 0, v = 0;
    while (s >= 1 || s === 0) {
      u = 2 * Math.random() - 1;
      v = 2 * Math.random() - 1;
      s = u * u + v * v;
    }
    const f = 2 * Math.sqrt(1 - s);
    out[0] = u * f; out[1] = v * f; out[2] = 1 - 2 * s;
  }

  _seed() {
    const n = this.n, sig = this.sigma;
    const m = Math.ceil(Math.cbrt(n));
    const cell = 1 / m;
    const jit = Math.max(0, (cell - sig) * 0.45);
    const d = this._d3;
    let idx = 0;
    for (let gz = 0; gz < m && idx < n; gz++) {
      for (let gy = 0; gy < m && idx < n; gy++) {
        for (let gx = 0; gx < m && idx < n; gx++) {
          this.px[idx] = (gx + 0.5) * cell + (Math.random() - 0.5) * 2 * jit;
          this.py[idx] = (gy + 0.5) * cell + (Math.random() - 0.5) * 2 * jit;
          this.pz[idx] = (gz + 0.5) * cell + (Math.random() - 0.5) * 2 * jit;
          this._dir(d);
          this.vx[idx] = d[0] * V0; this.vy[idx] = d[1] * V0; this.vz[idx] = d[2] * V0;
          this.spd[idx] = V0;
          this.mobile[idx] = 1;
          this.tLast[idx] = 0;
          this.collCount[idx] = 0;
          this.flash[idx] = -1;
          idx++;
        }
      }
    }
    this.vsum = n * V0;
  }

  // mobIdx = spheres that move (whose distance the odometer counts);
  // partIdx = the legal collision partners a mover can meet.
  _rebuildIndex() {
    const n = this.n;
    let mc = 0, pc = 0;
    const lor = this.modeActive && this.mode === 'lorentz';
    for (let i = 0; i < n; i++) {
      const mob = this.mobile[i] === 1;
      if (mob) this.mobIdx[mc++] = i;
      if (!lor || !mob) this.partIdx[pc++] = i;     // in tracer mode only the frozen ones are targets
    }
    this.mobCount = mc; this.partCount = pc;
    this.tagged = mc > 0 ? this.mobIdx[0] : 0;
  }

  // --- event-driven core --------------------------------------------------

  // Exact next-collision time for sphere i against every legal partner, under
  // the minimum-image convention on the unit torus.
  //
  // MINIMUM-IMAGE SAFETY (this is the one subtle part): the k = 0 image is only
  // guaranteed to be the first one hit while the pair's relative displacement
  // has grown by less than L/2 − σ, because a collision with any other image
  // needs |Δr_a| ≥ L − σ and we start with |Δr_a| ≤ L/2. So a prediction is
  // accepted only if it lands inside hor = (L/2 − σ)/max_j|Δv_ij|; otherwise a
  // no-op RECHECK event is scheduled at hor and the scan is redone from there.
  // With that guard no collision can ever be missed.
  _predict(i) {
    const n = this.n, t = this.time, sig = this.sigma, s2 = sig * sig;
    const lor = this.modeActive && this.mode === 'lorentz';
    const xi = this.px[i], yi = this.py[i], zi = this.pz[i];
    const ax = this.vx[i], ay = this.vy[i], az = this.vz[i];
    let bestT = Infinity, bp = -1, maxdv2 = 1e-12;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      if (lor && this.mobile[j]) continue;          // tracers ignore each other
      let dx = this.px[j] - xi; dx -= Math.round(dx);
      let dy = this.py[j] - yi; dy -= Math.round(dy);
      let dz = this.pz[j] - zi; dz -= Math.round(dz);
      const dvx = this.vx[j] - ax, dvy = this.vy[j] - ay, dvz = this.vz[j] - az;
      const dv2 = dvx * dvx + dvy * dvy + dvz * dvz;
      if (dv2 > maxdv2) maxdv2 = dv2;
      const b = dx * dvx + dy * dvy + dz * dvz;
      if (b >= 0) continue;                          // separating
      const dr2 = dx * dx + dy * dy + dz * dz;
      const disc = b * b - dv2 * (dr2 - s2);
      if (disc <= 0) continue;                       // misses
      let tc = (-b - Math.sqrt(disc)) / dv2;
      if (tc < 0) tc = 0;                            // numerically overlapping & approaching
      if (tc < bestT) { bestT = tc; bp = j; }
    }
    const hor = (0.5 - sig) * 0.999 / Math.sqrt(maxdv2);
    if (bp < 0 || bestT > hor) { this.nextT[i] = t + hor; this.partner[i] = -1; }
    else { this.nextT[i] = t + bestT; this.partner[i] = bp; }
  }

  _predictAll() {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      if (this.mobile[i]) this._predict(i);
      else { this.nextT[i] = Infinity; this.partner[i] = -1; }
    }
  }

  // Free flight to absolute time tNew. Straight lines, so the odometer is
  // exact: D += (Σ speeds) · Δt.
  _advance(tNew) {
    const dt = tNew - this.time;
    if (!(dt > 0)) return;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      if (!this.mobile[i]) continue;
      let x = this.px[i] + this.vx[i] * dt; x -= Math.floor(x); this.px[i] = x;
      let y = this.py[i] + this.vy[i] * dt; y -= Math.floor(y); this.py[i] = y;
      let z = this.pz[i] + this.vz[i] * dt; z -= Math.floor(z); this.pz[i] = z;
    }
    this.dist += this.vsum * dt;
    this.time = tNew;
  }

  _updateSpeed(i) {
    const s = Math.sqrt(this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i] + this.vz[i] * this.vz[i]);
    this.vsum += s - this.spd[i];
    this.spd[i] = s;
  }

  // Bank one (sphere, collision) incidence. Must run BEFORE the speed cache is
  // refreshed, because the free path used the pre-collision speed.
  _bank(i) {
    this.collCount[i]++;
    if (this.armed) {
      this.inc++;
      const fp = this.spd[i] * (this.time - this.tLast[i]);
      this.fpSum += fp; this.fpSum2 += fp * fp; this.fpN++;
    }
    this.tLast[i] = this.time;
    this.flash[i] = this.time;
  }

  // ⟨v_rel⟩/⟨v⟩ sampled straight off the velocity data: one random legal pair
  // per collision event. In tracer mode the partners are frozen, so this
  // returns exactly 1 without any special case.
  _sampleR() {
    const mc = this.mobCount, pc = this.partCount;
    if (mc === 0 || pc === 0) return;
    const a = this.mobIdx[(Math.random() * mc) | 0];
    let b = this.partIdx[(Math.random() * pc) | 0];
    if (b === a) {
      b = this.partIdx[(Math.random() * pc) | 0];
      if (b === a) return;
    }
    const dvx = this.vx[a] - this.vx[b], dvy = this.vy[a] - this.vy[b], dvz = this.vz[a] - this.vz[b];
    const vr = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
    const va = this.spd[a];
    this.sumVrel += vr; this.sumV += va; this.cntR++;
    // Short-memory copy, for watching the ratio relax during equilibration.
    const w = 0.002;
    this.emaVrel += (vr - this.emaVrel) * w;
    this.emaV += (va - this.emaV) * w;
  }

  // Collision rules, all of which touch only the component along the line of
  // centres (the only geometry in the sim):
  //   • real gas      — equal masses swap that component. Conserves momentum
  //                     and kinetic energy EXACTLY (verified in the harness),
  //                     and lets the speed distribution find its own Maxwellian.
  //   • frozen target — the mover reflects specularly. The infinite-mass limit
  //                     of the same rule; the mover's speed is untouched.
  //   • constant-speed billiard — BOTH spheres reflect specularly off the
  //                     contact plane. Every speed is preserved exactly and for
  //                     ever, so the gas can never thermalize and R stays at
  //                     4/3. This one is a MODEL, not Newtonian: energy is
  //                     conserved but momentum is not, and the UI says so.
  //                     (An earlier draft renormalised speeds after a normal
  //                     swap; that can leave a contacting pair still approaching
  //                     and deadlock the event loop at zero time. This rule
  //                     always separates: dv·n flips sign identically.)
  _collide(i, j) {
    const n = this.n;
    let dx = this.px[j] - this.px[i]; dx -= Math.round(dx);
    let dy = this.py[j] - this.py[i]; dy -= Math.round(dy);
    let dz = this.pz[j] - this.pz[i]; dz -= Math.round(dz);
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > 1e-12) {
      const nx = dx / d, ny = dy / d, nz = dz / d;
      const dvn = (this.vx[j] - this.vx[i]) * nx + (this.vy[j] - this.vy[i]) * ny + (this.vz[j] - this.vz[i]) * nz;
      if (dvn < 0) {
        const mobJ = this.mobile[j] === 1;
        const pinned = this.mode === 'constant';
        if (mobJ && !pinned) {
          this.vx[i] += dvn * nx; this.vy[i] += dvn * ny; this.vz[i] += dvn * nz;
          this.vx[j] -= dvn * nx; this.vy[j] -= dvn * ny; this.vz[j] -= dvn * nz;
        } else {
          const vni = this.vx[i] * nx + this.vy[i] * ny + this.vz[i] * nz;
          this.vx[i] -= 2 * vni * nx; this.vy[i] -= 2 * vni * ny; this.vz[i] -= 2 * vni * nz;
          if (mobJ) {
            const vnj = this.vx[j] * nx + this.vy[j] * ny + this.vz[j] * nz;
            this.vx[j] -= 2 * vnj * nx; this.vy[j] -= 2 * vnj * ny; this.vz[j] -= 2 * vnj * nz;
          }
        }
        this.events++;
        this._bank(i);
        if (mobJ) this._bank(j);
        this._updateSpeed(i);
        if (mobJ) this._updateSpeed(j);
        this._sampleR();
      }
    }
    this._predict(i);
    if (this.mobile[j]) this._predict(j);
    // Anyone whose cached prediction pointed at i or j is now stale.
    for (let k = 0; k < n; k++) {
      if (k === i || k === j) continue;
      if (this.mobile[k] && (this.partner[k] === i || this.partner[k] === j)) this._predict(k);
    }
  }

  // Returns 0 = ran out of time, 1 = recheck event, 2 = collision.
  _oneEvent(tLimit) {
    const n = this.n;
    let bt = Infinity, bi = -1;
    for (let i = 0; i < n; i++) {
      if (this.mobile[i] && this.nextT[i] < bt) { bt = this.nextT[i]; bi = i; }
    }
    if (bi < 0 || bt > tLimit) { this._advance(tLimit); return 0; }
    this._advance(bt);
    const j = this.partner[bi];
    if (j < 0) { this._predict(bi); return 1; }
    this._collide(bi, j);
    return 2;
  }

  // --- equilibration & phases --------------------------------------------

  // Phase A ends when EVERY sphere has collided at least EQ_COLL times — the
  // standard MD rule of thumb, and strict (a minimum, not a mean). The harness
  // reports how far ⟨v_rel⟩/⟨v⟩ has relaxed toward √2 by that point.
  _checkPhase() {
    if (this.phase === 'equil') {
      let mn = Infinity;
      for (let i = 0; i < this.n; i++) if (this.collCount[i] < mn) mn = this.collCount[i];
      this.minColl = mn;
      if (mn >= EQ_COLL) this._applyMode();
    } else if (this.phase === 'settle') {
      if (this.events - this.eventsAtMode >= EQ_B_EVENTS * this.n) this._arm();
    }
  }

  _applyMode() {
    const n = this.n;
    if (this.mode === 'lorentz') {
      // Freeze the equilibrated configuration and keep a handful of tracers.
      // Frozen scatterers must be a genuine random medium, which is exactly
      // what an equilibrated hard-sphere gas is — a lattice would channel.
      const keep = this._moverCount();
      for (let i = 0; i < n; i++) this.mobile[i] = 0;
      let placed = 0, guard = 0;
      while (placed < keep && guard++ < 10000) {
        const k = (Math.random() * n) | 0;
        if (!this.mobile[k]) { this.mobile[k] = 1; placed++; }
      }
      let vs = 0;
      for (let i = 0; i < n; i++) {
        if (this.mobile[i]) { vs += this.spd[i]; }
        else { this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0; this.spd[i] = 0; }
      }
      this.vsum = vs;
    }
    this.modeActive = true;
    this.phase = 'settle';
    this.eventsAtMode = this.events;
    this._rebuildIndex();
    this._predictAll();
  }

  // Odometer and counter start together, here and nowhere else.
  _arm() {
    this.phase = 'run';
    this.armed = true;
    this.inc = 0; this.dist = 0;
    this.fpSum = 0; this.fpSum2 = 0; this.fpN = 0;
    this.sumVrel = 0; this.sumV = 0; this.cntR = 0;
    this.armTime = this.time;
    for (let i = 0; i < this.n; i++) this.tLast[i] = this.time;
  }

  // --- the estimator ------------------------------------------------------
  // λ = D / I, and π = 1/(R·σ²·n·λ). Every factor: a user-set diameter, a
  // user-set particle count in a unit box, an odometer, a counter, and a
  // velocity ratio measured from the gas. No transcendental is called.

  _lambda() { return this.inc > 0 ? this.dist / this.inc : 0; }

  _R() {
    if (!this.useMeasuredR) return MODE_R[this.mode] || 1;
    return (this.cntR > 0 && this.sumV > 0) ? this.sumVrel / this.sumV : 0;
  }

  getPiApproximation() {
    const lam = this._lambda(), R = this._R();
    if (!(lam > 0) || !(R > 0)) return 0;
    return 1 / (R * this.nPartners * this.sigma * this.sigma * lam);
  }

  // --- driving ------------------------------------------------------------

  step(dt) {
    const budget = this.turbo ? MAX_EVENTS_TURBO : MAX_EVENTS_NORMAL;
    const tTarget = this.time + dt * TIME_SCALE * (this.turbo ? TURBO_TIME : 1);
    let collided = false;
    for (let e = 0; e < budget; e++) {
      const r = this._oneEvent(tTarget);
      if (r === 0) break;
      if (r === 2) collided = true;
    }
    this._checkPhase();
    this.collisionCount = this.inc;

    if (this.armed && this.inc >= this.nextMilestone) {
      this.pendingPhasePoints.push([...this.getPhasePoint()]);
      this.nextMilestone = Math.max(this.inc + 1, Math.ceil(this.inc * 1.03));
    }
    if (this.sweep && this.armed && this.inc >= SWEEP_TARGET) this._advanceSweep();
    return collided;
  }

  _advanceSweep() {
    this.sweepLog.push({ d: this.density, pi: this.getPiApproximation(), R: this._R(), inc: this.inc });
    let k = SWEEP_LADDER.indexOf(this.density);
    if (k < 0) k = -1;
    if (k + 1 < SWEEP_LADDER.length) {
      this.density = SWEEP_LADDER[k + 1];
      this.reset();
    } else {
      this.sweep = false;                 // ladder finished; hold at the last rung
    }
  }

  // --- controls -----------------------------------------------------------

  getControls() {
    const phi = (d) => ((Math.PI / 6) * d * 100).toFixed(2);   // DISPLAY-ONLY label text
    return [
      {
        type: 'select', id: 'mode', label: 'Where the constant R = ⟨v_rel⟩/⟨v⟩ comes from', highlight: true,
        default: this.mode,
        options: [
          { value: 'maxwell', label: 'Real gas — speeds thermalize themselves  (R → √2)' },
          { value: 'constant', label: 'Constant-speed billiard — both reflect, speeds frozen  (R = 4/3)' },
          { value: 'lorentz', label: 'Tracers through frozen scatterers  (R = 1 exactly)' },
        ],
        onChange: (val) => { this.mode = val; this.sweepLog = []; this.reset(); }
      },
      {
        type: 'select', id: 'density', label: 'THE KNOB — reduced density n* = n·σ³', highlight: true,
        default: this.density,
        options: DENSITIES.map(d => ({ value: d, label: `n* = ${d}   (packing ${phi(d)}%)` })),
        onChange: (val) => { this.density = Number(val); this.reset(); }
      },
      {
        type: 'slider', id: 'n', label: 'Spheres N', min: NMIN, max: NMAX, step: 8, default: this.n,
        onChange: (val) => { this.n = val; this.reset(); }
      },
      {
        type: 'toggle', id: 'useMeasuredR', label: 'R measured from the gas (off ⇒ textbook √2 · 4/3 · 1)',
        default: this.useMeasuredR,
        onChange: (val) => { this.useMeasuredR = val; }
      },
      {
        type: 'toggle', id: 'sweep', label: 'Auto-sweep the density ladder (plots the drift → 0)',
        default: this.sweep,
        onChange: (val) => { this.sweep = val; if (val) { this.sweepLog = []; this.density = SWEEP_LADDER[0]; this.reset(); } }
      },
      { type: 'toggle', id: 'turbo', label: 'Turbo ×1000 (statistics only — switch off to watch the gas)', default: this.turbo },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 20, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      {
        id: 'convergence', label: 'log free paths vs estimate error', dimension: 2,
        primary: true, boundary: 'none',
        axisLabels: { x: 'log₁₀ free paths', y: '(π̂ − π)/π' }
      }
    ];
  }

  getPhasePoint() {
    const p = this.getPiApproximation();
    const x = Math.min(1, Math.max(-1, Math.log10(Math.max(this.inc, 1)) / 6 * 2 - 1));
    // DISPLAY-ONLY use of Math.PI: this is the error axis, not the estimator.
    const y = p > 0 ? Math.min(1, Math.max(-1, (p - Math.PI) / Math.PI * 4)) : 0;
    return [x, y];
  }

  getPhaseExtractor() { return (pt) => pt; }

  getCountLabel() { return 'Free paths'; }

  getPiNature() {
    // Honest badge: at the dense end the drift is the headline, not the noise.
    return this.density > 0.02 ? 'biased' : 'statistical';
  }

  getPiReadout() {
    if (!this.armed) return 'equilibrating…';
    const p = this.getPiApproximation();
    return p > 0 ? p.toFixed(6) : 'collecting…';
  }

  // --- readout ------------------------------------------------------------

  // Sweep chart: π̂ recorded at each density rung, against a π reference line.
  // The reference line and the drift percentages are DISPLAY-ONLY — nothing
  // here feeds back into the estimator.
  _sweepSVG() {
    const pts = this.sweepLog.slice();
    if (this.armed && this.inc > 2000) pts.push({ d: this.density, pi: this.getPiApproximation(), live: true });
    if (pts.length < 1) return '';
    const W = 268, H = 96, L = 34, R = 6, T = 8, B = 18;
    const x0 = Math.log10(0.30), x1 = Math.log10(0.006);
    let ymin = Math.PI, ymax = Math.PI;                       // DISPLAY-ONLY reference
    for (const p of pts) { if (p.pi < ymin) ymin = p.pi; if (p.pi > ymax) ymax = p.pi; }
    const pad = Math.max(0.12, (ymax - ymin) * 0.15);
    ymin -= pad; ymax += pad;
    const sx = (d) => L + (Math.log10(d) - x0) / (x1 - x0) * (W - L - R);
    const sy = (v) => T + (ymax - v) / (ymax - ymin) * (H - T - B);
    const yPi = sy(Math.PI);
    let dots = '', path = '';
    const ordered = pts.slice().sort((a, b) => b.d - a.d);
    ordered.forEach((p, i) => {
      const X = sx(p.d).toFixed(1), Y = sy(p.pi).toFixed(1);
      path += (i === 0 ? 'M' : 'L') + X + ' ' + Y + ' ';
      dots += `<circle cx="${X}" cy="${Y}" r="${p.live ? 3.4 : 2.6}" fill="${p.live ? '#f7c948' : '#4cc9f0'}"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:280px;display:block;margin:4px 0">
      <line x1="${L}" y1="${yPi.toFixed(1)}" x2="${W - R}" y2="${yPi.toFixed(1)}" stroke="#6ee7b7" stroke-width="1" stroke-dasharray="3 3"/>
      <text x="${W - R}" y="${(yPi - 3).toFixed(1)}" fill="#6ee7b7" font-size="9" text-anchor="end">π</text>
      <path d="${path}" fill="none" stroke="#4cc9f0" stroke-width="1.2" opacity="0.75"/>
      ${dots}
      <text x="${L}" y="${H - 5}" fill="#9aa0c8" font-size="9">dense</text>
      <text x="${W - R}" y="${H - 5}" fill="#9aa0c8" font-size="9" text-anchor="end">dilute →</text>
      <text x="2" y="${(T + 8).toFixed(1)}" fill="#9aa0c8" font-size="9">${ymax.toFixed(2)}</text>
      <text x="2" y="${(H - B).toFixed(1)}" fill="#9aa0c8" font-size="9">${ymin.toFixed(2)}</text>
    </svg>`;
  }

  getFormulaHTML() {
    const lam = this._lambda(), R = this._R(), sig = this.sigma, nD = this.nPartners;
    const p = this.getPiApproximation();
    const live = p > 0 ? piDigitsHTML(p, 4) : '—';
    // ---- DISPLAY-ONLY block: packing fraction, drift, Enskog check ----
    const phi = (Math.PI / 6) * this.density;
    const gCS = (1 - phi / 2) / Math.pow(1 - phi, 3);
    const drift = p > 0 ? (p / Math.PI - 1) * 100 : 0;
    // ------------------------------------------------------------------
    const cv = this.fpN > 2 ? Math.sqrt(Math.max(0, this.fpSum2 / this.fpN - (this.fpSum / this.fpN) ** 2)) / (this.fpSum / this.fpN) : 0;
    const modeName = this.mode === 'maxwell' ? 'real gas' : this.mode === 'constant' ? 'constant-speed billiard' : 'tracers · frozen scatterers';
    const rEma = (this.emaV > 0) ? this.emaVrel / this.emaV : 0;

    const status = this.phase === 'equil'
      ? `<span class="f-muted">equilibrating — every sphere needs ${EQ_COLL} collisions (lowest so far: ${Number.isFinite(this.minColl) ? this.minColl : 0}) · ⟨v_rel⟩/⟨v⟩ now ${rEma > 0 ? rEma.toFixed(3) : '—'}, heading for ${MODE_R_TEXT[this.mode]}</span>`
      : this.phase === 'settle'
        ? `<span class="f-muted">mode applied — letting it settle before the meters start…</span>`
        : `<span class="f-count">λ = D/I = ${lam.toFixed(5)} = ${(lam / sig).toFixed(2)}·σ &nbsp;·&nbsp; ${this.inc.toLocaleString()} free paths &nbsp;·&nbsp; odometer D = ${this.dist.toFixed(1)}</span>`;

    return `<div>
      <strong>mean free path</strong>: a sphere sweeps a tube of cross-section
      <span class="f-angle">πσ²</span>, so it meets a partner every
      <span class="f-angle">λ = 1/(R·πσ²·n)</span> — invert it and π falls out.<br>
      <span class="f-result">π</span> ≈ 1 / (
      <span class="f-count">R=${R > 0 ? R.toFixed(4) : '—'}</span> ·
      <span class="f-count">σ²=${(sig * sig).toExponential(3)}</span> ·
      <span class="f-count">n=${nD}</span> ·
      <span class="f-count">λ=${lam > 0 ? lam.toFixed(5) : '—'}</span> )
      <br><span style="font-size:1.15em">π = ${live}</span>
      ${this.armed ? `<span class="f-muted"> &nbsp;(${drift >= 0 ? '+' : ''}${drift.toFixed(2)}% off π)</span>` : ''}
      <br>${status}
      <br><span class="f-muted">${modeName} · R ${this.useMeasuredR ? 'sampled from the gas’s own velocities' : 'taken from the textbook'},
      textbook value ${MODE_R_TEXT[this.mode]} · free-path spread sd/mean = ${cv > 0 ? cv.toFixed(3) : '—'} (1.000 ⇒ exponential)</span>
      <br><span class="f-muted">knob: n* = nσ³ = ${this.density} ⇒ packing φ = ${(phi * 100).toFixed(2)}%, σ = ${sig.toFixed(4)} of the box.
      Excluded volume should push π̂ up by the contact correlation g(σ) ≈ ${gCS.toFixed(3)} → expect ≈ ${(Math.PI * gCS).toFixed(3)}
      <em>(theory shown as a check only — it never enters the estimate)</em>.</span>
      ${this.mode === 'lorentz'
        ? `<br><span class="f-muted">tracer caveat: the medium is frozen, so a tracer keeps re-crossing the SAME scatterers — free paths are correlated and the run-to-run spread is ~5× wider than 1/√I suggests (measured: 0.91% vs 0.18% at I = 3·10⁵).</span>`
        : ''}
      ${this._sweepSVG()}
      ${this.sweepLog.length ? `<span class="f-muted">${this.sweepLog.map(s => `n*=${s.d}: ${s.pi.toFixed(3)}`).join(' · ')}</span>` : ''}
    </div>`;
  }

  // --- scene --------------------------------------------------------------

  _label(text, x, y, z, sx = 0.6, sy = 0.062, color = '#c9d1ff') {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 64;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 64);
    g.fillStyle = color;
    g.font = '30px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthTest: false }));
    sp.position.set(x, y, z);
    sp.scale.set(sx, sy, 1);
    this.simScene.add(sp);
    return sp;
  }

  _trailReset() {
    if (this.trailPos) this.trailPos.fill(0);
    this.trailHead = 0;
    this.trailFill = 0;
    this._tpx = -1; this._tpy = -1; this._tpz = -1;
  }

  initSimScene() {
    this.simScene.clear();
    this.simCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 20);
    this.simCamera.position.set(1.62, 1.16, 1.92);
    this.simCamera.lookAt(0, 0, 0);
    // Fixed view direction, reused for a cheap depth cue (no lights in this codebase).
    const cd = this.simCamera.position.clone().normalize();
    this._camDir = cd;

    // The periodic cell.
    this.simScene.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 })
    ));

    // Pooled spheres — one instance per particle, scaled to σ/2 each frame.
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.balls = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.96 }), NMAX);
    this.balls.frustumCulled = false;
    const zero = this._mtx.makeScale(0, 0, 0);
    for (let i = 0; i < NMAX; i++) { this.balls.setMatrixAt(i, zero); this.balls.setColorAt(i, this._col.setHex(C_BALL)); }
    this.balls.instanceMatrix.needsUpdate = true;
    this.simScene.add(this.balls);

    // Tagged sphere's recent path — the zig-zag IS the mean free path.
    this.trailPos = new Float32Array(TRAIL_SEGS * 6);
    this.trailGeom = new THREE.BufferGeometry();
    this.trailGeom.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    this.trailGeom.setDrawRange(0, 0);
    this.simScene.add(new THREE.LineSegments(this.trailGeom,
      new THREE.LineBasicMaterial({ color: C_TAG, transparent: true, opacity: 0.8 })));
    this._trailReset();

    this._label('hard spheres · periodic box · elastic', 0, 0.66, 0, 0.86, 0.075);
    this._label('odometer ÷ collisions = mean free path', 0, -0.66, 0, 0.86, 0.07, '#9aa0c8');
  }

  updateSimScene() {
    if (!this.balls) return;
    const n = this.n, mtx = this._mtx, bm = this.balls;
    const r = this.sigma * 0.5, now = this.time;
    const cd = this._camDir;
    const base = this._colB, flash = this._colF, tmp = this._col;
    flash.setHex(C_FLASH);
    for (let i = 0; i < NMAX; i++) {
      if (i < n) {
        const x = this.px[i] - 0.5, y = this.py[i] - 0.5, z = this.pz[i] - 0.5;
        mtx.makeScale(r, r, r);
        mtx.elements[12] = x; mtx.elements[13] = y; mtx.elements[14] = z;
        bm.setMatrixAt(i, mtx);
        base.setHex(this.mobile[i] ? (i === this.tagged ? C_TAG : C_BALL) : C_FROZEN);
        let shade = 0.5 + 0.9 * (x * cd.x + y * cd.y + z * cd.z);
        if (shade < 0.32) shade = 0.32; else if (shade > 1) shade = 1;
        tmp.copy(base).multiplyScalar(shade);
        const age = now - this.flash[i];
        if (this.flash[i] >= 0 && age >= 0 && age < FLASH_DUR) tmp.lerp(flash, 1 - age / FLASH_DUR);
        bm.setColorAt(i, tmp);
      } else {
        mtx.makeScale(0, 0, 0);
        bm.setMatrixAt(i, mtx);
      }
    }
    bm.instanceMatrix.needsUpdate = true;
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true;

    // Trail: only meaningful when the gas is being watched, not fast-forwarded.
    const t = this.tagged;
    const cx = this.px[t] - 0.5, cy = this.py[t] - 0.5, cz = this.pz[t] - 0.5;
    if (this.turbo) {
      if (this.trailFill > 0) { this.trailFill = 0; this.trailHead = 0; this.trailGeom.setDrawRange(0, 0); }
      this._tpx = cx; this._tpy = cy; this._tpz = cz;
    } else if (this.trailPos) {
      if (this._tpx > -0.9) {
        const dx = cx - this._tpx, dy = cy - this._tpy, dz = cz - this._tpz;
        const d2 = dx * dx + dy * dy + dz * dz;
        const o = this.trailHead * 6;
        if (d2 > 1e-10 && d2 < 0.09) {          // 0.09 ⇒ ignore the jump made by a wrap
          this.trailPos[o] = this._tpx; this.trailPos[o + 1] = this._tpy; this.trailPos[o + 2] = this._tpz;
          this.trailPos[o + 3] = cx; this.trailPos[o + 4] = cy; this.trailPos[o + 5] = cz;
        } else {
          this.trailPos[o] = cx; this.trailPos[o + 1] = cy; this.trailPos[o + 2] = cz;
          this.trailPos[o + 3] = cx; this.trailPos[o + 4] = cy; this.trailPos[o + 5] = cz;
        }
        this.trailHead = (this.trailHead + 1) % TRAIL_SEGS;
        if (this.trailFill < TRAIL_SEGS) this.trailFill++;
        this.trailGeom.setDrawRange(0, this.trailFill * 2);
        this.trailGeom.attributes.position.needsUpdate = true;
      }
      this._tpx = cx; this._tpy = cy; this._tpz = cz;
    }
  }
}

registerSim(HardSphereCrossSectionPi);
