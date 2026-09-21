// js/sims/TwoPendulums.js
import * as THREE from 'three';
import { Simulation } from '../core/Simulation.js';
import { registerSim } from '../core/registry.js';

export class TwoPendulums extends Simulation {
  static id = 'two-pendulums';
  static hubHidden = true;   // hidden from the hub (still loadable by id / via alternatives)
  static title = 'Two Pendulums';
  static description = 'Chaotic extension — phase-space filling replaces exact collision counting';
  static piMechanism = 'experimental: estimate π from sampled phase-space volume';
  static rigor = 'Experimental';
  static sortOrder = 110;
  static explanation = {
    setup: 'Two pendulums face each other across a sliding block. The left pendulum is released, swings down, and its bob hits the block. The block slides and hits the right pendulum\'s bob. Energy bounces back and forth.',
    insight: 'This is a chaotic system — collision counting won\'t give π here. The trajectory ergodically fills the energy surface in phase space. In principle, measuring this surface\'s geometry (area, volume) could give π via n-sphere formulas. In practice, this is a correlated Monte Carlo estimator — interesting conceptually, but converges slowly. The real beauty is watching the phase space fill up!',
    contrast: 'This is the opposite end of the spectrum from the original two-block billiard. Instead of a single exact rotation angle, we get a volume-filling exploration where π can only appear through statistical geometry.',
    formula: 'Experimental only: π is estimated from sampled phase-space volume, not from collision count.',
    getExpected: (params) => `Watch the 3D trajectory fill the energy surface. The collision count tracks energy transfers between the two pendulums through the block.`
  };

  constructor(params = {}) {
    super(params);
    this.mL       = params.mL       || 1.0;   // left bob mass
    this.mR       = params.mR       || 1.0;   // right bob mass
    this.M        = params.M        || 5.0;   // block mass
    this.L        = params.L        || 0.30;  // pendulum length (world units)
    this.initAngle = params.initAngle || 1.0; // left pendulum release angle (rad)
    this.gravity  = 9.8;
    this.reset();
  }

  reset() {
    super.reset();

    // Rail geometry (world units 0..1)
    this.railLength = 1.0;
    this.blockW     = 0.08;
    this.blockH     = 0.10;

    // Pivot positions: close enough to center that bobs can reach the block.
    // Pivots are offset from block center so the bob arc passes through the block.
    this.pivotLX = 0.25;
    this.pivotRX = 0.75;
    // Pivot height: bob at rest (theta=0) should be at block center height.
    // bobY at theta=0 = pivotY - L. We want this ≈ blockH/2 (middle of block).
    this.pivotY  = this.L + this.blockH / 2;

    // Pendulum angles: theta measured from straight down (+ve = swinging toward center)
    this.thetaL    = this.initAngle;  // left pendulum starts lifted
    this.thetaDotL = 0;
    this.thetaR    = 0;               // right pendulum hangs at rest
    this.thetaDotR = 0;

    // Block
    this.blockX = 0.5;
    this.blockV = 0;

    this.finished        = false;
    this.collisionEffects = [];

    // Cooldown counters to prevent multi-trigger on same contact
    this._collisionCooldownL = 0;
    this._collisionCooldownR = 0;
  }

  getControls() {
    return [
      {
        type: 'slider', id: 'mL', label: 'Left Bob Mass', min: 0.1, max: 5, step: 0.1, default: this.mL,
        onChange: (val) => { this.mL = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'M', label: 'Block Mass', min: 1, max: 50, step: 1, default: this.M,
        onChange: (val) => { this.M = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'mR', label: 'Right Bob Mass', min: 0.1, max: 5, step: 0.1, default: this.mR,
        onChange: (val) => { this.mR = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'L', label: 'Pendulum Length', min: 0.15, max: 0.40, step: 0.01, default: this.L,
        onChange: (val) => { this.L = val; this.reset(); this.initSimScene(); }
      },
      {
        type: 'slider', id: 'initAngle', label: 'Release Angle (rad)', min: 0.1, max: 1.4, step: 0.05, default: this.initAngle,
        onChange: (val) => { this.initAngle = val; this.reset(); this.initSimScene(); }
      },
      { type: 'slider', id: 'speed', label: 'Speed', min: 0.1, max: 100, step: 0.1, default: 1 },
    ];
  }

  getPhaseSpaceViews() {
    return [
      { id: '3d-angles-v', label: 'θ_L × θ_R × block v', dimension: 3, primary: true, axisLabels: { x: 'θ_L / π', y: 'θ_R / π', z: 'block v / vmax' } },
      { id: 'thetaL-thetaR', label: 'θ_L vs θ_R (angular coupling)', dimension: 2, axisLabels: { x: 'θ_L / π', y: 'θ_R / π' } },
      { id: 'blockV-thetaDotL', label: 'Block v vs θdot_L (linear-angular)', dimension: 2, axisLabels: { x: 'block v / vmax', y: 'θdot_L / θdot_max' } },
      { id: 'thetaDotL-thetaDotR', label: 'θdot_L vs θdot_R (angular velocity coupling)', dimension: 2, axisLabels: { x: 'θdot_L / θdot_max', y: 'θdot_R / θdot_max' } },
    ];
  }

  // -----------------------------------------------------------------------
  //  Physics step — sub-stepping with overlap collision detection
  // -----------------------------------------------------------------------
  step(dt) {
    if (this.finished) return false;

    const SUB_DT   = 0.0005;   // sub-step size for pendulum ODE accuracy
    let remaining  = dt;
    let collided   = false;
    const now      = performance.now();

    // Tick cooldown counters down each outer step
    if (this._collisionCooldownL > 0) this._collisionCooldownL -= dt;
    if (this._collisionCooldownR > 0) this._collisionCooldownR -= dt;

    while (remaining > 1e-12) {
      const h = Math.min(SUB_DT, remaining);
      remaining -= h;

      // Integrate both pendulums for h
      this._integratePendulum('L', h);
      this._integratePendulum('R', h);

      // Move block
      this.blockX += this.blockV * h;

      // ---- Collision detection ----------------------------------------

      // Bob positions (world coords)
      // Left bob: pivot at (pivotLX, pivotY), swings rightward when thetaL > 0
      const bobLX = this.pivotLX + this.L * Math.sin(this.thetaL);
      const bobLY = this.pivotY  - this.L * Math.cos(this.thetaL);

      // Right bob: pivot at (pivotRX, pivotY), swings leftward when thetaR > 0
      const bobRX = this.pivotRX - this.L * Math.sin(this.thetaR);
      const bobRY = this.pivotY  - this.L * Math.cos(this.thetaR);

      const blockLeft  = this.blockX - this.blockW / 2;
      const blockRight = this.blockX + this.blockW / 2;

      // Collision radius for bob-block interaction
      const bobR = 0.02;

      // Left bob hits block: check if bob overlaps block rectangle
      if (this._collisionCooldownL <= 0 &&
          bobLX + bobR >= blockLeft && bobLX - bobR <= blockRight &&
          bobLY >= -bobR && bobLY <= this.blockH + bobR) {

        const vBobH = this.L * this.thetaDotL * Math.cos(this.thetaL);
        if (vBobH > this.blockV + 0.001) { // approaching
          this._elasticCollisionL(vBobH, now, blockLeft, Math.max(0, bobLY));
          collided = true;
          this._collisionCooldownL = 0.02;
          this.pendingPhasePoints.push([...this.getPhasePoint()]);
        }
      }

      // Right bob hits block
      if (this._collisionCooldownR <= 0 &&
          bobRX - bobR <= blockRight && bobRX + bobR >= blockLeft &&
          bobRY >= -bobR && bobRY <= this.blockH + bobR) {

        const vBobH = -this.L * this.thetaDotR * Math.cos(this.thetaR);
        if (vBobH < this.blockV - 0.001) { // approaching from right
          this._elasticCollisionR(vBobH, now, blockRight, Math.max(0, bobRY));
          collided = true;
          this._collisionCooldownR = 0.02;
          this.pendingPhasePoints.push([...this.getPhasePoint()]);
        }
      }

      // Block hits walls — keep block inside rail
      if (this.blockX - this.blockW / 2 <= 0) {
        this.blockX = this.blockW / 2;
        this.blockV = Math.abs(this.blockV);
        this.collisionCount++;
        collided = true;
        this.collisionEffects.push({ x: 0, y: this.blockH / 2, time: now, type: 'wall' });
        this.pendingPhasePoints.push([...this.getPhasePoint()]);
      }
      if (this.blockX + this.blockW / 2 >= this.railLength) {
        this.blockX = this.railLength - this.blockW / 2;
        this.blockV = -Math.abs(this.blockV);
        this.collisionCount++;
        collided = true;
        this.collisionEffects.push({ x: this.railLength, y: this.blockH / 2, time: now, type: 'wall' });
        this.pendingPhasePoints.push([...this.getPhasePoint()]);
      }
    }

    return collided;
  }

  _elasticCollisionL(vBobH, now, effectX, effectY) {
    const mB   = this.mL;
    const mBlk = this.M;
    const v1   = vBobH;
    const v2   = this.blockV;

    const v1new = ((mB - mBlk) * v1 + 2 * mBlk * v2) / (mB + mBlk);
    const v2new = ((mBlk - mB) * v2 + 2 * mB  * v1) / (mB + mBlk);

    // Convert bob's new horizontal velocity back to angular velocity
    const cosT = Math.cos(this.thetaL);
    this.thetaDotL = (Math.abs(cosT) > 0.01) ? v1new / (this.L * cosT) : 0;
    this.blockV    = v2new;

    this.collisionCount++;
    this.collisionEffects.push({ x: effectX, y: effectY, time: now, type: 'block' });
  }

  _elasticCollisionR(vBobH, now, effectX, effectY) {
    const mB   = this.mR;
    const mBlk = this.M;
    const v1   = vBobH;      // leftward (negative) bob velocity
    const v2   = this.blockV;

    const v1new = ((mB - mBlk) * v1 + 2 * mBlk * v2) / (mB + mBlk);
    const v2new = ((mBlk - mB) * v2 + 2 * mB  * v1) / (mB + mBlk);

    // Convert back: right bob horizontal velocity = -L * thetaDotR * cos(thetaR)
    const cosT = Math.cos(this.thetaR);
    this.thetaDotR = (Math.abs(cosT) > 0.01) ? -v1new / (this.L * cosT) : 0;
    this.blockV    = v2new;

    this.collisionCount++;
    this.collisionEffects.push({ x: effectX, y: effectY, time: now, type: 'block' });
  }

  /**
   * RK4 integration of single nonlinear pendulum: θ̈ = -(g/L) sin(θ)
   * side: 'L' or 'R'
   */
  _integratePendulum(side, t) {
    if (t <= 0) return;
    const gL       = this.gravity / this.L;
    const numSteps = Math.max(1, Math.ceil(t / 0.005));
    const h        = t / numSteps;

    let theta    = side === 'L' ? this.thetaL    : this.thetaR;
    let thetaDot = side === 'L' ? this.thetaDotL : this.thetaDotR;

    for (let i = 0; i < numSteps; i++) {
      const k1t = thetaDot;
      const k1w = -gL * Math.sin(theta);

      const k2t = thetaDot + 0.5 * h * k1w;
      const k2w = -gL * Math.sin(theta + 0.5 * h * k1t);

      const k3t = thetaDot + 0.5 * h * k2w;
      const k3w = -gL * Math.sin(theta + 0.5 * h * k2t);

      const k4t = thetaDot + h * k3w;
      const k4w = -gL * Math.sin(theta + h * k3t);

      theta    += (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t);
      thetaDot += (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w);
    }

    if (side === 'L') {
      this.thetaL    = theta;
      this.thetaDotL = thetaDot;
    } else {
      this.thetaR    = theta;
      this.thetaDotR = thetaDot;
    }
  }

  // -----------------------------------------------------------------------
  //  Phase space
  // -----------------------------------------------------------------------
  getPiApproximation() {
    // For chaotic systems, use volume-based estimation.
    // Returns collision count as fallback; the main loop calls the analyzer.
    return this.collisionCount;
  }

  getPiLabel() {
    return 'π est';
  }

  /** Declare that this sim uses volume-based pi estimation */
  static piMethod = 'volume';

  /** Get the method for phase space analysis */
  getPiMethod() { return 'volume'; }

  getPhasePoint() {
    // NORMALISE BY A MEASURED SWING, NOT BY π. This trail is what main.js feeds
    // to the 'volume' phase-space estimator, and that estimator is NOT invariant
    // under a per-axis rescale (its bounding-box volume and RMS radius both move),
    // so a literal Math.PI here would sit inside the chain producing the displayed
    // number. Track the largest |θ| actually seen instead: it is read off the
    // trajectory, so the scale is set by the motion rather than by a constant.
    const seen = Math.max(Math.abs(this.thetaL), Math.abs(this.thetaR));
    if (!(this._maxThetaSeen >= seen)) this._maxThetaSeen = seen;
    const maxTheta    = Math.max(this._maxThetaSeen, 1e-6);
    const maxThetaDot = Math.sqrt(2 * this.gravity / this.L);
    const maxV        = 3; // rough normalizer for block speed
    return [
      this.thetaL    / maxTheta,
      this.thetaR    / maxTheta,
      this.thetaDotL / maxThetaDot,
      this.thetaDotR / maxThetaDot,
      this.blockV    / maxV,
    ];
  }

  getPhaseExtractor(viewId) {
    if (viewId === '3d-angles-v') {
      return (pt) => [pt[0], pt[1], pt[4]]; // θL, θR, blockV
    }
    if (viewId === 'thetaL-thetaR') {
      return (pt) => [pt[0], pt[1]];
    }
    if (viewId === 'blockV-thetaDotL') {
      return (pt) => [pt[4], pt[2]];
    }
    if (viewId === 'thetaDotL-thetaDotR') {
      return (pt) => [pt[2], pt[3]];
    }
    return (pt) => [pt[0], pt[1]];
  }

  // -----------------------------------------------------------------------
  //  Three.js scene
  // -----------------------------------------------------------------------
  initSimScene() {
    this.simScene.clear();

    // Camera: view 0..1 horizontally, -0.05..0.55 vertically
    this.simCamera = new THREE.OrthographicCamera(-0.05, 1.05, 0.55, -0.05, 0.1, 10);
    this.simCamera.position.z = 1;

    // Rail floor line
    const floorGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.05, 0, 0), new THREE.Vector3(1.05, 0, 0)
    ]);
    this.simScene.add(new THREE.Line(floorGeom, new THREE.LineBasicMaterial({ color: 0x2a2a4a })));

    // Left wall
    const wallLGeom = new THREE.PlaneGeometry(0.015, 0.6);
    const wallL = new THREE.Mesh(wallLGeom, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    wallL.position.set(-0.0075, 0.25, 0);
    this.simScene.add(wallL);

    // Right wall
    const wallRGeom = new THREE.PlaneGeometry(0.015, 0.6);
    const wallR = new THREE.Mesh(wallRGeom, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    wallR.position.set(1.0075, 0.25, 0);
    this.simScene.add(wallR);

    // Left pivot dot
    const pivotGeom = new THREE.CircleGeometry(0.008, 16);
    const pivotLMesh = new THREE.Mesh(pivotGeom, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    pivotLMesh.position.set(this.pivotLX, this.pivotY, 0.01);
    this.simScene.add(pivotLMesh);

    // Right pivot dot
    const pivotRMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.008, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    pivotRMesh.position.set(this.pivotRX, this.pivotY, 0.01);
    this.simScene.add(pivotRMesh);

    // Left rod
    const rodLGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)
    ]);
    this.rodLMesh = new THREE.Line(rodLGeom, new THREE.LineBasicMaterial({ color: 0xaaaacc }));
    this.simScene.add(this.rodLMesh);

    // Right rod
    const rodRGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)
    ]);
    this.rodRMesh = new THREE.Line(rodRGeom, new THREE.LineBasicMaterial({ color: 0xaaaacc }));
    this.simScene.add(this.rodRMesh);

    // Left bob
    this.bobLMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.013, 16),
      new THREE.MeshBasicMaterial({ color: 0xf7c948 })
    );
    this.simScene.add(this.bobLMesh);

    // Right bob
    this.bobRMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.013, 16),
      new THREE.MeshBasicMaterial({ color: 0x4cc9f0 })
    );
    this.simScene.add(this.bobRMesh);

    // Block
    const blockGeom = new THREE.PlaneGeometry(this.blockW, this.blockH);
    this.blockMesh = new THREE.Mesh(blockGeom, new THREE.MeshBasicMaterial({
      color: 0xe94560, transparent: true, opacity: 0.9
    }));
    this.simScene.add(this.blockMesh);

    // Velocity arrow for block
    this.arrowBlock = this._makeArrow(0x4cc9f0);
    this.simScene.add(this.arrowBlock);

    // Collision effect rings (pool of 8)
    this.effectMeshes = [];
    for (let i = 0; i < 8; i++) {
      const ringGeom = new THREE.RingGeometry(0.01, 0.015, 32);
      const ringMat  = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.visible = false;
      this.simScene.add(ring);
      this.effectMeshes.push(ring);
    }
  }

  _makeArrow(color) {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)
    ]);
    const line = new THREE.Line(geom, new THREE.LineBasicMaterial({ color }));
    line.visible = false;
    return line;
  }

  _updateArrow(arrow, x, y, length) {
    const pos = arrow.geometry.attributes.position.array;
    pos[0] = x;          pos[1] = y; pos[2] = 0;
    pos[3] = x + length; pos[4] = y; pos[5] = 0;
    arrow.geometry.attributes.position.needsUpdate = true;
  }

  updateSimScene() {
    if (!this.blockMesh) return;

    // Block
    this.blockMesh.position.set(this.blockX, this.blockH / 2, 0);

    // Left pendulum
    const bobLX = this.pivotLX + this.L * Math.sin(this.thetaL);
    const bobLY = this.pivotY  - this.L * Math.cos(this.thetaL);
    this.bobLMesh.position.set(bobLX, bobLY, 0.01);

    const rodLPos = this.rodLMesh.geometry.attributes.position.array;
    rodLPos[0] = this.pivotLX; rodLPos[1] = this.pivotY; rodLPos[2] = 0;
    rodLPos[3] = bobLX;        rodLPos[4] = bobLY;        rodLPos[5] = 0;
    this.rodLMesh.geometry.attributes.position.needsUpdate = true;

    // Right pendulum
    const bobRX = this.pivotRX - this.L * Math.sin(this.thetaR);
    const bobRY = this.pivotY  - this.L * Math.cos(this.thetaR);
    this.bobRMesh.position.set(bobRX, bobRY, 0.01);

    const rodRPos = this.rodRMesh.geometry.attributes.position.array;
    rodRPos[0] = this.pivotRX; rodRPos[1] = this.pivotY; rodRPos[2] = 0;
    rodRPos[3] = bobRX;        rodRPos[4] = bobRY;        rodRPos[5] = 0;
    this.rodRMesh.geometry.attributes.position.needsUpdate = true;

    // Block velocity arrow
    if (this.showVectors) {
      this.arrowBlock.visible = true;
      this._updateArrow(this.arrowBlock, this.blockX, this.blockH + 0.025, this.blockV * 0.08);
    } else {
      this.arrowBlock.visible = false;
    }

    // Collision pulse effects
    const now = performance.now();
    const EFFECT_DURATION = 300;
    this.collisionEffects = this.collisionEffects.filter(e => now - e.time < EFFECT_DURATION);

    for (let i = 0; i < this.effectMeshes.length; i++) {
      const ring = this.effectMeshes[i];
      if (i < this.collisionEffects.length) {
        const effect   = this.collisionEffects[i];
        const progress = (now - effect.time) / EFFECT_DURATION;
        const scale    = 1 + progress * 5;
        ring.visible   = true;
        ring.position.set(effect.x, effect.y, 0.01);
        ring.scale.set(scale, scale, 1);
        ring.material.opacity = (1 - progress) * 0.8;
        ring.material.color.setHex(effect.type === 'wall' ? 0xffffff : 0xf7c948);
      } else {
        ring.visible = false;
      }
    }
  }
}

registerSim(TwoPendulums);
