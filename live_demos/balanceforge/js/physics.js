// BalanceForge — physics core
// Verlet integration with positional rod constraints + Hookean springs + cart rail.
// Coordinates: x to the right, y downward (screen space). Angles measured from +y axis.

(function (BF) {
  'use strict';

  // Node roles influence how integration treats them.
  // FREE: standard particle. CART: position constrained to rail (1D). FIXED: anchor (no motion).
  const Role = Object.freeze({ FREE: 0, CART: 1, FIXED: 2 });

  function makeWorld(opts) {
    return {
      gravity: opts && opts.gravity != null ? opts.gravity : 900,
      damping: opts && opts.damping != null ? opts.damping : 0.005,
      cartAccel: opts && opts.cartAccel != null ? opts.cartAccel : 1600,
      cartMaxSpeed: opts && opts.cartMaxSpeed != null ? opts.cartMaxSpeed : 600,
      // Linear viscous drag coefficient on the cart -- FORCE mode only.
      // Terminal velocity at full command = cartAccel / cartDrag, so the
      // speed is bounded by real friction physics rather than a hard
      // clamp. Ignored by 'accel'/'velocity' modes (kept identical).
      cartDrag: opts && opts.cartDrag != null ? opts.cartDrag : 8,
      // 'accel' (default): command is a TARGET velocity (× cartMaxSpeed)
      // approached at rate cartAccel, then hard-clamped to cartMaxSpeed
      // -- like a velocity-servo motor. 'velocity': cart velocity
      // instantly equals command × cartMaxSpeed (Pendulum-NEAT's default,
      // non-physical, easiest). 'force': command is an applied
      // acceleration; with linear cartDrag the cart reaches a terminal
      // velocity ON ITS OWN (no artificial cap) -- the most physical
      // model, what a real force-driven cart against friction does.
      cartControlMode: opts && opts.cartControlMode || 'accel',
      // When false, the cart can travel arbitrarily far along x. Useful for
      // swing-up training where bouncing off a wall mid-pump kills the run.
      cartWallsEnabled: opts && opts.cartWallsEnabled !== false,
      rodIterations: 8,
      nodes: [],
      rods: [],
      springs: [],
      jointActuators: [],
      jointCmds: [],
      cart: null, // index into nodes (or null)
      cartMinX: -240,
      cartMaxX: 240,
      cartRailY: 0,
      cartCommand: 0, // [-1, 1]
      cartVx: 0,
      time: 0,
      energy: 0,
      // External impulses queued for next step.
      pendingImpulses: [],
    };
  }

  function addNode(w, x, y, opts) {
    const role = opts && opts.role != null ? opts.role : Role.FREE;
    const node = {
      x: x, y: y,
      px: x, py: y, // previous position (Verlet)
      vx: 0, vy: 0, // velocities derived from positions
      mass: opts && opts.mass != null ? opts.mass : 1.0,
      radius: opts && opts.radius != null ? opts.radius : 8,
      role: role,
      label: opts && opts.label || '',
    };
    w.nodes.push(node);
    return w.nodes.length - 1;
  }

  function addRod(w, a, b, lengthOverride) {
    const na = w.nodes[a], nb = w.nodes[b];
    const dx = na.x - nb.x, dy = na.y - nb.y;
    const len = lengthOverride != null ? lengthOverride : Math.hypot(dx, dy);
    w.rods.push({ a: a, b: b, length: len });
  }

  function addSpring(w, a, b, opts) {
    const na = w.nodes[a], nb = w.nodes[b];
    const dx = na.x - nb.x, dy = na.y - nb.y;
    const rest = opts && opts.restLength != null ? opts.restLength : Math.hypot(dx, dy);
    w.springs.push({
      a: a, b: b,
      restLength: rest,
      stiffness: opts && opts.stiffness != null ? opts.stiffness : 60,
      damping: opts && opts.damping != null ? opts.damping : 4,
    });
  }

  function setCart(w, nodeIdx, opts) {
    w.cart = nodeIdx;
    w.cartRailY = w.nodes[nodeIdx].y;
    if (opts) {
      if (opts.minX != null) w.cartMinX = opts.minX;
      if (opts.maxX != null) w.cartMaxX = opts.maxX;
    }
    w.nodes[nodeIdx].role = Role.CART;
    w.nodes[nodeIdx].mass = opts && opts.mass != null ? opts.mass : 6.0;
  }

  function applyImpulse(w, nodeIdx, ix, iy) {
    w.pendingImpulses.push({ idx: nodeIdx, ix: ix, iy: iy });
  }

  // Step the world by dt seconds with the given normalized cart command.
  function step(w, dt, command) {
    w.cartCommand = Math.max(-1, Math.min(1, command || 0));
    integrate(w, dt);
    solveRods(w);
    enforceRail(w);
    deriveVelocities(w, dt);
    w.time += dt;
  }

  function integrate(w, dt) {
    const g = w.gravity;
    const damp = 1.0 - w.damping; // velocity decay per step
    // Apply pending impulses first.
    for (let i = 0; i < w.pendingImpulses.length; i++) {
      const p = w.pendingImpulses[i];
      const n = w.nodes[p.idx];
      if (n.role === 2) continue;
      n.vx += p.ix / n.mass;
      n.vy += p.iy / n.mass;
      // Reflect into Verlet "previous" position so impulse is preserved.
      n.px = n.x - n.vx * dt;
      n.py = n.y - n.vy * dt;
    }
    w.pendingImpulses.length = 0;

    for (let i = 0; i < w.nodes.length; i++) {
      const n = w.nodes[i];
      // Some standalone setups integrate their agent explicitly in setup.tick.
      // Do not apply an additional Verlet drift to that same body.
      if (n.externallyIntegrated) continue;
      if (n.role === 2) { // FIXED — anchor stays put
        n.px = n.x; n.py = n.y;
        n.vx = 0; n.vy = 0;
        continue;
      }
      // Verlet velocity from last frame
      const vx = (n.x - n.px) * damp;
      const vy = (n.y - n.py) * damp;
      n.px = n.x;
      n.py = n.y;
      // Apply forces
      let ax = 0;
      // Gravity scaling per-node. The dodge agent sets gravityScale = 0
      // so it doesn't fall while the policy drives it; pendulum bobs
      // leave it null (treated as 1). The cart is always treated as
      // gravity-immune because its rail reacts to vertical force.
      const gScale = (n.gravityScale != null) ? n.gravityScale : 1;
      let ay = (n.role === 1 /* CART */) ? 0 : g * gScale;
      // Spring forces (apply as accelerations on both ends)
      n.x = n.x + vx + ax * dt * dt;
      n.y = n.y + vy + ay * dt * dt;
    }

    // Springs: apply Hookean force as positional bias (semi-implicit-ish)
    for (let i = 0; i < w.springs.length; i++) {
      const s = w.springs[i];
      const a = w.nodes[s.a], b = w.nodes[s.b];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      const ext = len - s.restLength;
      // Damping along the spring axis using current velocity estimate.
      const vax = (a.x - a.px) / dt, vay = (a.y - a.py) / dt;
      const vbx = (b.x - b.px) / dt, vby = (b.y - b.py) / dt;
      const relV = ((vbx - vax) * dx + (vby - vay) * dy) / len;
      const forceMag = s.stiffness * ext + s.damping * relV;
      const fx = (forceMag) * (dx / len);
      const fy = (forceMag) * (dy / len);
      // Distribute by inverse mass
      const invMa = a.role === 2 ? 0 : 1 / a.mass;
      const invMb = b.role === 2 ? 0 : 1 / b.mass;
      const sumInv = invMa + invMb || 1;
      a.x += (fx * invMa / sumInv) * dt * dt;
      a.y += (fy * invMa / sumInv) * dt * dt;
      b.x -= (fx * invMb / sumInv) * dt * dt;
      b.y -= (fy * invMb / sumInv) * dt * dt;
    }

    // Joint actuators (internal motors): apply the BF.chainJoint couple as
    // positional biases (same convention as the spring loop above). Each
    // actuator {a,b,c} uses world.jointCmds[i] as its torque. No-op when the
    // setup didn't configure any (base-only chains, every non-chain setup).
    const JA = w.jointActuators;
    if (JA && JA.length) {
      for (let i = 0; i < JA.length; i++) {
        const j = JA[i];
        const tau = (w.jointCmds && w.jointCmds[i]) || 0;
        if (!tau) continue;
        const na = w.nodes[j.a], nb = w.nodes[j.b], nc = w.nodes[j.c];
        const f = BF.chainJoint.jointCouple(na.x, na.y, nb.x, nb.y, nc.x, nc.y, tau);
        const invMa = na.role === 2 ? 0 : 1 / na.mass;
        const invMb = nb.role === 2 ? 0 : 1 / nb.mass;
        const invMc = nc.role === 2 ? 0 : 1 / nc.mass;
        na.x += f.fa.x * invMa * dt * dt; na.y += f.fa.y * invMa * dt * dt;
        nb.x += f.fb.x * invMb * dt * dt; nb.y += f.fb.y * invMb * dt * dt;
        nc.x += f.fc.x * invMc * dt * dt; nc.y += f.fc.y * invMc * dt * dt;
      }
    }

    // Cart drive. Skipped when w.cartFrozen is true — used by golf-style
    // setups that lock the cart in place after a single strike (so the
    // policy can\'t cheese the task by continuously pushing the ball
    // along the floor).
    if (w.cart != null && !w.cartFrozen) {
      const cart = w.nodes[w.cart];
      const want = w.cartCommand * w.cartMaxSpeed;
      let nv;
      if (w.cartControlMode === 'velocity') {
        // Direct velocity assignment — no acceleration limit. The cart velocity
        // becomes the command instantly each step. This matches Pendulum-NEAT
        // and turns cart-pole into a much easier control problem.
        nv = want;
      } else if (w.cartControlMode === 'force') {
        // True force model: the command is an applied ACCELERATION
        // (command × cartAccel), and the cart feels a linear viscous
        // drag (cartDrag). A terminal velocity = cartAccel / cartDrag
        // EMERGES from the physics — there is no artificial speed cap,
        // exactly like a real motor pushing a cart against friction.
        // Implicit (backward-Euler) integration so it's unconditionally
        // stable for any dt / cartDrag:
        //     v_{n+1} = (v_n + a·dt) / (1 + cartDrag·dt)
        // When the command is 0 the cart coasts to a stop with time
        // constant 1/cartDrag (rolling friction), which is the physical
        // "damping should already limit the speed" behaviour the cart
        // never actually had before (damping only acted on the bobs).
        const cur = (cart.x - cart.px) / dt;
        const a = w.cartCommand * w.cartAccel;
        const c = w.cartDrag > 0 ? w.cartDrag : 0;
        nv = (cur + a * dt) / (1 + c * dt);
      } else {
        const cur = (cart.x - cart.px) / dt;
        nv = cur + Math.max(-w.cartAccel * dt, Math.min(w.cartAccel * dt, want - cur));
      }
      if (w.cartControlMode === 'force') {
        // No cartMaxSpeed clamp in force mode — drag sets the top speed.
        // Only a generous absolute numerical guard so a pathological
        // config (cartDrag=0 + command pinned for the whole rollout)
        // can't blow the Verlet solver up. It sits far above any sane
        // terminal velocity, so it never bites in normal use; it is
        // NOT the artificial control limit cartMaxSpeed used to be.
        const SAFETY = 1e5;
        if (nv >  SAFETY) nv =  SAFETY;
        if (nv < -SAFETY) nv = -SAFETY;
      } else {
        if (nv > w.cartMaxSpeed) nv = w.cartMaxSpeed;
        if (nv < -w.cartMaxSpeed) nv = -w.cartMaxSpeed;
      }
      cart.x = cart.px + nv * dt;
      cart.y = w.cartRailY;
    }
  }

  function solveRods(w) {
    const iters = w.rodIterations;
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < w.rods.length; i++) {
        const r = w.rods[i];
        const a = w.nodes[r.a], b = w.nodes[r.b];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        const diff = (len - r.length) / len;
        const invMa = (a.role === 2) ? 0 : 1 / a.mass;
        const invMb = (b.role === 2) ? 0 : 1 / b.mass;
        const sumInv = invMa + invMb;
        if (sumInv === 0) continue;
        const sa = invMa / sumInv;
        const sb = invMb / sumInv;
        // Cart can only move along x; constrain rail correction afterwards.
        a.x += dx * diff * sa;
        a.y += dy * diff * sa;
        b.x -= dx * diff * sb;
        b.y -= dy * diff * sb;
      }
      // Re-pin rail position
      enforceRail(w);
    }
  }

  function enforceRail(w) {
    if (w.cart == null) return;
    const cart = w.nodes[w.cart];
    cart.y = w.cartRailY;
    if (w.cartWallsEnabled === false) return;
    if (cart.x < w.cartMinX) cart.x = w.cartMinX;
    if (cart.x > w.cartMaxX) cart.x = w.cartMaxX;
  }

  function deriveVelocities(w, dt) {
    let energy = 0;
    for (let i = 0; i < w.nodes.length; i++) {
      const n = w.nodes[i];
      if (n.role === 2) continue;
      if (!n.externallyIntegrated) {
        n.vx = (n.x - n.px) / dt;
        n.vy = (n.y - n.py) / dt;
      }
      const speed2 = n.vx * n.vx + n.vy * n.vy;
      energy += 0.5 * n.mass * speed2;
    }
    w.energy = energy;
  }

  function snapshot(w) {
    // Lightweight position-only snapshot for ghost rendering.
    const out = new Float32Array(w.nodes.length * 2);
    for (let i = 0; i < w.nodes.length; i++) {
      out[i * 2] = w.nodes[i].x;
      out[i * 2 + 1] = w.nodes[i].y;
    }
    return out;
  }

  function clone(w) {
    const copy = makeWorld(w);
    copy.cart = w.cart;
    copy.cartMinX = w.cartMinX;
    copy.cartMaxX = w.cartMaxX;
    copy.cartRailY = w.cartRailY;
    copy.cartCommand = 0;
    copy.cartVx = 0;
    copy.nodes = w.nodes.map(n => ({
      x: n.x, y: n.y,
      px: n.x, py: n.y,
      vx: 0, vy: 0,
      mass: n.mass, radius: n.radius, role: n.role, label: n.label,
    }));
    copy.rods = w.rods.map(r => ({ a: r.a, b: r.b, length: r.length }));
    copy.springs = w.springs.map(s => ({
      a: s.a, b: s.b, restLength: s.restLength,
      stiffness: s.stiffness, damping: s.damping,
    }));
    return copy;
  }

  // Apply a horizontal floor constraint to a single FREE-role node, in
  // place. If the node's bottom (y + radius) penetrates floor.y AND the
  // node isn't currently inside one of floor.holes (a list of {minX,maxX}
  // gap regions), clamp the node to the surface and reflect its vy via
  // Verlet py adjustment with restitution loss + horizontal friction.
  // Cart and FIXED nodes are skipped; balls and pendulum bobs all
  // qualify. dt is the physics step duration the caller is using.
  // Returns:
  //   0 -- no contact (above floor, or in a hole)
  //   1 -- contact at a settle threshold (vy below 30 px/s, just clamped)
  //   2 -- bounce (vy reversed; clearly a moving impact)
  // The bounce vs settle distinction is what callers use to count
  // discrete bounces (e.g. ball_in_hole optional ground-bounce penalty)
  // without false-positives from the ball rolling along the floor.
  function applyFloorCircle(node, floor, dt) {
    if (!node || node.role !== 0 /* FREE */) return 0;
    const r = node.radius != null ? node.radius : 8;
    // Hole pass-through: if the node's center is inside any hole's x
    // range, the floor doesn't apply here (ball falls through the gap).
    if (floor.holes && floor.holes.length > 0) {
      for (const h of floor.holes) {
        if (node.x >= h.minX && node.x <= h.maxX) return 0;
      }
    }
    if (node.y + r <= floor.y) return 0;  // not penetrating
    // Snapshot pre-clamp velocity from the Verlet position delta — this
    // is the ACTUAL incoming velocity of the falling node. Doing this
    // before the y-clamp matters: after we move y, the (y - py) delta
    // would flip sign and we'd compute a bogus reflection.
    const vx = (node.x - node.px) / dt;
    const vy = (node.y - node.py) / dt;
    // Position clamp: surface contact.
    node.y = floor.y - r;
    // Reflect via Verlet — adjust py to encode the post-bounce velocity.
    const restitution = floor.restitution != null ? floor.restitution : 0.55;
    const friction   = floor.friction   != null ? floor.friction   : 0.92;
    // Kill bounces below a tiny vy threshold so the ball settles instead
    // of jittering forever on the floor.
    const isBounce = Math.abs(vy) >= 30;
    const newVy = isBounce ? -restitution * vy : 0;
    const newVx = vx * friction;
    node.px = node.x - newVx * dt;
    node.py = node.y - newVy * dt;
    return isBounce ? 2 : 1;
  }

  BF.physics = {
    Role, makeWorld, addNode, addRod, addSpring, setCart,
    applyImpulse, step, snapshot, clone, applyFloorCircle,
  };
})(window.BF);
