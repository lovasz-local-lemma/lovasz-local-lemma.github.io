// BalanceForge — ball entity for the "hit-ball" objective family.
//
// A free-moving spherical projectile that the pendulum should strike. Three
// spawn modes:
//   'fixed'  — appears at a static position immediately
//   'drift'  — appears at one edge of the rail with a lateral velocity, slowly
//              drifting across the scene like a slow pitch
//   'timed'  — appears at a static position after a configurable delay (forces
//              the policy to "wait then strike" rather than randomly flailing)
//
// The ball is added as a regular FREE node to the world (gravity-affected,
// no rod constraints). Collision against pendulum bobs is resolved each step
// via positional separation + restitution-bounded impulse, applied through
// Verlet's px/py "previous position" so velocity changes propagate naturally
// to the next physics step.
//
// State machine ticks alongside physics each step:
//   spawn (when conditions met) → live → escaped (when |x| past rail bounds)
// Once escaped, escapeVx is frozen for the objective's terminal reward.

(function (BF) {
  'use strict';
  const P = BF.physics;

  function makeState(opts) {
    opts = opts || {};
    return {
      mode:        opts.mode != null ? opts.mode : 'fixed',
      // Default spawn: just below rail, near right end. The cart can swing
      // its bob through the full 280-radius circle around itself, so a ball
      // at (220, 40) is reachable by swinging the bob low-right and lets
      // the pendulum use the FULL workspace rather than being stuck near
      // its upright resting position.
      spawnX:      opts.spawnX != null ? opts.spawnX : 220,
      spawnY:      opts.spawnY != null ? opts.spawnY : 40,
      spawnVx:     opts.spawnVx != null ? opts.spawnVx : 0,
      spawnVy:     opts.spawnVy != null ? opts.spawnVy : 0,
      spawnDelay:  opts.spawnDelay != null ? opts.spawnDelay : 1.0,
      driftSpeed:  opts.driftSpeed != null ? opts.driftSpeed : 60,
      mass:        opts.mass != null ? opts.mass : 0.4,
      radius:      opts.radius != null ? opts.radius : 14,
      restitution: opts.restitution != null ? opts.restitution : 0.7,
      // Runtime state, populated as the rollout runs.
      idx:           null,    // index into world.nodes once spawned
      spawned:       false,
      escaped:       false,
      escapeVx:      0,
      // Direction the ball left the scene through. 'left' / 'right' for
      // horizontal exits past the rail bounds, 'down' / 'up' for vertical
      // exits past the y screen-buffer. Used by objectives that care about
      // which direction the ball went (bounce-ball-out rewards horizontal,
      // penalizes vertical; hit-ball-back rewards 'right' specifically).
      escapeReason:  null,
      // Golf-specific: marked true the moment the ball drops through a
      // floor hole. ball_in_hole objective awards a one-shot terminal
      // when this transitions, gated by sunkRewarded so it doesn't fire
      // every step afterward.
      sunk:          false,
      sunkAtTime:    null,
      sunkRewarded:  false,
      maxAbsVx:      0,       // peak |vx| seen during the rollout
      hits:          0,       // collision events with pendulum nodes
      lastHitTime:   -1,
      floorHits:     0,       // floor-bounce events (counted by the setup tick
                              // by detecting vy sign-flip at floor level). Used
                              // by the ball_in_hole objective for optional
                              // bounce penalty / direct-shot-only gating.
      terminalGiven: false,   // objective uses this to award exit bonus once
      // 'dormant' mode tracks whether the ball has been first-touched yet.
      // While dormant the world node is set to FIXED role so physics
      // doesn't move it; on first overlap the role flips to FREE and
      // gravity / impulses take over.
      dormant:       false,
      activated:     false,   // flips true on first hit (for dormant mode)
    };
  }

  // Tick after physics step. Spawns the ball if conditions are met, tracks
  // peak |vx|, and flips the escaped flag when the ball leaves the rail
  // bounds with margin. `rail` is { minX, maxX } — the rail's horizontal
  // extent (we use it as the "scene" rectangle for the escape check, with a
  // generous buffer so a near-miss doesn't count as exit).
  function tick(state, world, rail) {
    if (!state.spawned && shouldSpawn(state, world.time)) {
      spawn(state, world);
    }
    if (!state.spawned) return;
    const ball = world.nodes[state.idx];
    const vx = Math.abs(ball.vx);
    if (vx > state.maxAbsVx) state.maxAbsVx = vx;
    if (!state.escaped) {
      const buffer = 80;
      const minX = rail.minX - buffer;
      const maxX = rail.maxX + buffer;
      if (ball.x < minX) {
        state.escaped = true;
        state.escapeVx = ball.vx;
        state.escapeReason = 'left';
      } else if (ball.x > maxX) {
        state.escaped = true;
        state.escapeVx = ball.vx;
        state.escapeReason = 'right';
      } else if (ball.y > 400) {
        state.escaped = true;
        state.escapeVx = ball.vx;
        state.escapeReason = 'down';
      } else if (ball.y < -400) {
        state.escaped = true;
        state.escapeVx = ball.vx;
        state.escapeReason = 'up';
      }
    }
  }

  function shouldSpawn(state, t) {
    if (state.mode === 'timed') return t >= state.spawnDelay;
    return true;   // fixed / drift / dormant / pitched spawn immediately
  }

  function spawn(state, world) {
    const isDormant = state.mode === 'dormant';
    const idx = P.addNode(world, state.spawnX, state.spawnY, {
      mass: state.mass, radius: state.radius, label: 'ball',
      // Dormant balls install as FIXED so physics integration leaves them
      // alone (no gravity, no drift). On first overlap with the bat we
      // flip them to FREE.
      role: isDormant ? 2 /* FIXED */ : 0 /* FREE */,
    });
    const node = world.nodes[idx];
    // Drift mode: enter from one edge with lateral velocity. Sign chosen so
    // the ball moves AWAY from where it spawned (toward center).
    if (state.mode === 'drift') {
      const sign = state.spawnX > 0 ? -1 : 1;
      node.vx = sign * state.driftSpeed;
      node.vy = state.spawnVy;
    } else if (state.mode === 'pitched') {
      // Pitched: comes from the right side moving leftward. The bat is
      // expected to swing into it and reverse vx → "hit it back".
      // driftSpeed is reused as the pitch speed magnitude.
      const sign = state.spawnX >= 0 ? -1 : 1;
      node.vx = sign * state.driftSpeed;
      node.vy = state.spawnVy;
    } else if (isDormant) {
      // Dormant: ball is FIXED, no velocity makes sense.
      node.vx = 0; node.vy = 0;
    } else {
      node.vx = state.spawnVx;
      node.vy = state.spawnVy;
    }
    // Encode initial velocity into Verlet "previous position" so the first
    // integrate() step preserves it.
    const dt = 1 / 120;  // approximate; gets corrected next step regardless
    node.px = node.x - node.vx * dt;
    node.py = node.y - node.vy * dt;
    state.idx = idx;
    state.spawned = true;
    state.dormant = isDormant;
  }

  // Resolve collisions: for each pendulum node (anything indexed in
  // segments), test against the ball. On overlap, separate positions and
  // apply an elastic-ish impulse (e = state.restitution). The cart IS
  // included as a collision target now (treated as infinite-mass — its
  // y is on the rail and its x is driven by command, so we don't apply
  // any back-reaction to it; the ball gets all the impulse). This lets
  // the cart act as a paddle in scenarios like bounce-ball-out.
  function resolveCollisions(state, world, segments, dt) {
    if (!state.spawned) return;
    const ball = world.nodes[state.idx];
    const seen = new Set();
    for (const seg of segments) {
      for (const idx of seg) {
        if (seen.has(idx)) continue;
        seen.add(idx);
        const node = world.nodes[idx];
        if (node === ball) continue;
        if (node.role === 2 /* FIXED */) continue;
        const isCart = node.role === 1;
        const dx = ball.x - node.x;
        const dy = ball.y - node.y;
        const dist2 = dx * dx + dy * dy;
        const minDist = ball.radius + node.radius;
        if (dist2 >= minDist * minDist || dist2 < 1e-9) continue;
        const dist = Math.sqrt(dist2);
        const nx = dx / dist, ny = dy / dist;
        const overlap = minDist - dist;
        // Inverse-mass-weighted positional separation. Cart treated as
        // infinite mass (invNode = 0) — it doesn't move from collision;
        // ball gets all the displacement and impulse. Matches "paddle"
        // semantics: cart's actual motion is governed by cartCommand,
        // not by ball impulses.
        const invBall = 1 / Math.max(0.01, ball.mass);
        const invNode = isCart ? 0 : 1 / Math.max(0.01, node.mass);
        const totalInv = invBall + invNode;
        if (totalInv < 1e-6) continue;
        ball.x += nx * overlap * (invBall / totalInv);
        ball.y += ny * overlap * (invBall / totalInv);
        node.x -= nx * overlap * (invNode / totalInv);
        node.y -= ny * overlap * (invNode / totalInv);
        // Hit count: any overlap is a contact event, regardless of whether
        // the impulse step ends up applying force. The objective + HUD care
        // about "did the bob touch the ball this step" — recorded here, not
        // gated behind the approaching-velocity check below.
        state.hits += 1;
        state.lastHitTime = world.time;
        // Dormant-mode activation: first overlap flips the ball to FREE
        // role so subsequent physics steps integrate it normally. Without
        // this transition the impulse we apply below would just be
        // zeroed by integrate()'s FIXED-role branch.
        if (state.dormant && !state.activated) {
          state.dormant = false;
          state.activated = true;
          ball.role = 0; // FREE
        }
        // Relative velocity along the collision normal.
        const relVx = ball.vx - node.vx;
        const relVy = ball.vy - node.vy;
        const relAlongN = relVx * nx + relVy * ny;
        if (relAlongN > 0) continue;  // already separating — no impulse needed
        const e = state.restitution;
        const j = -(1 + e) * relAlongN / totalInv;
        const jx = j * nx, jy = j * ny;
        // Apply impulses by editing px/py: vNew = (x - px) / dt → px = x - vNew·dt
        const ballVx = ball.vx + jx * invBall;
        const ballVy = ball.vy + jy * invBall;
        const nodeVx = node.vx - jx * invNode;
        const nodeVy = node.vy - jy * invNode;
        ball.px = ball.x - ballVx * dt;
        ball.py = ball.y - ballVy * dt;
        node.px = node.x - nodeVx * dt;
        node.py = node.y - nodeVy * dt;
      }
    }
  }

  // Public API.
  BF.ball = { makeState, tick, resolveCollisions };
})(window.BF);
