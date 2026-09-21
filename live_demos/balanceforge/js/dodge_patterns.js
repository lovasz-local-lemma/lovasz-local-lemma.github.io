// BalanceForge -- dodge-mode attack pattern registry.
//
// Each pattern owns its own controller state (timers, spawn queue,
// phase counters) and produces bullets via state.dodge.spawn(...).
// Patterns are registered by id; the setup picks one at world-build
// time and re-uses it across the rollout. Curriculum / UI can drive
// the active pattern via trainer.params.dodgePattern.
//
// Bullets are plain dicts; the dodge setup integrates them in tick()
// (positions move at constant velocity, no gravity, despawn off
// screen).

(function (BF) {
  'use strict';

  const registry = [];

  // Each entry: {
  //   id: 'rain' | 'sweep' | ...
  //   label: human-readable
  //   difficulty: 1..5 (used by curriculum / difficulty ramp UI)
  //   makeController(rng, params): -> controller state
  //   tick(controller, state, dt, rng): may call state.dodge.spawn()
  // }
  function register(spec) { registry.push(spec); }
  function list() { return registry.slice(); }
  function getById(id) {
    for (const p of registry) if (p.id === id) return p;
    return registry[0]; // fallback to first registered
  }

  // ---------- Helpers ----------
  // World bounds from state.worldExtent. Patterns spawn just outside the
  // visible region so bullets enter naturally.
  function worldEdges(state) {
    const e = state.worldExtent || { halfW: 400, halfH: 240 };
    return { left: -e.halfW, right: e.halfW, top: -e.halfH, bot: e.halfH };
  }
  function clampSpawnRate(s) { return Math.max(0.1, Math.min(20, s)); }

  // ---------- rain ----------
  // Bullets fall from top at random x, fixed vy. Simplest pattern.
  register({
    id: 'rain',
    label: 'Rain (falling bullets)',
    difficulty: 1,
    makeController(rng, params) {
      return {
        nextSpawn: 0,
        rate:  clampSpawnRate(params.spawnRate || 1.5),
        speed: params.speed || 200,
        size:  params.bulletSize || 6,
      };
    },
    tick(c, state, dt, rng) {
      c.nextSpawn -= dt;
      while (c.nextSpawn <= 0) {
        const e = worldEdges(state);
        // Spawn x covers the full playfield minus one bullet radius on
        // each side so bullets are fully visible at spawn but reach
        // every column including the corners. The previous +20/-20
        // inset created a "corner safe-spot" exploit: bullets fall
        // straight down (vx=0) so any x outside the spawn range stays
        // forever unhittable. Wall-clamp at setups.js:1859-1862 pinned
        // an agent with constant cmd=[+1,+1] at exactly x=±halfW, which
        // was 20px outside the bullet range -> 100% survival forever
        // regardless of spawn rate. Trained policies discovered this
        // and the whole "corner attractor" picture came from it.
        const x = rng.range(e.left + c.size, e.right - c.size);
        state.dodge.spawn({ x: x, y: e.top - c.size, vx: 0, vy: c.speed, r: c.size });
        c.nextSpawn += 1 / c.rate;
      }
    },
  });

  // ---------- sweep ----------
  // Horizontal walls of bullets spawn at left or right edge, traveling
  // across. Wave spacing creates gaps the agent must thread through.
  register({
    id: 'sweep',
    label: 'Sweep (horizontal walls)',
    difficulty: 2,
    makeController(rng, params) {
      return {
        nextWave: 0,
        wavePeriod: 1.0 / Math.max(0.1, params.spawnRate || 1.0),
        speed: params.speed || 220,
        size: params.bulletSize || 6,
        bulletsPerWave: Math.max(3, Math.floor((params.bulletsPerWave || 8))),
        gapFraction: 0.3, // 30% of the wave is gap
      };
    },
    tick(c, state, dt, rng) {
      c.nextWave -= dt;
      while (c.nextWave <= 0) {
        const e = worldEdges(state);
        const fromLeft = rng.next() < 0.5;
        const startX = fromLeft ? (e.left - c.size) : (e.right + c.size);
        const vx     = fromLeft ?  c.speed : -c.speed;
        // Wave spans the world vertically with a random gap location.
        const gapCenter = rng.range(e.top + 40, e.bot - 40);
        const gapHalf   = (e.bot - e.top) * c.gapFraction * 0.5;
        // Random per-wave vertical offset so no fixed y position is
        // permanently safe between bullet rows. Before this, bullets
        // were locked to a fixed grid {-220, -157, -94, -31, +31,
        // +94, +157, +220} for bulletsPerWave=8; y=0 (center) was
        // never a bullet row and the 31px gap to the nearest row was
        // wider than the agent+bullet collision radius (16px), giving
        // the still-at-center baseline 100% survival regardless of
        // spawn rate. yJitter lifts that fixed grid so over many waves
        // every y gets sampled.
        const yStep = (e.bot - e.top) / (c.bulletsPerWave - 1);
        const yJitter = rng.range(0, yStep);
        const ys = [];
        for (let i = 0; i < c.bulletsPerWave; i++) {
          const y = e.top + yJitter + i * yStep;
          // Bullets that overshoot past e.bot are dropped (not wrapped)
          // so the wave still respects the playfield boundary.
          if (y >= e.bot) continue;
          if (Math.abs(y - gapCenter) >= gapHalf) ys.push(y);
        }
        for (const y of ys) {
          state.dodge.spawn({ x: startX, y: y, vx: vx, vy: 0, r: c.size });
        }
        c.nextWave += c.wavePeriod;
      }
    },
  });

  // ---------- aimed ----------
  // Bullets spawn at the edges and aim at the agent's CURRENT position
  // when they fire. Standard "homing burst" pattern -- forces the agent
  // to keep moving so the bullet's lead is wrong by the time it arrives.
  register({
    id: 'aimed',
    label: 'Aimed (fires at current position)',
    difficulty: 3,
    makeController(rng, params) {
      return {
        nextSpawn: 0,
        rate:  clampSpawnRate(params.spawnRate || 1.2),
        speed: params.speed || 240,
        size:  params.bulletSize || 6,
      };
    },
    tick(c, state, dt, rng) {
      c.nextSpawn -= dt;
      while (c.nextSpawn <= 0) {
        const e = worldEdges(state);
        const agent = state.world.nodes[state.agentIdx];
        // Pick a random edge to spawn from.
        const edge = rng.int(4);
        let sx, sy;
        if (edge === 0)      { sx = rng.range(e.left, e.right); sy = e.top    - c.size; }
        else if (edge === 1) { sx = rng.range(e.left, e.right); sy = e.bot    + c.size; }
        else if (edge === 2) { sx = e.left  - c.size;           sy = rng.range(e.top, e.bot); }
        else                 { sx = e.right + c.size;           sy = rng.range(e.top, e.bot); }
        const dx = (agent ? agent.x : 0) - sx;
        const dy = (agent ? agent.y : 0) - sy;
        const m = Math.hypot(dx, dy) || 1;
        state.dodge.spawn({
          x: sx, y: sy,
          vx: c.speed * dx / m,
          vy: c.speed * dy / m,
          r: c.size,
        });
        c.nextSpawn += 1 / c.rate;
      }
    },
  });

  // ---------- predict_and_aimed ----------
  // Smarter aimed pattern: tracks the agent's recent positions and
  // extrapolates forward by `leadTime` seconds before firing. Linear
  // mode (default) uses last-two-position velocity; quadratic samples
  // the last 3 to estimate acceleration too. Higher-order is still
  // capped at quadratic in v1 -- past that the variance dominates the
  // signal and the pattern becomes noisy rather than challenging.
  register({
    id: 'predict_and_aimed',
    label: 'Predict-and-aim (extrapolates motion)',
    difficulty: 4,
    makeController(rng, params) {
      return {
        nextSpawn: 0,
        rate:  clampSpawnRate(params.spawnRate || 1.0),
        speed: params.speed || 260,
        size:  params.bulletSize || 6,
        leadTime: Math.max(0, Math.min(2.5, params.leadTime || 0.6)),
        order: (params.predictOrder === 'quadratic') ? 'quadratic' : 'linear',
        history: [],   // recent {t, x, y} samples
        elapsed: 0,
      };
    },
    tick(c, state, dt, rng) {
      c.elapsed += dt;
      // Sample agent position. Bounded history; older entries drop off.
      const agent = state.world.nodes[state.agentIdx];
      if (agent) {
        c.history.push({ t: c.elapsed, x: agent.x, y: agent.y });
        while (c.history.length > 8) c.history.shift();
      }
      c.nextSpawn -= dt;
      while (c.nextSpawn <= 0) {
        const e = worldEdges(state);
        // Estimate where the agent WILL be in leadTime seconds.
        let px = agent ? agent.x : 0;
        let py = agent ? agent.y : 0;
        if (c.history.length >= 2) {
          const last = c.history[c.history.length - 1];
          const prev = c.history[c.history.length - 2];
          const ddt = Math.max(1e-3, last.t - prev.t);
          const vx = (last.x - prev.x) / ddt;
          const vy = (last.y - prev.y) / ddt;
          px = last.x + vx * c.leadTime;
          py = last.y + vy * c.leadTime;
          if (c.order === 'quadratic' && c.history.length >= 3) {
            const prev2 = c.history[c.history.length - 3];
            const ddt2 = Math.max(1e-3, prev.t - prev2.t);
            const vx2 = (prev.x - prev2.x) / ddt2;
            const vy2 = (prev.y - prev2.y) / ddt2;
            const ax = (vx - vx2) / Math.max(1e-3, (last.t - prev2.t) * 0.5);
            const ay = (vy - vy2) / Math.max(1e-3, (last.t - prev2.t) * 0.5);
            // Add the 0.5·a·t² quadratic term.
            px += 0.5 * ax * c.leadTime * c.leadTime;
            py += 0.5 * ay * c.leadTime * c.leadTime;
          }
        }
        // Clamp the predicted target to the playing field so spawn
        // angles stay sane (an over-aggressive extrapolation can hurl
        // bullets at the corner of nowhere).
        px = Math.max(e.left + 10, Math.min(e.right - 10, px));
        py = Math.max(e.top  + 10, Math.min(e.bot   - 10, py));
        // Spawn from random edge, aim at the predicted point.
        const edge = rng.int(4);
        let sx, sy;
        if (edge === 0)      { sx = rng.range(e.left, e.right); sy = e.top    - c.size; }
        else if (edge === 1) { sx = rng.range(e.left, e.right); sy = e.bot    + c.size; }
        else if (edge === 2) { sx = e.left  - c.size;           sy = rng.range(e.top, e.bot); }
        else                 { sx = e.right + c.size;           sy = rng.range(e.top, e.bot); }
        const dx = px - sx, dy = py - sy;
        const m = Math.hypot(dx, dy) || 1;
        state.dodge.spawn({
          x: sx, y: sy,
          vx: c.speed * dx / m,
          vy: c.speed * dy / m,
          r: c.size,
        });
        c.nextSpawn += 1 / c.rate;
      }
    },
  });

  // ---------- spiral ----------
  // Bullets emit radially from a moving point that rotates around the
  // world center. Two parameters dominate: spawn rate (density of the
  // spiral arms) and rotation speed (how fast the source spins). Looks
  // visually striking and tests whether the policy can READ a pattern
  // rather than just respond to nearest bullets.
  register({
    id: 'spiral',
    label: 'Spiral (rotating emitter)',
    difficulty: 3,
    makeController(rng, params) {
      return {
        nextSpawn: 0,
        rate:    clampSpawnRate(params.spawnRate || 3.0),
        speed:   params.speed || 200,
        size:    params.bulletSize || 6,
        // Emitter orbit: radius from world center + angular velocity.
        orbitRadius:    params.orbitRadius != null ? params.orbitRadius : 0,
        spinSpeed:      params.spinSpeed   != null ? params.spinSpeed   : 1.2,  // rad/s
        // Angular increment between successive bullets, governing how
        // "tight" each arm of the spiral looks.
        bulletStepRad:  0.35,
        phase: 0,
      };
    },
    tick(c, state, dt, rng) {
      c.phase += c.spinSpeed * dt;
      c.nextSpawn -= dt;
      while (c.nextSpawn <= 0) {
        // Emitter at world origin; orbitRadius optionally moves it.
        const ex = Math.cos(c.phase) * c.orbitRadius;
        const ey = Math.sin(c.phase) * c.orbitRadius;
        // Bullet direction advances each emission so successive bullets
        // trace a spiral arm.
        c.phase += c.bulletStepRad;
        const dir = c.phase;
        const cosD = Math.cos(dir), sinD = Math.sin(dir);
        // Spawn the bullet OUTSIDE the spawn-collision radius from the
        // emitter so a stationary agent right next to the emitter
        // doesn't auto-die at gen 0 (the spiral previously was
        // unwinnable because the very first bullet appeared at the
        // origin where the agent starts).
        const offset = 40;
        state.dodge.spawn({
          x: ex + cosD * offset,
          y: ey + sinD * offset,
          vx: c.speed * cosD,
          vy: c.speed * sinD,
          r: c.size,
        });
        c.nextSpawn += 1 / c.rate;
      }
    },
  });

  // ---------- mixed ----------
  // Runs MULTIPLE component patterns concurrently. Each component has
  // its own independent controller state -- they don't share spawn
  // timers, so the user sees genuinely-overlapping bullet streams from
  // different attack styles. Default mix: rain + aimed (a common
  // bullet-hell preset). The mix list can be overridden via params
  // (string-array of pattern ids); fractions of each component's spawn
  // rate are split equally across the mix so the user-set spawn rate
  // still controls overall density.
  register({
    id: 'mixed',
    label: 'Mixed (composed patterns)',
    difficulty: 4,
    makeController(rng, params) {
      const mix = (params.mixedComponents && params.mixedComponents.length > 0)
        ? params.mixedComponents
        : ['rain', 'aimed'];
      // Build a sub-controller for each component, sharing the params
      // dict (so each sees the same speed/size/etc.) but with its own
      // independent rng so timing doesn't accidentally align.
      const components = [];
      for (let i = 0; i < mix.length; i++) {
        const id = mix[i];
        const def = registry.find(r => r.id === id && r.id !== 'mixed');
        if (!def) continue;
        // Spawn-rate fairness: split the user's rate across components so
        // total bullets-per-second stays ~constant regardless of how many
        // sub-patterns are in the mix.
        const subParams = Object.assign({}, params, {
          spawnRate: (params.spawnRate || 1.5) / mix.length,
        });
        const subRng = BF.util.makeRng(((rng.next() * 1e9) | 0) ^ (0xC8001 + i * 17));
        components.push({ def: def, ctrl: def.makeController(subRng, subParams), rng: subRng });
      }
      return { components: components };
    },
    tick(c, state, dt, rng) {
      for (const comp of c.components) {
        comp.def.tick(comp.ctrl, state, dt, comp.rng);
      }
    },
  });

  BF.dodgePatterns = { register, list, getById };
})(window.BF);
