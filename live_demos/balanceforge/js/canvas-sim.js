// BalanceForge — live simulation renderer (cart, rails, rods, springs, anchors, trail, ghosts).

(function (BF) {
  'use strict';
  const { fitCanvas, rgba, signedColor } = BF.util;

  function makeSimRenderer(canvas) {
    const trail = [];
    const trailMax = 220;
    const ghostTrails = []; // arrays of trail points per ghost
    // Ball trail: separate buffer keyed by ball-spawn-instance so the path
    // resets whenever the ball respawns (rather than smearing across runs).
    const ballTrail = [];
    const ballTrailMax = 80;
    let ballTrailKey = null;  // re-init buffer when this changes
    let lastSetupId = null;
    // Last computed viewport mapping. Populated each draw() so app.js can
    // convert canvas mouse coords back to world coords for edit-mode
    // drag handles.
    const lastViewport = { scale: 1, ox: 0, oy: 0, valid: false };
    // Camera state. When walls are on, camera stays at world-origin. When walls
    // are off, camera follows the cart with critical-ish damping so the user
    // can keep visual track even if the cart drifts arbitrarily far.
    const camera = { x: 0 };
    const CAMERA_LERP = 0.06; // per render tick — feels like a heavy boom
    // USER camera: wheel zoom (cursor-anchored) + middle-mouse pan, composed on
    // top of the fit-to-extent base scale and the follow camera. Per-renderer
    // (canvas B gets its own). Reset on scene change (setSetup) + dblclick.
    const userCam = { zoom: 1, panX: 0, panY: 0 };
    function resetCamera() { userCam.zoom = 1; userCam.panX = 0; userCam.panY = 0; }
    function panBy(dx, dy) { userCam.panX += dx; userCam.panY += dy; }
    // Zoom about a canvas point (cx,cy): the world point under the cursor
    // stays under the cursor. Works off lastViewport (the mapping the user
    // is actually looking at).
    function zoomAt(cx, cy, factor) {
      if (!lastViewport.valid) return;
      const z1 = Math.max(0.2, Math.min(10, userCam.zoom * factor));
      const rr = z1 / userCam.zoom;
      if (rr === 1) return;
      const oxNew = cx - (cx - lastViewport.ox) * rr;
      const oyNew = cy - (cy - lastViewport.oy) * rr;
      userCam.panX += oxNew - lastViewport.ox;
      userCam.panY += oyNew - lastViewport.oy;
      userCam.zoom = z1;
    }

    function pushTrail(x, y) {
      trail.push([x, y, 1.0]);
      if (trail.length > trailMax) trail.shift();
    }

    function clearTrail() {
      trail.length = 0; ghostTrails.length = 0;
      ballTrail.length = 0; ballTrailKey = null;
      camera.x = 0;
    }

    function setSetup(id) {
      if (id !== lastSetupId) {
        clearTrail();
        resetCamera();   // a new scene deserves the default framing
        lastSetupId = id;
      }
    }

    function draw(state, opts) {
      opts = opts || {};
      const fit = fitCanvas(canvas);
      const ctx = canvas.getContext('2d');
      const dpr = fit.dpr;
      ctx.save();
      ctx.scale(dpr, dpr);
      const w = fit.cssW, h = fit.cssH;
      ctx.clearRect(0, 0, w, h);
      // World viewport. Default spans roughly -300..300 horizontally and
      // -350..50 vertically (700 × 500 units). Setups can override via
      // state.worldExtent = { halfW, halfH } for bigger scenes — the
      // camera then zooms out to fit the larger area into the canvas.
      const world = state.world;
      const cart = world.nodes[state.cartIdx];
      const ext = state.worldExtent || { halfW: 350, halfH: 250 };
      // Base fit-to-extent scale × the user's wheel zoom.
      const scale = Math.min((w - 80) / (2 * ext.halfW), (h - 80) / (2 * ext.halfH))
                    * userCam.zoom;
      // Camera target: when walls are on, stay at origin (full rail visible).
      // When walls are off, smoothly follow the cart so it stays roughly on
      // screen no matter how far it drifts.
      const wallsOn = world.cartWallsEnabled !== false;
      // A terrain runner is a scrolling world, independent of pendulum walls.
      // Keep that scene contract even if a legacy record carries walls=true.
      const targetCamX = state.terrainRun || !wallsOn ? cart.x : 0;
      camera.x += (targetCamX - camera.x) * CAMERA_LERP;
      const ox = w * 0.5 - camera.x * scale + userCam.panX;
      const oy = (Number.isFinite(ext.centerY) ? h * 0.5 - ext.centerY * scale : h * 0.55) + userCam.panY;

      const W = (x) => ox + x * scale;
      const H = (y) => oy + y * scale;
      // Persist mapping for app.js's edit-mode hit testing + zoomAt anchoring.
      lastViewport.scale = scale;
      lastViewport.ox = ox;
      lastViewport.oy = oy;
      lastViewport.valid = true;

      drawBackdrop(ctx, w, h);
      drawRail(ctx, world, scale, W, H, w);
      // Floors (if the setup defines any). Drawn before everything else
      // so bobs / ball / arrows sit on top.
      if (state.floors && state.floors.length > 0) {
        drawFloors(ctx, state.floors, W, H, w);
      }
      // Golf ground lumps: unmovable half-buried domes on the fairway.
      // Only the upper semicircle is drawn so nothing pokes below the
      // floor stripe; palette matches the floor (dim amber).
      if (state.groundLumps && state.groundLumps.length > 0) {
        drawGroundLumps(ctx, state.groundLumps, W, H, scale);
      }
      if (state.groundRamps) for (const ramp of state.groundRamps) {
        const canopy=ramp.section==='canopy';
        ctx.save();
        const gradient=ctx.createLinearGradient(0,H(Math.min(ramp.a.y,ramp.b.y)),0,H(ramp.baseY));
        gradient.addColorStop(0,canopy?'#7f8d9b':'#58765e');gradient.addColorStop(1,canopy?'#293743':'#213f38');
        ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(W(ramp.a.x),H(ramp.baseY));
        ctx.lineTo(W(ramp.a.x),H(ramp.a.y));ctx.lineTo(W(ramp.b.x),H(ramp.b.y));ctx.lineTo(W(ramp.b.x),H(ramp.baseY));ctx.closePath();ctx.fill();
        ctx.strokeStyle=canopy?'#d0dfea':'#a5d2a5';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(W(ramp.a.x),H(ramp.a.y));ctx.lineTo(W(ramp.b.x),H(ramp.b.y));ctx.stroke();
        ctx.restore();
      }
      // Terrain-run tilemap + goal + runner box. Drawn here (before the ghosts,
      // trail and skeleton) so the course sits BEHIND the runner.
      if (state.terrainRun) drawTerrainOverlay(ctx, state, W, H, scale, w, h);
      // World-origin guide line — only meaningful when walls are off and the
      // cart has drifted, but cheap to always draw faintly.
      if (!wallsOn && !state.terrainRun) drawOriginGuide(ctx, W, oy, h);

      // Ghosts (top-N other agents)
      if (opts.ghosts && opts.ghosts.length > 0) {
        for (let gi = 0; gi < opts.ghosts.length; gi++) {
          drawSkeleton(ctx, opts.ghosts[gi], state, W, H, scale, {
            primary: false,
            color: 'rgba(255,255,255,0.18)',
            edge: 'rgba(106,169,255,0.18)',
            // Epicycle ghosts stay as bare arm outlines — see the anchors note
            // in drawSkeleton and the primary-skeleton note below.
            anchors: !state.epi,
            edgeWidth: state.epi ? 1 : null,
          });
        }
      }

      // Trail
      if (opts.showTrail !== false) {
        const tip = world.nodes[state.tipIdx];
        pushTrail(tip.x, tip.y);
        drawTrail(ctx, W, H);
      } else {
        // Still record so the buffer stays warm; just don't draw.
        const tip = world.nodes[state.tipIdx];
        pushTrail(tip.x, tip.y);
      }

      // Ball trail — update + draw before the bob circles so they sit on
      // top. Uses ball-state's spawn instance as the trail key so the path
      // resets cleanly each rollout.
      if (state.ball && state.ball.spawned && state.ball.idx != null) {
        const ballNode = world.nodes[state.ball.idx];
        // Use (idx + spawn time floor) as a stable key — when the trainer
        // rebuilds the world, the ball lives at a fresh index OR the time
        // resets, so the buffer flushes either way.
        const key = state.ball.idx + ':' + Math.floor((state.ball.lastHitTime != null ? state.ball.lastHitTime : 0) * 1e6);
        // Cheaper: just key by ball node identity.
        if (ballTrailKey !== ballNode) { ballTrail.length = 0; ballTrailKey = ballNode; }
        ballTrail.push([ballNode.x, ballNode.y]);
        if (ballTrail.length > ballTrailMax) ballTrail.shift();
        drawBallTrail(ctx, W, H);
      } else if (ballTrailKey !== null) {
        ballTrail.length = 0; ballTrailKey = null;
      }

      // Springs (drawn beneath rods)
      drawSprings(ctx, world, W, H);

      // Main agent skeleton. The epicycle machine draws its OWN arms instead
      // (drawEpicycleOverlay), with a radius-keyed width/opacity falloff, so
      // the big carriers read and the sub-pixel outer arms stop being noise.
      // The generic skeleton cannot do that: it would join all N pivots with
      // identical 5 px gradient rods AND — because every epicycle node is
      // Role.FIXED — stamp a 12 px amber anchor square on each one while
      // drawing no tip bob at all (the bob loop skips Role.FIXED). That is an
      // unreadable blob by N = 8, which is below the recommended arm count for
      // half the curves.
      if (!state.epi) {
        drawSkeleton(ctx, state, state, W, H, scale, {
          primary: true,
          color: '#e6e9f2',
          edge: '#6aa9ff',
        });
      }

      // Force / control arrow on cart
      drawCartCommand(ctx, world, W, H);

      // Rigid swing-up / LQR modes: an explicit force diagram (kinematic
      // replay sets no cartCommand, so drawCartCommand above is a no-op).
      // Shows WHERE force is applied — the cart control, the rail reaction,
      // and gravity on each bob — so the driven-pivot model reads as physical.
      if (state.diffsimForce) drawDiffsimForces(ctx, state, W, H, scale);

      // Velocity arrow on tip
      drawTipVelocity(ctx, world, state, W, H);

      // Ball-hit overlays — exit gates + speed-gun readout + spawn marker.
      // All keyed off state.ball; no-ops when the ball setup isn't active.
      if (state.ball) drawBallOverlay(ctx, state, W, H, scale, w, h, opts.editMode);
      // Dodge overlay: bullets + agent emphasis + alive/near-miss readouts.
      // No-op when the dodge setup isn't active.
      if (state.dodge) drawDodgeOverlay(ctx, state, W, H, scale);
      // Chain-reach: render the target crosshair so the user can see
      // what the chain tip is trying to touch. No-op for setups without
      // chainReach state. The target.x/y are world coordinates; the
      // existing skeleton-draw scale matrix is already applied, so we
      // just call straight through with world coords.
      if (state.obstacle || state.obstacles) drawObstacle(ctx, state, W, H);   // behind the target + arm
      if (state.plate) drawTray(ctx, state, W, H);
      if (state.chainReach) drawChainReachTarget(ctx, state, W, H);
      if (state.midpoint) drawMidpointDots(ctx, state, W, H);
      if (state.extraDots) drawExtraDots(ctx, state, W, H);
      if (state.chainTrace) drawChainTraceOverlay(ctx, state, W, H);
      // Epicycle signer: nested orbit circles + thin spokes + the persistent
      // ink path. Drawn AFTER the ghost curve so the ink sits on top of it.
      if (state.epi) drawEpicycleOverlay(ctx, state, W, H, scale);
      // Joint torque glyphs — self-guards (no-op unless joints are actuated).
      drawJointTorques(ctx, state, W, H);
      // Win flash — when the ball has been sunk this rollout, draw a
      // bright "GOAL!" callout near the hole and a pulsing rim around
      // the hole region. Tells the user the scene actually succeeded
      // before the auto-reset takes the world away.
      if (state.ball && state.ball.sunk && state.holeRegion) {
        drawHoleWinFlash(ctx, state, W, H, w, h);
      }

      // Disturbance indicator — red arrow + glow at the targeted node when an
      // external push is active. Drawn last so it sits on top of everything.
      if (state.pushAfterglow || state.activePushVis) drawPushIndicator(ctx, state, W, H);

      // Physical-helper overlay (upright-assist arcs + friction legend).
      // Default on; off only when opts.showHelpers === false. `h` is the
      // canvas height in CSS px (computed at the top of draw()).
      if (opts.showHelpers !== false) drawHelperIndicators(ctx, state, W, H, h);

      ctx.restore();
    }

    function drawBackdrop(ctx, w, h) {
      // subtle grid
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      const step = 40;
      for (let x = 0; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawRail(ctx, world, scale, W, H, canvasW) {
      if (world.cart == null) return;
      const railY = world.cartRailY;
      const wallsOn = world.cartWallsEnabled !== false;
      const ry = H(railY);
      let rx0, rx1;
      if (wallsOn) {
        rx0 = W(world.cartMinX - 30);
        rx1 = W(world.cartMaxX + 30);
      } else {
        // Rail extends edge-to-edge of the visible canvas in walls-off mode.
        rx0 = 0; rx1 = canvasW;
      }
      const grad = ctx.createLinearGradient(rx0, ry, rx1, ry);
      grad.addColorStop(0, 'rgba(106,169,255,0.0)');
      grad.addColorStop(0.5, 'rgba(106,169,255,0.6)');
      grad.addColorStop(1, 'rgba(106,169,255,0.0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(rx0, ry);
      ctx.lineTo(rx1, ry);
      ctx.stroke();
      if (wallsOn) {
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(W(world.cartMinX), ry - 14);
        ctx.lineTo(W(world.cartMinX), ry + 14);
        ctx.moveTo(W(world.cartMaxX), ry - 14);
        ctx.lineTo(W(world.cartMaxX), ry + 14);
        ctx.stroke();
      }
    }

    // Faint vertical guide at world x=0 — when walls are off and the camera
    // has tracked the cart away from origin, this line moves on screen and
    // gives the user a fixed reference for how far the cart has drifted.
    function drawOriginGuide(ctx, W, oy, h) {
      const ox = W(0);
      ctx.save();
      ctx.strokeStyle = 'rgba(245, 183, 105, 0.25)';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox + 0.5, 0);
      ctx.lineTo(ox + 0.5, h);
      ctx.stroke();
      ctx.setLineDash([]);
      // small "0" tag at the top of the guide
      ctx.fillStyle = 'rgba(245, 183, 105, 0.55)';
      ctx.font = '10px -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('x=0', ox, 14);
      ctx.restore();
    }

    function drawTrail(ctx, W, H) {
      if (trail.length < 2) return;
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        const p0 = trail[i - 1], p1 = trail[i];
        const t = i / trail.length;
        ctx.strokeStyle = `rgba(78, 224, 192, ${0.05 + t * 0.55})`;
        ctx.lineWidth = 1 + t * 1.6;
        ctx.beginPath();
        ctx.moveTo(W(p0[0]), H(p0[1]));
        ctx.lineTo(W(p1[0]), H(p1[1]));
        ctx.stroke();
      }
      ctx.restore();
    }

    // Win flash — bright "GOAL!" callout above the hole and a pulsing
    // green ring around the hole's rim. Pulse uses performance.now so
    // it animates smoothly even though the underlying sim is paused
    // post-sink (no policy steps once the cart is frozen).
    function drawHoleWinFlash(ctx, state, W, H, cssW, cssH) {
      const h = state.holeRegion;
      if (!h) return;
      const cx = W((h.minX + h.maxX) / 2);
      const cy = H(h.y);
      const widthPx = W(h.maxX) - W(h.minX);
      const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      // Fade the whole flash out over ~1 second of sim time so it
      // doesn't dominate the canvas all the way to the reset. The
      // bright burst is the first ~0.3s; after that it tapers. Without
      // this the user complained "GOAL stays for too long".
      let fade = 1;
      if (state.ball && state.ball.sunkAtTime != null && state.world) {
        const dt = Math.max(0, state.world.time - state.ball.sunkAtTime);
        if (dt < 0.3)      fade = 1;
        else if (dt > 1.2) fade = 0;
        else               fade = 1 - (dt - 0.3) / 0.9;
      }
      if (fade <= 0) return;
      ctx.save();
      // Pulsing ring around the hole.
      ctx.strokeStyle = `rgba(108, 226, 138, ${(fade * (0.45 + 0.45 * pulse)).toFixed(3)})`;
      ctx.lineWidth = 3 + pulse * 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 6, widthPx * 0.7, 12 + pulse * 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      // "GOAL!" label floating above the hole.
      const labelY = cy - 28 - pulse * 6;
      ctx.font = 'bold 22px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(108, 226, 138, ${(fade * (0.65 + 0.35 * pulse)).toFixed(3)})`;
      ctx.shadowColor = `rgba(108, 226, 138, ${(0.85 * fade).toFixed(3)})`;
      ctx.shadowBlur = (12 + pulse * 8) * fade;
      ctx.fillText('GOAL!', cx, labelY);
      ctx.shadowBlur = 0;
      // Sparkle dots radiating outward.
      const sparkleN = 8;
      for (let i = 0; i < sparkleN; i++) {
        const ang = (i / sparkleN) * Math.PI * 2 + t * 0.8;
        const r = 28 + pulse * 14;
        const sx = cx + Math.cos(ang) * r;
        const sy = cy - 8 + Math.sin(ang) * r * 0.6;
        ctx.fillStyle = `rgba(245, 220, 110, ${(fade * (0.4 + 0.5 * pulse)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Render horizontal floors with optional hole gaps. Floor is a thick
    // dim-amber stripe; holes are rendered as dashed outlines so the user
    // can see the gap region without it being invisible.
    // Unmovable golf ground lumps: upper-semicircle domes sitting ON the
    // floor line, filled + top-stroked in the floor's amber palette.
    function drawGroundLumps(ctx, lumps, W, H, scale) {
      ctx.save();
      for (const L of lumps) {
        const cx = W(L.x), cy = H(L.y), r = L.r * scale;
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
        ctx.closePath();
        ctx.fillStyle = 'rgba(245, 183, 105, 0.18)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(245, 183, 105, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawFloors(ctx, floors, W, H, canvasW) {
      ctx.save();
      for (const f of floors) {
        const fy = H(f.y);
        // Find the segments to draw: full canvas span minus hole regions.
        const segments = [];
        const startX = 0, endX = canvasW;
        if (!f.holes || f.holes.length === 0) {
          segments.push([startX, endX]);
        } else {
          // Sort holes by x.
          const sorted = f.holes.slice().sort((a, b) => a.minX - b.minX);
          let cursor = startX;
          for (const h of sorted) {
            const hx0 = W(h.minX), hx1 = W(h.maxX);
            if (hx0 > cursor) segments.push([cursor, Math.min(hx0, endX)]);
            cursor = Math.max(cursor, hx1);
            if (cursor >= endX) break;
          }
          if (cursor < endX) segments.push([cursor, endX]);
        }
        // Solid floor: top edge bright, body fading.
        ctx.fillStyle = 'rgba(245, 183, 105, 0.18)';
        for (const [a, b] of segments) {
          ctx.fillRect(a, fy, b - a, 28);
        }
        ctx.strokeStyle = 'rgba(245, 183, 105, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const [a, b] of segments) {
          ctx.moveTo(a, fy + 0.5);
          ctx.lineTo(b, fy + 0.5);
        }
        ctx.stroke();
        // Hole outlines (dashed).
        if (f.holes && f.holes.length > 0) {
          ctx.strokeStyle = 'rgba(108, 226, 138, 0.85)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          for (const h of f.holes) {
            const hx0 = W(h.minX), hx1 = W(h.maxX);
            // Draw a downward-opening C: floor surface with a gap, walls
            // angling slightly into the hole, bottom faint.
            ctx.beginPath();
            ctx.moveTo(hx0, fy + 0.5);
            ctx.lineTo(hx0, fy + 32);
            ctx.lineTo(hx1, fy + 32);
            ctx.lineTo(hx1, fy + 0.5);
            ctx.stroke();
          }
          ctx.setLineDash([]);
          // Hole label.
          ctx.fillStyle = 'rgba(108, 226, 138, 0.85)';
          ctx.font = '10px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
          ctx.textAlign = 'center';
          for (const h of f.holes) {
            const cx = (W(h.minX) + W(h.maxX)) / 2;
            ctx.fillText('hole', cx, fy + 18);
          }
        }
      }
      ctx.restore();
    }

    // Ball overlays — drawn on top of the simulation when the ball-hit setup
    // is active. Three pieces:
    //   1. Spawn marker — a faint crosshair at the configured spawn position
    //      (only when the ball hasn't spawned yet, so the user can SEE where
    //      it'll appear before training reaches that timestamp).
    //   2. Exit gates — dashed vertical lines at ±(rail.maxX + 80), the
    //      threshold where the objective considers the ball "escaped". Both
    //      lines drawn faint until the ball is alive, then the line on the
    //      side the ball is heading toward gets brighter.
    //   3. Speed-gun readout — large text near the ball showing live |v| and
    //      |vx|, plus session peak |vx|. Once the ball escapes, lock to the
    //      exit velocity so the user sees the final reading.
    // Dodge-mode renderer: bullets as small red circles, agent as a
    // brighter ring with crosshair, world bounds as a faint frame, and
    // a small HUD showing alive-time + near-miss count + (dead?) flag.
    // Reads everything off state.dodge populated by the dodge setup.
    function drawDodgeOverlay(ctx, state, W, H, scale) {
      const d = state.dodge;
      if (!d) return;
      const e = state.worldExtent || { halfW: 360, halfH: 220 };
      // World-bound frame so the user can see the playing field.
      ctx.save();
      ctx.strokeStyle = 'rgba(106, 169, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.strokeRect(W(-e.halfW), H(-e.halfH),
                     (2 * e.halfW) * scale, (2 * e.halfH) * scale);
      ctx.setLineDash([]);
      // Bullets.
      const bullets = d.bullets || [];
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (!b.alive) continue;
        const cx = W(b.x), cy = H(b.y);
        const r = Math.max(1.5, b.r * scale);
        // Outer halo: shows the near-miss zone the policy is rewarded
        // for grazing through. Subtle, doesn't overpower the bullet.
        ctx.fillStyle = 'rgba(255, 102, 128, 0.12)';
        ctx.beginPath();
        ctx.arc(cx, cy, r * 2.5, 0, Math.PI * 2);
        ctx.fill();
        // Bullet body.
        ctx.fillStyle = '#ff6680';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Agent emphasis — the cart-pole renderer already draws the node,
      // but for dodge we want a brighter outline + a crosshair.
      const agent = state.world.nodes[state.agentIdx];
      if (agent) {
        const ax = W(agent.x), ay = H(agent.y);
        const ar = Math.max(4, (agent.radius || 10) * scale);
        ctx.strokeStyle = d.dead ? '#ff6680' : '#6ce28a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ax, ay, ar + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = d.dead ? '#ff6680' : '#6ce28a';
        ctx.beginPath();
        ctx.arc(ax, ay, ar, 0, Math.PI * 2);
        ctx.fill();
      }
      // HUD: alive time + near misses + safe-streak + (hits | dead flag).
      // The safe-streak row shows seconds since the last hit + the
      // rollout high-water mark in parens. In no-die mode the user also
      // sees how often the agent is getting clipped.
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const hudX = W(-e.halfW) + 8, hudY = H(-e.halfH) + 6;
      const hudH = d.noDie ? 62 : 50;  // +12 for the new safe-streak row
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(hudX - 4, hudY - 2, 160, hudH);
      ctx.fillStyle = '#e6e9f2';
      ctx.fillText(`alive ${(d.aliveTime || 0).toFixed(2)}s`, hudX, hudY);
      ctx.fillText(`near misses ${d.nearMisses | 0}`, hudX, hudY + 12);
      // Safe-streak: bright color when streak >= 2s (full bonus reached),
      // dimmer below that so the user gets a visual cue when the policy
      // is in its "fully rewarded for dodging" zone.
      const streak = d.safeStreakTime || 0;
      const longest = d.longestSafeStreak || 0;
      ctx.fillStyle = streak >= 2 ? '#6ce28a' : '#e6e9f2';
      ctx.fillText(`safe ${streak.toFixed(2)}s (best ${longest.toFixed(2)}s)`, hudX, hudY + 24);
      if (d.noDie) {
        // Flash red briefly during the invulnerability window so the user
        // sees hits register even when the agent isn't dying.
        const flicker = d._invulnLeft > 0;
        ctx.fillStyle = flicker ? '#ff6680' : '#e6e9f2';
        ctx.fillText(`hits ${d.hitsTaken | 0}`, hudX, hudY + 36);
        ctx.fillStyle = '#6ce28a';
        ctx.fillText('dodging (no-die)', hudX, hudY + 48);
      } else if (d.dead) {
        ctx.fillStyle = '#ff6680';
        ctx.fillText('— dead —', hudX, hudY + 36);
      } else {
        ctx.fillStyle = '#6ce28a';
        ctx.fillText('alive', hudX, hudY + 36);
      }
      ctx.restore();
    }


    function drawBallOverlay(ctx, state, W, H, scale, cssW, cssH, editMode) {
      const ball = state.ball;
      const rail = state.rail;
      // Edit-mode draws the spawn marker even after the ball spawns, so
      // the user can drag it during an active rollout (the change applies
      // to the next rebuild). Outside edit mode, marker hides once the
      // ball is alive.
      // (1) Spawn marker before ball appears (or anytime in edit mode).
      if (!ball.spawned || editMode) {
        const sx = W(ball.spawnX != null ? ball.spawnX : 220);
        const sy = H(ball.spawnY != null ? ball.spawnY : 40);
        ctx.save();
        // Brighter outline + filled handle in edit mode so user knows it's
        // grabbable.
        const stroke = editMode ? 'rgba(245, 183, 105, 0.85)'
                                : 'rgba(245, 183, 105, 0.45)';
        ctx.strokeStyle = stroke;
        ctx.lineWidth = editMode ? 1.5 : 1;
        ctx.setLineDash([3, 3]);
        const r = (ball.radius || 14) * scale;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();
        // Crosshairs.
        ctx.beginPath();
        ctx.moveTo(sx - r - 6, sy); ctx.lineTo(sx + r + 6, sy);
        ctx.moveTo(sx, sy - r - 6); ctx.lineTo(sx, sy + r + 6);
        ctx.stroke();
        ctx.setLineDash([]);
        if (editMode) {
          // 4-way arrow on the handle to communicate "draggable".
          ctx.fillStyle = 'rgba(245, 183, 105, 0.85)';
          ctx.beginPath();
          ctx.arc(sx, sy, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(245, 183, 105, 0.65)';
        ctx.font = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
        ctx.textAlign = 'left';
        const label = editMode
          ? `drag to reposition · (${Math.round(ball.spawnX || 0)}, ${Math.round(ball.spawnY || 0)})`
          : ball.mode === 'timed'
            ? `ball spawns @ t=${(ball.spawnDelay || 0).toFixed(1)}s`
            : ball.mode === 'drift' ? 'ball drifts in ↘'
            : 'ball spawn';
        ctx.fillText(label, sx + r + 8, sy + 4);
        ctx.restore();
      }

      // (2) Exit gates — dashed verticals on both sides at exit threshold.
      if (rail) {
        const gateX = (rail.maxX != null ? rail.maxX : 260) + 80;
        const xL = W(-gateX), xR = W(gateX);
        ctx.save();
        const liveSide = ball.spawned && !ball.escaped && ball.idx != null
          ? Math.sign(state.world.nodes[ball.idx].vx) : 0;
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.2;
        // Left gate.
        ctx.strokeStyle = liveSide < 0
          ? 'rgba(108, 226, 138, 0.55)' : 'rgba(255, 255, 255, 0.10)';
        ctx.beginPath();
        ctx.moveTo(xL + 0.5, 0); ctx.lineTo(xL + 0.5, cssH);
        ctx.stroke();
        // Right gate.
        ctx.strokeStyle = liveSide > 0
          ? 'rgba(108, 226, 138, 0.55)' : 'rgba(255, 255, 255, 0.10)';
        ctx.beginPath();
        ctx.moveTo(xR + 0.5, 0); ctx.lineTo(xR + 0.5, cssH);
        ctx.stroke();
        ctx.setLineDash([]);
        // Gate labels.
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.font = '10px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
        ctx.textAlign = 'left';
        ctx.fillText('exit ←', xL + 4, 14);
        ctx.textAlign = 'right';
        ctx.fillText('→ exit', xR - 4, 14);
        ctx.restore();
      }

      // (3) Speed-gun readout. Locked to escape velocity once the ball exits,
      // otherwise live numbers near the ball.
      if (ball.spawned && ball.idx != null) {
        const node = state.world.nodes[ball.idx];
        if (!node) return;
        const x = W(node.x), y = H(node.y);
        const speed = Math.hypot(node.vx, node.vy);
        const vx = node.vx;
        const peak = ball.maxAbsVx || 0;
        ctx.save();
        ctx.font = 'bold 13px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        // Place readout to the side opposite the velocity arrow so it
        // doesn't overlap. If ball moving right, label on left; vice versa.
        const labelX = x + (vx >= 0 ? -120 : 24);
        const labelY = y - (node.radius || 14) * scale - 14;
        // Background panel for legibility.
        ctx.fillStyle = 'rgba(11, 13, 18, 0.82)';
        const w = 110, h = 38;
        ctx.fillRect(labelX - 4, labelY - 14, w, h);
        ctx.strokeStyle = 'rgba(245, 183, 105, 0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(labelX - 4 + 0.5, labelY - 14 + 0.5, w - 1, h - 1);
        // Live (or final) speed.
        ctx.fillStyle = ball.escaped ? '#6ce28a' : '#f5b769';
        const arrow = vx >= 0 ? '→' : '←';
        if (ball.escaped) {
          ctx.fillText(`${arrow} ${Math.abs(ball.escapeVx).toFixed(0)}`, labelX, labelY - 1);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = '10px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
          ctx.fillText(`exit · peak ${peak.toFixed(0)}`, labelX, labelY + 12);
        } else {
          ctx.fillText(`${arrow} ${Math.abs(vx).toFixed(0)}`, labelX, labelY - 1);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.font = '10px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
          ctx.fillText(`|v| ${speed.toFixed(0)} · peak ${peak.toFixed(0)}`, labelX, labelY + 12);
        }
        ctx.restore();
      }
    }

    // Ball trail in warm orange — distinct from the teal pendulum-tip trail.
    // Width tapers from leading edge so the most-recent segment is brightest.
    function drawBallTrail(ctx, W, H) {
      if (ballTrail.length < 2) return;
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 1; i < ballTrail.length; i++) {
        const p0 = ballTrail[i - 1], p1 = ballTrail[i];
        const t = i / ballTrail.length;
        ctx.strokeStyle = `rgba(245, 183, 105, ${0.04 + t * 0.55})`;
        ctx.lineWidth = 0.8 + t * 1.4;
        ctx.beginPath();
        ctx.moveTo(W(p0[0]), H(p0[1]));
        ctx.lineTo(W(p1[0]), H(p1[1]));
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawSkeleton(ctx, target, mainState, W, H, scale, style) {
      const world = target.world;
      const isPrimary = !!style.primary;

      // segments
      ctx.save();
      ctx.lineCap = 'round';
      for (const [a, b] of target.segments) {
        const na = world.nodes[a], nb = world.nodes[b];
        ctx.strokeStyle = isPrimary
          ? createSegmentGradient(ctx, W(na.x), H(na.y), W(nb.x), H(nb.y))
          : style.edge;
        ctx.lineWidth = (style.edgeWidth != null) ? style.edgeWidth : (isPrimary ? 5 : 2);
        ctx.beginPath();
        ctx.moveTo(W(na.x), H(na.y));
        ctx.lineTo(W(nb.x), H(nb.y));
        ctx.stroke();
      }
      // anchors. style.anchors === false suppresses them: the epicycle machine
      // is a MINIMAL-COORDINATE mechanism whose every node is Role.FIXED, so
      // the generic rule "FIXED ⇒ amber anchor square" would stamp a 12 px
      // square on all N pivots. Its own overlay marks the one real anchor.
      for (const n of (style.anchors === false ? [] : world.nodes)) {
        if (n.role === 2) {
          ctx.fillStyle = 'rgba(245,183,105,0.35)';
          ctx.strokeStyle = '#f5b769';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.rect(W(n.x) - 6, H(n.y) - 6, 12, 12);
          ctx.fill(); ctx.stroke();
        }
      }
      // bobs (and ball, rendered distinctively)
      for (let i = 0; i < world.nodes.length; i++) {
        const n = world.nodes[i];
        if (n.role === 2) continue;
        if (n.role === 1) continue; // cart drawn separately
        const isTip = (i === target.tipIdx);
        const isBall = n.label === 'ball';
        ctx.beginPath();
        if (isBall) {
          // Orange for the ball — visually distinct from blue/teal pendulum
          // bobs. Brighter on primary, dimmer on ghosts.
          ctx.fillStyle = isPrimary ? '#f5b769' : 'rgba(245, 183, 105, 0.5)';
        } else {
          ctx.fillStyle = isPrimary
            ? (isTip ? '#4ee0c0' : style.color)
            : style.color;
        }
        ctx.strokeStyle = isPrimary ? '#0b0d12' : 'transparent';
        ctx.lineWidth = isPrimary ? 1.5 : 0;
        // Visual radius matches the physics hitbox 1:1 — the previous 0.8×
        // factor made circles look smaller than their collision bounds, so
        // a ball "pushed" by another would visually have a gap between
        // them at the moment of contact. Render at full scale instead.
        ctx.arc(W(n.x), H(n.y), n.radius * Math.max(0.6, scale), 0, Math.PI * 2);
        ctx.fill();
        if (isPrimary) ctx.stroke();
        // Ball velocity arrow — shows the projectile's direction + speed.
        // Length scales with |v|, capped so a fast ball doesn't draw a 1km arrow.
        if (isBall && isPrimary) {
          const vMag = Math.hypot(n.vx, n.vy);
          if (vMag > 5) {
            const arrowScale = Math.min(0.18, 30 / vMag);
            const vx = n.vx * arrowScale;
            const vy = n.vy * arrowScale;
            const x0 = W(n.x), y0 = H(n.y);
            const x1 = x0 + vx, y1 = y0 + vy;
            ctx.strokeStyle = '#f5b769';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
            ctx.stroke();
            // Arrowhead.
            const ang = Math.atan2(vy, vx);
            const ah = 6;
            ctx.fillStyle = '#f5b769';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x1 - ah * Math.cos(ang - 0.5), y1 - ah * Math.sin(ang - 0.5));
            ctx.lineTo(x1 - ah * Math.cos(ang + 0.5), y1 - ah * Math.sin(ang + 0.5));
            ctx.closePath();
            ctx.fill();
          }
        }
      }
      // cart
      if (world.cart != null) {
        const cart = world.nodes[world.cart];
        const cw = 60, ch = 26;
        ctx.fillStyle = isPrimary ? 'rgba(106,169,255,0.85)' : 'rgba(255,255,255,0.1)';
        ctx.strokeStyle = isPrimary ? '#6aa9ff' : 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        roundRect(ctx, W(cart.x) - cw / 2, H(cart.y) - ch / 2, cw, ch, 6);
        ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }

    function createSegmentGradient(ctx, x0, y0, x1, y1) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, '#6aa9ff');
      g.addColorStop(1, '#4ee0c0');
      return g;
    }

    // Renders the helper overlay plan onto the canvas. Dumb: all logic is
    // in computeHelperOverlay(); this only maps world->screen and strokes.
    // Drawn for the PRIMARY agent only (helpers are world-level; per-ghost
    // would be redundant clutter).
    // cssH = the canvas height in CSS px (draw() already computed it as
    // `h`); used to anchor the legend to the bottom-left.
    function drawHelperIndicators(ctx, state, W, H, cssH) {
      const ov = computeHelperOverlay(state);
      if (!ov) return;
      ctx.save();
      // --- upright-assist arcs at each pivot ---
      const R = 22;
      for (let i = 0; i < ov.arcs.length; i++) {
        const a = ov.arcs[i];
        const cx = W(a.px), cy = H(a.py);
        ctx.globalAlpha = a.alpha;
        ctx.strokeStyle = '#f5b769';
        ctx.lineWidth = a.width;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, R, a.a0, a.a1, a.anticlockwise);
        ctx.stroke();
        // Arrowhead at the straight-up end of the arc (the spring target).
        const ex = cx + R * Math.cos(a.arrowAngle);
        const ey = cy + R * Math.sin(a.arrowAngle);
        // Tangent at the arrow end (perpendicular to the radius), pointing
        // along the sweep direction so the head reads as "rotating to up".
        const tang = a.arrowAngle + (a.anticlockwise ? -Math.PI / 2 : Math.PI / 2);
        const ah = 5;
        ctx.fillStyle = '#f5b769';
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - ah * Math.cos(tang - 0.5), ey - ah * Math.sin(tang - 0.5));
        ctx.lineTo(ex - ah * Math.cos(tang + 0.5), ey - ah * Math.sin(tang + 0.5));
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // --- friction legend, bottom-left, rows stacked upward ---
      if (ov.legend.length > 0) {
        ctx.font = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const rowH = 15, padX = 8, padY = 5, left = 10;
        let maxW = 0;
        const texts = ov.legend.map(r => `${r.symbol} ${r.label}  ${r.value}`);
        for (const t of texts) maxW = Math.max(maxW, ctx.measureText(t).width);
        const panelW = maxW + padX * 2;
        const panelH = rowH * ov.legend.length + padY * 2;
        const panelX = left;
        const panelY = cssH - 12 - panelH;
        ctx.fillStyle = 'rgba(11,13,18,0.6)';
        roundRect(ctx, panelX, panelY, panelW, panelH, 5);
        ctx.fill();
        for (let i = 0; i < ov.legend.length; i++) {
          const r = ov.legend[i];
          const ry = panelY + padY + rowH * i + rowH / 2;
          ctx.fillStyle = '#f5b769';
          ctx.fillText(r.symbol, panelX + padX, ry);
          ctx.fillStyle = 'rgba(230,233,242,0.75)';
          ctx.fillText(`  ${r.label}  ${r.value}`, panelX + padX + 12, ry);
        }
      }
      ctx.restore();
    }

    function roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawSprings(ctx, world, W, H) {
      ctx.save();
      ctx.lineWidth = 1.5;
      for (const s of world.springs) {
        const a = world.nodes[s.a], b = world.nodes[s.b];
        const x0 = W(a.x), y0 = H(a.y), x1 = W(b.x), y1 = H(b.y);
        const dx = x1 - x0, dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const nx = -uy, ny = ux;
        const coils = 12;
        const amp = 6;
        ctx.strokeStyle = '#f5b769';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        for (let i = 1; i <= coils; i++) {
          const t = i / (coils + 1);
          const sx = x0 + ux * len * t + nx * amp * (i % 2 === 0 ? 1 : -1);
          const sy = y0 + uy * len * t + ny * amp * (i % 2 === 0 ? 1 : -1);
          ctx.lineTo(sx, sy);
        }
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Force diagram for the rigid swing-up / LQR display. force = {cartAccel,
    // wall, cartIdx, bobs} where cartAccel/wall are normalized to [-1,1].
    function drawDiffsimForces(ctx, state, W, H, scale) {
      const f = state.diffsimForce;
      const nodes = state.world.nodes;
      const cart = nodes[f.cartIdx];
      if (!cart) return;
      ctx.save();
      const arrow = (x0, y0, dx, dy, color, width) => {
        const len = Math.hypot(dx, dy);
        if (len < 1.5) return;
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width || 3;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + dx, y0 + dy); ctx.stroke();
        const ux = dx / len, uy = dy / len, hx = x0 + dx, hy = y0 + dy, hs = 7;
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx - ux * hs - uy * hs * 0.6, hy - uy * hs + ux * hs * 0.6);
        ctx.lineTo(hx - ux * hs + uy * hs * 0.6, hy - uy * hs - ux * hs * 0.6);
        ctx.closePath(); ctx.fill();
      };
      const cx = W(cart.x), cy = H(cart.y);
      // Cart control force (the actuator): horizontal, green +x / red -x.
      const CTRL = 90;   // px per unit normalized accel
      arrow(cx, cy - 30, f.cartAccel * CTRL, 0, f.cartAccel >= 0 ? '#6ce28a' : '#ff6680', 3.5);
      ctx.fillStyle = 'rgba(230,235,245,0.75)';
      ctx.font = '11px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('cart force', cx, cy - 46);
      // Rail reaction (only at the walls) — amber, opposes the cart. This is
      // the one spot the pendulum sees an inconsistency ("external force").
      if (Math.abs(f.wall) > 0.01) {
        arrow(cx, cy - 12, f.wall * CTRL, 0, '#f5b769', 3);
        ctx.fillStyle = '#f5b769';
        ctx.fillText('rail push', cx, cy + 4);
      }
      // Gravity on each bob (downward) — the ONLY force the links feel.
      ctx.textAlign = 'left';
      for (const bi of (f.bobs || [])) {
        const nb = nodes[bi];
        if (!nb) continue;
        arrow(W(nb.x), H(nb.y), 0, 26, 'rgba(140,170,255,0.7)', 2);
      }
      ctx.restore();
    }

    function drawCartCommand(ctx, world, W, H) {
      if (world.cart == null) return;
      const cart = world.nodes[world.cart];
      const cmd = world.cartCommand;
      if (Math.abs(cmd) < 0.01) return;
      const x0 = W(cart.x);
      const y0 = H(cart.y) + 26;
      const len = 60 * cmd;
      ctx.save();
      ctx.strokeStyle = cmd > 0 ? '#6ce28a' : '#ff6680';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + len, y0);
      ctx.stroke();
      // arrow head
      const dir = Math.sign(len);
      const tipX = x0 + len;
      ctx.beginPath();
      ctx.moveTo(tipX, y0 - 5);
      ctx.lineTo(tipX + dir * 8, y0);
      ctx.lineTo(tipX, y0 + 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function drawPushIndicator(ctx, state, W, H) {
      const vis = BF.disturb.visualAt(state) || (!state.pushAfterglow && state.activePushVis);
      if (!vis) return;
      const node = state.world.nodes[vis.target];
      if (!node) return;
      const x0 = W(node.x);
      const y0 = H(node.y);
      // Arrow length scales with peak strength but is capped so insanely
      // strong pushes don't take over the view.
      const fx = vis.fx;
      const fy = vis.fy;
      const len = Math.hypot(fx, fy);
      if (!len) return;
      // Small physical impulses still deserve an unmistakable indication.
      const arrowLength = Math.min(100, 44 + 10 * Math.log1p(len / 16));
      const sx = fx * arrowLength / len;
      const sy = fy * arrowLength / len;
      const x1 = x0 + sx;
      const y1 = y0 + sy;

      ctx.save();
      ctx.globalAlpha = vis.alpha == null ? 1 : vis.alpha;
      ctx.shadowColor = '#ffbd78';
      ctx.shadowBlur = 17;
      // Halo on the targeted node so the eye is drawn there even before the
      // arrow registers.
      ctx.fillStyle = `rgba(255, 102, 128, ${0.18 + 0.25 * vis.scale})`;
      ctx.beginPath();
      ctx.arc(x0, y0, 16 + 8 * vis.scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#fff0c9';
      ctx.fillStyle = '#fff0c9';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      // Arrowhead
      const ang = Math.atan2(sy, sx);
      const ah = 13;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - ah * Math.cos(ang - 0.4), y1 - ah * Math.sin(ang - 0.4));
      ctx.lineTo(x1 - ah * Math.cos(ang + 0.4), y1 - ah * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 5;
      ctx.font = '600 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(vis.afterglow ? 'NUDGE · fading marker' : 'NUDGE', x0 + sx / 2, y0 + sy / 2 - 15);

      ctx.restore();
    }

    function drawTipVelocity(ctx, world, state, W, H) {
      const tip = world.nodes[state.tipIdx];
      const vx = tip.vx, vy = tip.vy;
      if (vx * vx + vy * vy < 50) return;
      const k = 0.06;
      const x0 = W(tip.x), y0 = H(tip.y);
      const x1 = x0 + vx * k, y1 = y0 + vy * k;
      ctx.save();
      ctx.strokeStyle = 'rgba(78,224,192,0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
    }

    // Convert canvas-space pixel coords (event.offsetX/Y) to world coords
    // using the most-recently-rendered viewport mapping. Returns null if
    // the renderer hasn't drawn yet (mapping not initialized).
    function worldFromScreen(canvasX, canvasY) {
      if (!lastViewport.valid) return null;
      return {
        x: (canvasX - lastViewport.ox) / lastViewport.scale,
        y: (canvasY - lastViewport.oy) / lastViewport.scale,
      };
    }
    function worldToScreen(worldX, worldY) {
      if (!lastViewport.valid) return null;
      return {
        x: lastViewport.ox + worldX * lastViewport.scale,
        y: lastViewport.oy + worldY * lastViewport.scale,
      };
    }
    return { draw, clearTrail, setSetup, worldFromScreen, worldToScreen,
             panBy, zoomAt, resetCamera };
  }

  // Pure render-plan builder for the helper overlay. No canvas / no
  // transforms — returns world-space pivots + canvas arc angles + style,
  // so it is unit-testable in Node. Returns null for any state that
  // isn't a pendulum-helper setup (so the overlay never clutters other
  // setups). uprightAssist / jointDamping are numbers (>=0) on the
  // double-pendulum state and absent (undefined) elsewhere.
  function computeHelperOverlay(state) {
    if (!state || !state.world || !Array.isArray(state.segments)) return null;
    if (state.uprightAssist == null && state.jointDamping == null) return null;
    const STRONG = 0.30; // uprightAssist value treated as "full strength"
    const ua = +state.uprightAssist || 0;
    const arcs = [];
    if (ua > 0) {
      const s = ua / STRONG;
      const strength = s < 0 ? 0 : (s > 1 ? 1 : s);
      const alpha = 0.30 + 0.60 * strength;
      const width = 1.5 + 2.5 * strength;
      for (let i = 0; i < state.segments.length; i++) {
        const pa = state.world.nodes[state.segments[i][0]];
        const pb = state.world.nodes[state.segments[i][1]];
        if (!pa || !pb) continue;
        // Canvas math angle (y points down on screen, same sign as
        // world y, scale positive => bearing is transform-invariant).
        const angleA = Math.atan2(pb.y - pa.y, pb.x - pa.x); // ray pivot->bob
        const angleB = -Math.PI / 2;                          // straight up on screen
        // Signed minor delta in (-PI, PI].
        const d = Math.atan2(Math.sin(angleB - angleA), Math.cos(angleB - angleA));
        arcs.push({
          px: pa.x, py: pa.y,
          a0: angleA, a1: angleA + d,
          anticlockwise: d < 0,
          arrowAngle: angleB,
          strength: strength, alpha: alpha, width: width,
        });
      }
    }
    const legend = [];
    const damp = (state.world.damping != null) ? state.world.damping : 0;
    legend.push({ symbol: '≈', label: 'friction', value: damp.toFixed(3) });
    const jd = +state.jointDamping || 0;
    if (jd > 0) {
      legend.push({ symbol: '⊙', label: 'joint friction', value: jd.toFixed(1) });
    }
    return { arcs: arcs, legend: legend };
  }

  // Terrain run: the tilemap, the goal post, the progress high-water mark and
  // the runner's AABB. Everything is read off state.terrainRun, which the
  // setup owns — the world node is only a mirror, so the box drawn here is
  // the ACTUAL collision box the sim resolves against (2·agentHalfW ×
  // 2·agentHalfH), not an approximation of it.
  //
  // The sim works in [0, gridH·TILE] with +y down; tr.viewOffsetY re-centres
  // it on the world origin so the existing camera (which follows the mirror
  // node once walls are off) frames the course with no special casing here.
  // Only the columns/rows inside the viewport are visited, so a 250-tile
  // crucible course costs the same to draw as an 84-tile hard course.
  function drawTerrainOverlay(ctx, state, W, H, scale, cssW, cssH) {
    const tr = state.terrainRun;
    if (!tr || !tr.terrain) return;
    const TILE = (BF.setups && BF.setups.TERRAIN_TILE) || 20;
    const T = tr.terrain, off = tr.viewOffsetY;
    const ox = W(0), oy = H(0);
    const sx2wx = (sx) => (sx - ox) / scale;
    const sy2wy = (sy) => (sy - oy) / scale + off;
    const c0 = Math.max(0, Math.floor(sx2wx(0) / TILE) - 1);
    const c1 = Math.min(T.W - 1, Math.ceil(sx2wx(cssW) / TILE) + 1);
    const r0 = Math.max(0, Math.floor(sy2wy(0) / TILE) - 1);
    const r1 = Math.min(T.H - 1, Math.ceil(sy2wy(cssH) / TILE) + 1);
    const px = (col) => W(col * TILE);
    const py = (row) => H(row * TILE - off);
    const sz = TILE * scale;

    ctx.save();
    // --- solid tiles. Surface tiles (nothing solid directly above) get a
    // brighter cap so the walkable line reads at a glance. ---
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (T.grid[r * T.W + c] !== 1) continue;
        const x = px(c), y = py(r);
        ctx.fillStyle = 'rgba(106,169,255,0.16)';
        ctx.fillRect(x, y, sz + 0.5, sz + 0.5);
        const above = (r > 0) ? T.grid[(r - 1) * T.W + c] : 0;
        if (above !== 1) {
          ctx.fillStyle = 'rgba(106,169,255,0.55)';
          ctx.fillRect(x, y, sz + 0.5, Math.max(1, sz * 0.16));
        }
      }
    }
    // --- hazard tiles: spikes, pointing AWAY from the surface they sit on
    // (ground spikes point up, ceiling spikes point down). ---
    ctx.fillStyle = '#ff6680';
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (T.grid[r * T.W + c] !== 2) continue;
        const x = px(c), y = py(r);
        const down = ((r + 1) < T.H) ? T.grid[(r + 1) * T.W + c] : 0;
        const teeth = 3, tw = sz / teeth;
        for (let t = 0; t < teeth; t++) {
          ctx.beginPath();
          if (down === 1) {           // resting on ground -> point up
            ctx.moveTo(x + t * tw, y + sz);
            ctx.lineTo(x + t * tw + tw / 2, y);
            ctx.lineTo(x + (t + 1) * tw, y + sz);
          } else {                    // ceiling spike -> point down
            ctx.moveTo(x + t * tw, y);
            ctx.lineTo(x + t * tw + tw / 2, y + sz);
            ctx.lineTo(x + (t + 1) * tw, y);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    // --- start line + furthest-x high-water mark (the reward potential:
    // score is Δ(this line), so the user can literally watch it get paid) ---
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(230,233,242,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W(tr.startX), 0); ctx.lineTo(W(tr.startX), cssH); ctx.stroke();
    ctx.strokeStyle = 'rgba(78,224,192,0.55)';
    ctx.beginPath(); ctx.moveTo(W(tr.maxX), 0); ctx.lineTo(W(tr.maxX), cssH); ctx.stroke();
    ctx.setLineDash([]);
    // --- goal post ---
    {
      const gx = W(tr.goalX);
      ctx.strokeStyle = '#6ce28a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, cssH); ctx.stroke();
      ctx.fillStyle = tr.reachedGoal ? '#6ce28a' : 'rgba(108,226,138,0.5)';
      ctx.beginPath();
      ctx.moveTo(gx, py(T.H * 0.12));
      ctx.lineTo(gx + 22, py(T.H * 0.12) + 9);
      ctx.lineTo(gx, py(T.H * 0.12) + 18);
      ctx.closePath(); ctx.fill();
    }
    // --- the runner: its true AABB ---
    {
      const a = tr.agent, P = tr.P;
      const x = W(a.x - P.agentHalfW), y = H(a.y - P.agentHalfH - off);
      const w2 = 2 * P.agentHalfW * scale, h2 = 2 * P.agentHalfH * scale;
      ctx.fillStyle = tr.dead ? 'rgba(255,102,128,0.35)'
        : (a.grounded ? 'rgba(108,226,138,0.35)' : 'rgba(245,183,105,0.35)');
      ctx.strokeStyle = tr.dead ? '#ff6680' : (a.grounded ? '#6ce28a' : '#f5b769');
      ctx.lineWidth = 1.5;
      ctx.fillRect(x, y, w2, h2);
      ctx.strokeRect(x, y, w2, h2);
    }
    // --- HUD: tiles gained / course length, jumps, state ---
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const hudX = 10, hudY = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(hudX - 4, hudY - 2, 178, 50);
    ctx.fillStyle = '#e6e9f2';
    const tiles = (tr.maxX - tr.startX) / TILE;
    const span = (tr.goalX - tr.startX) / TILE;
    ctx.fillText('tiles ' + tiles.toFixed(1) + ' / ' + span.toFixed(1) +
                 '  (' + tr.P.difficulty + ')', hudX, hudY);
    ctx.fillText('jumps ' + (tr.jumps | 0) + '   t ' + tr.time.toFixed(2) + 's', hudX, hudY + 12);
    ctx.fillText('course ' + T.W + ' tiles  seed ' + tr.terrainSeed, hudX, hudY + 24);
    if (tr.dead) {
      ctx.fillStyle = '#ff6680';
      ctx.fillText('— dead (' + (tr.deathCause || '?') + ') —', hudX, hudY + 36);
    } else if (tr.reachedGoal) {
      ctx.fillStyle = '#6ce28a';
      ctx.fillText('GOAL', hudX, hudY + 36);
    } else {
      ctx.fillStyle = tr.agent.grounded ? '#6ce28a' : '#f5b769';
      ctx.fillText(tr.agent.grounded ? 'grounded' : 'airborne (air control ×' +
        tr.P.airControl + ')', hudX, hudY + 36);
    }
    ctx.restore();
  }

  // Draw the chain-reach target as a small crosshair + ring. W/H map world
  // coords → screen pixels (the draw loop passes them as functions; there is
  // NO world-space ctx transform — peer helpers like drawTrail/drawSkeleton
  // map the same way). scale = W(1)-W(0) converts world-unit radii to px.
  // Bright cyan so it doesn't collide with bullet red, ball yellow, hole green.
  function drawChainReachTarget(ctx, state, W, H) {
    const cr = state.chainReach;
    if (!cr || !cr.target) return;
    const scale = W(1) - W(0);
    const sx = W(cr.target.x);
    const sy = H(cr.target.y);
    const r = (cr.successRadius != null ? cr.successRadius : 30) * scale;
    ctx.save();
    ctx.strokeStyle = 'rgba(108, 226, 226, 0.75)';
    ctx.fillStyle = 'rgba(108, 226, 226, 0.12)';
    ctx.lineWidth = 1.5;
    // Success ring
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Inner dot
    ctx.fillStyle = 'rgba(108, 226, 226, 0.9)';
    ctx.beginPath();
    ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    ctx.fill();
    // Crosshair
    const cross = r * 0.55;
    ctx.strokeStyle = 'rgba(108, 226, 226, 0.55)';
    ctx.beginPath();
    ctx.moveTo(sx - cross, sy); ctx.lineTo(sx + cross, sy);
    ctx.moveTo(sx, sy - cross); ctx.lineTo(sx, sy + cross);
    ctx.stroke();
    ctx.restore();
  }

  // Midpoint-meet overlay: the two amber SOURCE dots whose average the cart must
  // hold, plus a faint connecting segment. The midpoint itself is drawn as the
  // teal chain-reach target (the thing the cart tracks); these two are the
  // inputs. No-op for every other setup (guarded on state.midpoint).
  function drawMidpointDots(ctx, state, W, H) {
    const mp = state.midpoint;
    if (!mp) return;
    const y = H(mp.railY);
    const x1 = W(mp.dot1x), x2 = W(mp.dot2x);
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 183, 105, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y); ctx.lineTo(x2, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245, 183, 105, 0.9)';
    ctx.beginPath(); ctx.arc(x1, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x2, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Generic source-dot overlay: draws each dot in state.extraDots ([{x,y},...])
  // as a small amber dot (e.g. prioritize-nearest's three candidate dots; the
  // chosen/nearest one is highlighted separately as the teal chain-reach target).
  // No-op for every other setup (guarded on state.extraDots).
  function drawExtraDots(ctx, state, W, H) {
    const dots = state.extraDots;
    if (!dots || !dots.length) return;
    ctx.save();
    ctx.fillStyle = 'rgba(245, 183, 105, 0.85)';
    for (const d of dots) {
      ctx.beginPath();
      ctx.arc(W(d.x), H(d.y), 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Obstacle overlay: a red "keep-out" circle for the arm-obstacle scene (the
  // reach_avoid reward repels the hand from it). No-op for every other setup.
  function drawObstacle(ctx, state, W, H) {
    const list = [];
    if (state.obstacle) list.push(state.obstacle);
    if (state.obstacles) for (let i = 0; i < state.obstacles.length; i++) list.push(state.obstacles[i]);
    if (!list.length) return;
    const scale = W(1) - W(0);
    ctx.save();
    ctx.fillStyle = 'rgba(230, 90, 90, 0.16)';
    ctx.strokeStyle = 'rgba(230, 90, 90, 0.7)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < list.length; i++) {
      const ob = list[i];
      ctx.beginPath();
      ctx.arc(W(ob.x), H(ob.y), ob.r * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // Plate-spin overlay: the cart's concave tray + the ball sitting in it at its
  // current offset (the ball is a 1-D bowl dynamics, not a physics node). No-op
  // for every other setup (guarded on state.plate).
  function drawTray(ctx, state, W, H) {
    const pl = state.plate;
    if (!pl) return;
    const cart = state.world.nodes[state.cartIdx];
    const scale = W(1) - W(0);
    const cx = W(cart.x), ty = H(pl.trayY);
    const half = pl.half * scale;
    const dip = Math.max(8, Math.min(18, 12 * scale));
    ctx.save();
    ctx.strokeStyle = 'rgba(150, 200, 240, 0.9)';
    ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - half, ty - dip);
    ctx.quadraticCurveTo(cx, ty + dip, cx + half, ty - dip);
    ctx.stroke();
    // The ball, riding ON the bowl surface at its offset. The drawn tray is the
    // quadratic Bézier P0=(-half,ty-dip), P1=(0,ty+dip), P2=(half,ty-dip); its
    // surface height as a function of f = offset/half works out to exactly
    // surfY = ty - dip*f² (deepest at center f=0, lips at ±dip·... = ty-dip at f=±1).
    // The old formula used a DIFFERENT (inverted) parabola, so the ball floated off
    // the surface — worst at the lip, where it overlapped the tray. Radius is drawn
    // in WORLD units (ballR*scale) so the ball's edge kisses the wall exactly at the
    // ±(half-ballR) bounce point (matches the setup tick's exact collision).
    const f = pl.offset / pl.half;
    const bx = W(cart.x + pl.offset);
    const surfY = ty - dip * f * f;          // bowl surface at this offset (screen y)
    const r = (pl.ballR || 9) * scale;
    ctx.fillStyle = 'rgba(245, 200, 110, 0.95)';
    ctx.strokeStyle = 'rgba(180, 130, 50, 0.9)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(bx, surfY - r, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // Draw the signing-machine viz: the full target curve as a faint dashed
  // ghost loop, the tip's recent path as a fading trail, and a marker at the
  // current curve(t) target. W/H map world coords → screen pixels (see
  // drawChainReachTarget; there is NO world-space ctx transform).
  function drawChainTraceOverlay(ctx, state, W, H) {
    const ct = state.chainTrace;
    if (!ct) return;
    ctx.save();
    // ORDERED mode: the band, plus the thing that actually matters — WHERE the
    // frontier is. Waypoints already claimed by the run in flight are green,
    // everything ahead is grey, and the frontier itself is a bright ring: the
    // one point on the whole drawing that can pay right now. When a run breaks
    // the green collapses back to nothing, which is the visual the objective is
    // named after.
    const od = state.ordered;
    if (od && od.pts && od.pts.length) {
      const scale = Math.abs(W(1) - W(0)) || 1;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(108, 226, 226, 0.10)';
      ctx.lineWidth = 2 * od.w * scale;
      ctx.beginPath();
      for (let i = 0; i <= od.NW; i++) {
        const p = od.pts[i % od.NW];
        const x = W(p.x), y = H(p.y);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      const claimed = new Uint8Array(od.NW);
      if (od.start >= 0) for (let k = 0; k < od.doneCount; k++) claimed[(od.start + k) % od.NW] = 1;
      for (let i = 0; i < od.NW; i++) {
        const p = od.pts[i];
        ctx.fillStyle = claimed[i] ? 'rgba(120, 230, 140, 0.95)' : 'rgba(150, 165, 175, 0.40)';
        ctx.beginPath(); ctx.arc(W(p.x), H(p.y), claimed[i] ? 2.6 : 1.6, 0, Math.PI * 2); ctx.fill();
      }
      const tr = ct.trail || [], npts = tr.length / 2;
      ctx.lineWidth = 2.2;
      for (let i = 1; i < npts; i++) {
        const a = (i / npts);
        ctx.strokeStyle = 'rgba(245, 183, 105, ' + (0.05 + a * 0.6).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(W(tr[(i - 1) * 2]), H(tr[(i - 1) * 2 + 1]));
        ctx.lineTo(W(tr[i * 2]), H(tr[i * 2 + 1]));
        ctx.stroke();
      }
      const g = state.chainReach && state.chainReach.target;
      if (g) {
        ctx.strokeStyle = 'rgba(108, 226, 226, 0.95)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(W(g.x), H(g.y), 6, 0, Math.PI * 2); ctx.stroke();
      }
      let topI = 0, topY = Infinity;
      for (let i = 0; i < od.NW; i++) { const sy = H(od.pts[i].y); if (sy < topY) { topY = sy; topI = i; } }
      ctx.fillStyle = 'rgba(120, 230, 140, 0.92)';
      ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('traced in order ' + Math.round((od.bestRun / od.NW) * 100) + '%' +
                   (od.runs > 0 ? '  (' + od.runs + ' break' + (od.runs === 1 ? '' : 's') + ')' : ''),
                   W(od.pts[topI].x), topY - 10);
      ctx.restore();
      return;
    }
    // PAINT / COVERAGE mode: draw the ACCEPTABLE-RANGE band as a thick
    // translucent tube, with per-sample coverage dots (green = painted, gray =
    // not) so you can watch the band fill in. No moving-target marker (there is
    // no cursor); instead a cyan dot marks the current guide (nearest unpainted).
    // STROKE mode: same band, but the pen state is what you watch. The tube is
    // drawn twice — the inner (ink/pen-down) radius and the outer pen-LIFT
    // radius — and the tube brightens while the pen is down, so a stroke break
    // is visible as the band going dim. Readout carries the stroke COUNT, which
    // is the number the objective is actually minimizing.
    const sk = state.stroke;
    if (sk && sk.pts && sk.pts.length) {
      const scale = Math.abs(W(1) - W(0)) || 1;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const bandPath = () => {
        ctx.beginPath();
        for (let i = 0; i <= sk.pts.length; i++) {
          const p = sk.pts[i % sk.pts.length];
          const x = W(p.x), y = H(p.y);
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
      };
      ctx.strokeStyle = 'rgba(108, 226, 226, 0.05)';
      ctx.lineWidth = 2 * sk.wLift * scale; bandPath(); ctx.stroke();
      ctx.strokeStyle = sk.penDown ? 'rgba(120, 230, 140, 0.16)' : 'rgba(108, 226, 226, 0.09)';
      ctx.lineWidth = 2 * sk.w * scale; bandPath(); ctx.stroke();
      for (let i = 0; i < sk.pts.length; i++) {
        const p = sk.pts[i];
        const on = sk.covered && sk.covered[i];
        ctx.fillStyle = on ? 'rgba(120, 230, 140, 0.95)' : 'rgba(150, 165, 175, 0.45)';
        ctx.beginPath(); ctx.arc(W(p.x), H(p.y), on ? 2.6 : 1.6, 0, Math.PI * 2); ctx.fill();
      }
      const tr = ct.trail || [];
      const npts = tr.length / 2;
      ctx.lineWidth = 2.2;
      for (let i = 1; i < npts; i++) {
        const a = (i / npts);
        ctx.strokeStyle = 'rgba(245, 183, 105, ' + (0.05 + a * 0.6).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(W(tr[(i - 1) * 2]), H(tr[(i - 1) * 2 + 1]));
        ctx.lineTo(W(tr[i * 2]), H(tr[i * 2 + 1]));
        ctx.stroke();
      }
      const g = state.chainReach && state.chainReach.target;
      if (g) {
        ctx.fillStyle = sk.penDown ? 'rgba(120, 230, 140, 0.95)' : 'rgba(108, 226, 226, 0.95)';
        ctx.beginPath(); ctx.arc(W(g.x), H(g.y), 4, 0, Math.PI * 2); ctx.fill();
      }
      let topI = 0, topY = Infinity;
      for (let i = 0; i < sk.pts.length; i++) { const sy = H(sk.pts[i].y); if (sy < topY) { topY = sy; topI = i; } }
      ctx.fillStyle = sk.penDown ? 'rgba(120, 230, 140, 0.92)' : 'rgba(200, 210, 218, 0.85)';
      ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('drawn ' + Math.round((sk.coveredCount / sk.NS) * 100) + '%  ·  ' +
                   sk.strokes + (sk.strokes === 1 ? ' stroke' : ' strokes') +
                   '  ·  pen ' + (sk.penDown ? 'DOWN' : 'up'),
                   W(sk.pts[topI].x), topY - 10);
      ctx.restore();
      return;
    }
    const pn = state.paint;
    if (pn && pn.pts && pn.pts.length) {
      const scale = Math.abs(W(1) - W(0)) || 1;
      // Band tube (half-width w → full width 2w).
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(108, 226, 226, 0.10)';
      ctx.lineWidth = 2 * pn.w * scale;
      ctx.beginPath();
      for (let i = 0; i <= pn.pts.length; i++) {
        const p = pn.pts[i % pn.pts.length];
        const x = W(p.x), y = H(p.y);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Coverage dots.
      for (let i = 0; i < pn.pts.length; i++) {
        const p = pn.pts[i];
        const on = pn.covered && pn.covered[i];
        ctx.fillStyle = on ? 'rgba(120, 230, 140, 0.95)' : 'rgba(150, 165, 175, 0.45)';
        ctx.beginPath(); ctx.arc(W(p.x), H(p.y), on ? 2.6 : 1.6, 0, Math.PI * 2); ctx.fill();
      }
      // Tip trail (fading), same as track mode.
      const tr = ct.trail || [];
      const npts = tr.length / 2;
      ctx.lineWidth = 2.2;
      for (let i = 1; i < npts; i++) {
        const a = (i / npts);
        ctx.strokeStyle = 'rgba(245, 183, 105, ' + (0.05 + a * 0.6).toFixed(3) + ')';
        ctx.beginPath();
        ctx.moveTo(W(tr[(i - 1) * 2]), H(tr[(i - 1) * 2 + 1]));
        ctx.lineTo(W(tr[i * 2]), H(tr[i * 2 + 1]));
        ctx.stroke();
      }
      // Current guide marker (nearest unpainted band point).
      const g = state.chainReach && state.chainReach.target;
      if (g) {
        ctx.fillStyle = 'rgba(108, 226, 226, 0.95)';
        ctx.beginPath(); ctx.arc(W(g.x), H(g.y), 4, 0, Math.PI * 2); ctx.fill();
      }
      // Coverage percentage readout near the band's top.
      let topI = 0, topY = Infinity;
      for (let i = 0; i < pn.pts.length; i++) { const sy = H(pn.pts[i].y); if (sy < topY) { topY = sy; topI = i; } }
      ctx.fillStyle = 'rgba(120, 230, 140, 0.92)';
      ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('band painted ' + Math.round((pn.coveredCount / pn.NS) * 100) + '%',
                   W(pn.pts[topI].x), topY - 10);
      ctx.restore();
      return;
    }
    // Ghost target curve (sample the unit curve, map via center+radius → screen).
    ctx.strokeStyle = 'rgba(108, 226, 226, 0.35)';
    ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
    ctx.beginPath();
    const N = ct.longTrail ? 640 : 160;
    for (let i = 0; i <= N; i++) {
      const u = BF.chainTraceCurves.pointAt(ct.curveId, (i / N) * ct.period, ct.period);
      const x = W(ct.center.x + u.x * ct.radius), y = H(ct.center.y + u.y * ct.radius);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.setLineDash([]);
    // Tip trail (fading): ct.trail is a flat [x0,y0,x1,y1,...] world-coord buffer.
    // The epicycle setup keeps a FULL LOOP of trail (~2000 points, so a finished
    // signature stays on screen). This per-segment fade is one beginPath +
    // strokeStyle change PER POINT — fine for chain-trace's 240-point cap, ~2000
    // draw calls per frame for the epicycle. drawEpicycleOverlay redraws that
    // trail as a single path instead, so skip it here.
    const tr = state.epi ? [] : (ct.trail || []);
    const pts = tr.length / 2;
    ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (ct.longTrail && pts > 1) {
      ctx.strokeStyle = 'rgba(245, 183, 105, 0.8)';
      ctx.beginPath(); ctx.moveTo(W(tr[0]), H(tr[1]));
      for (let i = 1; i < pts; i++) ctx.lineTo(W(tr[i*2]), H(tr[i*2+1]));
      ctx.stroke();
      ctx.font = '12px system-ui'; ctx.fillStyle = '#9ddede';
      ctx.fillText('Dotted teal: target', 18, 24);
      ctx.fillStyle = '#f5b769'; ctx.fillText('Amber: actual pen · last word', 18, 42);
    }
    for (let i = 1; !ct.longTrail && i < pts; i++) {
      const a = (i / pts); // older = fainter
      ctx.strokeStyle = 'rgba(245, 183, 105, ' + (0.05 + a * 0.6).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(W(tr[(i - 1) * 2]), H(tr[(i - 1) * 2 + 1]));
      ctx.lineTo(W(tr[i * 2]), H(tr[i * 2 + 1]));
      ctx.stroke();
    }
    // Current target marker.
    const t = state.chainReach && state.chainReach.target;
    if (t) {
      ctx.fillStyle = 'rgba(108, 226, 226, 0.95)';
      ctx.beginPath(); ctx.arc(W(t.x), H(t.y), 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // ---- Epicycle signer viz --------------------------------------------------
  // The MECHANISM is the payoff here, so the drawing has to make the Fourier
  // structure legible rather than show a wiggling chain. Six layers, back to
  // front, and the whole thing is gated on state.epi so every other setup draws
  // nothing. W/H map world→screen; there is NO world-space ctx transform (see
  // drawChainTraceOverlay). `scale` = W(1) − W(0), i.e. world units → px.
  //
  //   (0) ghost   — the dashed target curve, so the approximation error is
  //                 visible. Normally drawChainTraceOverlay owns this; see the
  //                 note at the call site for the one case it doesn't.
  //   (1) orbits  — arm j's tip rides a circle of radius r[j] centred on pivot
  //                 j. THIS is the layer that shows the Fourier decomposition:
  //                 nested circles shrinking toward the pen, one per retained
  //                 harmonic.
  //   (2) spokes  — the arms themselves.
  //   (3) pivots  — joint dots + the base anchor.
  //   (4) error   — a hairline from the pen to the cursor it is chasing, drawn
  //                 at the size the error actually is.
  //   (5) ink     — the pen trail, a full loop of it, as ONE path.
  //   (6) readout — N and the mean error, small, top-left, out of the way.
  //
  // LEGIBILITY AT N ≥ 12. Emphasis is keyed off each arm's LENGTH relative to
  // the longest (t = r[j]/rMax), never off its index. Arms arrive sorted
  // largest-first — curve_fourier sorts terms by |c_k|, which is the provably
  // optimal truncation order — but under telescoping the lengths move, so a
  // length-keyed falloff keeps the emphasis honest either way. Circles under
  // ~1.2 px on screen are skipped outright: at N = 12 on `autograph` the last
  // arms are a couple of world px and would render as a grey haze around the
  // pen, which reads as noise, not as structure.
  const EPI_CARRIER_RGB = [106, 169, 255];   // long arms  — blue (the carriers)
  const EPI_PEN_RGB     = [78, 224, 192];    // short arms — teal (toward the pen)
  const EPI_INK_RGB     = [245, 183, 105];   // the drawn line — amber
  const EPI_ORBIT_MIN_PX = 1.2;              // below this a circle is haze

  function epiRgba(rgb, a) {
    const c = a < 0 ? 0 : (a > 1 ? 1 : a);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + c.toFixed(3) + ')';
  }
  // t = 0 → carrier blue, t = 1 → pen teal.
  function epiBlend(t) {
    const u = t < 0 ? 0 : (t > 1 ? 1 : t);
    return [
      Math.round(EPI_CARRIER_RGB[0] + (EPI_PEN_RGB[0] - EPI_CARRIER_RGB[0]) * u),
      Math.round(EPI_CARRIER_RGB[1] + (EPI_PEN_RGB[1] - EPI_CARRIER_RGB[1]) * u),
      Math.round(EPI_CARRIER_RGB[2] + (EPI_PEN_RGB[2] - EPI_CARRIER_RGB[2]) * u),
    ];
  }
  const epiHasPts = (o) => !!(o && o.pts && o.pts.length);

  function drawEpicycleOverlay(ctx, state, W, H, scale) {
    const e = state.epi, w = state.world;
    if (!e || !w || !e.idxs || e.idxs.length < 2 || !e.r) return;
    // Never trust numArms over the arrays it indexes — a stale arm-count from a
    // params round-trip must degrade to "draw what exists", not throw.
    const N = Math.max(0, Math.min(e.numArms | 0, e.idxs.length - 1, e.r.length));
    if (N <= 0) return;
    const s = Math.abs(scale) || Math.abs(W(1) - W(0)) || 1;

    let rMax = 0;
    for (let j = 0; j < N; j++) if (e.r[j] > rMax) rMax = e.r[j];
    if (!(rMax > 0)) rMax = 1;

    const ct = state.chainTrace;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // (0) Ghost target curve. drawChainTraceOverlay draws this and runs first,
    // EXCEPT that it returns early — band + coverage dots instead — whenever an
    // ordered/stroke/paint objective is live. Seeing how far the truncation
    // misses is the whole point of this mode, so redraw the ghost in exactly
    // those cases and stay out of the way otherwise.
    if (ct && (epiHasPts(state.ordered) || epiHasPts(state.stroke) || epiHasPts(state.paint))) {
      ctx.strokeStyle = 'rgba(108,226,226,0.30)';
      ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
      ctx.beginPath();
      const G = 200;
      for (let i = 0; i <= G; i++) {
        const u = BF.chainTraceCurves.pointAt(ct.curveId, (i / G) * ct.period, ct.period);
        const x = W(ct.center.x + u.x * ct.radius), y = H(ct.center.y + u.y * ct.radius);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
    }

    // Analytic teacher is a render-only ghost in the learned rate experiment.
    // Its phases never enter the policy observation or overwrite the learner.
    if (e.drive === 'rate') {
      let gx = e.base.x, gy = e.base.y;
      ctx.strokeStyle = 'rgba(211,188,255,0.35)';
      ctx.lineWidth = 1.4; ctx.setLineDash([4, 5]); ctx.beginPath();
      ctx.moveTo(W(gx), H(gy));
      for (let j = 0; j < N; j++) {
        const theta = e.phase[j] + Math.PI * 2 * e.k[j] * e.time / e.period;
        gx += e.r0[j] * Math.cos(theta); gy += e.r0[j] * Math.sin(theta);
        ctx.lineTo(W(gx), H(gy));
      }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#d3bcff'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(W(gx), H(gy), 5, 0, Math.PI * 2); ctx.stroke();
    }

    // (1) Orbits.
    for (let j = 0; j < N; j++) {
      const p = w.nodes[e.idxs[j]];
      if (!p) continue;
      const rpx = e.r[j] * s;
      if (!(rpx > EPI_ORBIT_MIN_PX)) continue;
      const t = e.r[j] / rMax;
      ctx.strokeStyle = epiRgba(epiBlend(1 - t), 0.07 + 0.30 * t);
      ctx.lineWidth = 0.7 + 1.0 * t;
      ctx.beginPath(); ctx.arc(W(p.x), H(p.y), rpx, 0, Math.PI * 2); ctx.stroke();
    }

    // (2) Spokes. Per-arm rather than one batched path, because the whole point
    // is that the widths differ; N ≤ 32 so this is 32 strokes at worst.
    for (let j = 0; j < N; j++) {
      const a = w.nodes[e.idxs[j]], b = w.nodes[e.idxs[j + 1]];
      if (!a || !b) continue;
      const t = e.r[j] / rMax;
      ctx.strokeStyle = epiRgba(epiBlend(1 - t), 0.32 + 0.55 * t);
      ctx.lineWidth = 0.8 + 1.9 * t;
      ctx.beginPath(); ctx.moveTo(W(a.x), H(a.y)); ctx.lineTo(W(b.x), H(b.y)); ctx.stroke();
    }

    // (3) Pivots. A joint dot is drawn only when the arm feeding it is long
    // enough on screen to separate it from the previous joint — otherwise the
    // outer arms fuse into one blob at the pen, which is the exact failure the
    // falloff exists to avoid.
    for (let j = 1; j < N; j++) {
      const p = w.nodes[e.idxs[j]];
      if (!p || e.r[j - 1] * s < 3) continue;
      const t = e.r[j] / rMax;
      ctx.fillStyle = epiRgba(epiBlend(1 - t), 0.35 + 0.45 * t);
      ctx.beginPath(); ctx.arc(W(p.x), H(p.y), 1.3 + 1.4 * t, 0, Math.PI * 2); ctx.fill();
    }
    // The one genuine anchor, in the codebase's amber anchor idiom (the generic
    // skeleton is suppressed for this setup — see the drawSkeleton call site).
    const base = w.nodes[e.idxs[0]];
    if (base) {
      const bx = W(base.x), by = H(base.y);
      ctx.fillStyle = 'rgba(245,183,105,0.35)';
      ctx.strokeStyle = '#f5b769'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(bx - 4.5, by - 4.5, 9, 9); ctx.fill(); ctx.stroke();
    }

    // (4) The error, at the size it actually is. At N = 12 on `autograph` this
    // is a few px; at N = 2 it is a visible rubber band. Nothing else on screen
    // says "N arms is enough" as directly as watching this shrink.
    const tip = w.nodes[e.idxs[N]];
    const tgt = state.chainReach && state.chainReach.target;
    if (tip && tgt) {
      ctx.strokeStyle = 'rgba(255,128,128,0.55)';
      ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(W(tip.x), H(tip.y)); ctx.lineTo(W(tgt.x), H(tgt.y)); ctx.stroke();
      ctx.setLineDash([]);
    }

    // (5) The ink — the pen trail the setup keeps for a FULL loop (~2000 points
    // at 120 Hz), so the finished signature stays on screen instead of scrolling
    // away mid-stroke. Drawn as whole paths: a wide dim pass for glow, a crisp
    // pass over it, and a bright head so the direction of travel reads — 3 draw
    // calls, against the ~2000 the chain-trace overlay's per-segment fade would
    // cost (which is why that overlay skips the trail when state.epi is set).
    const tr = (ct && ct.trail) || [];
    const np = tr.length >> 1;
    if (np >= 2) {
      const inkPath = () => {
        ctx.beginPath(); ctx.moveTo(W(tr[0]), H(tr[1]));
        for (let i = 1; i < np; i++) ctx.lineTo(W(tr[i * 2]), H(tr[i * 2 + 1]));
      };
      ctx.strokeStyle = epiRgba(EPI_INK_RGB, 0.13); ctx.lineWidth = 6.0; inkPath(); ctx.stroke();
      ctx.strokeStyle = epiRgba(EPI_INK_RGB, 0.92); ctx.lineWidth = 2.2; inkPath(); ctx.stroke();
      const head = Math.max(2, Math.min(np, Math.round(np * 0.06)));
      ctx.strokeStyle = 'rgba(255,238,205,0.98)'; ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(W(tr[(np - head) * 2]), H(tr[(np - head) * 2 + 1]));
      for (let i = np - head + 1; i < np; i++) ctx.lineTo(W(tr[i * 2]), H(tr[i * 2 + 1]));
      ctx.stroke();
    }

    // The pen itself: a soft halo plus a hard dot, so the eye tracks it against
    // both the ink and the orbit haze.
    if (tip) {
      const px = W(tip.x), py = H(tip.y);
      if (ctx.createRadialGradient) {
        const g = ctx.createRadialGradient(px, py, 0, px, py, 15);
        g.addColorStop(0, epiRgba(EPI_PEN_RGB, 0.42));
        g.addColorStop(1, epiRgba(EPI_PEN_RGB, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, 15, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = epiRgba(EPI_PEN_RGB, 0.98);
      ctx.beginPath(); ctx.arc(px, py, 3.4, 0, Math.PI * 2); ctx.fill();
    }

    // (6) Readout. Small, monospace, top-left — the bottom-left corner belongs
    // to the friction legend. The number that matters is the MEAN pen error over
    // the last COMPLETED loop (epi.errMean, accumulated per physics step by the
    // setup's tick): in analytic drive that IS the truncation error of N arms,
    // live, and averaging in the renderer instead would sample it at whatever
    // loop phase the frame happened to catch.
    const num = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
    const mean = (typeof e.errMean === 'number' && isFinite(e.errMean)) ? e.errMean : null;
    const now = (tip && tgt) ? Math.hypot(tip.x - tgt.x, tip.y - tgt.y)
                             : ((typeof e.errLast === 'number') ? e.errLast : null);
    const lines = [
      'N = ' + N + ' arm' + (N === 1 ? '' : 's') + '  ·  ' +
        (e.basis === 'even' ? 'DCT / there-and-back' : 'DFT') + '  ·  ' +
        (e.drive === 'rate' ? 'policy-driven' : 'analytic'),
      (mean != null ? 'mean err ' + num(mean) + ' px' : 'mean err —') +
        (now != null ? '  ·  now ' + num(now) + ' px' : ''),
    ];
    if (e.drive === 'rate') {
      lines.push('fixed lengths · learned angular speeds');
      lines.push('lavender = analytic · amber = learned');
      lines.push('arm   length       ω analytic → learned (rad/s)');
      const rateScale = 2 * Math.PI * e.kRateMax / e.period;
      for (let j=0;j<Math.min(N,6);j++) {
        const analytic = 2*Math.PI*e.k[j]/e.period;
        const learned = Math.max(-1,Math.min(1,(state.lastCmds || [])[j] || 0))*rateScale;
        lines.push((j+1)+'     '+e.r[j].toFixed(1).padStart(5)+'        '+analytic.toFixed(2).padStart(5)+' → '+learned.toFixed(2));
      }
    } else lines.push('fixed lengths · constant harmonic speeds');
    ctx.font = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    let maxW = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = ctx.measureText(lines[i]);
      if (m && m.width > maxW) maxW = m.width;
    }
    const padX = 8, padY = 5, rowH = 15, left = 10, top = 10;
    ctx.fillStyle = 'rgba(11,13,18,0.55)';
    ctx.fillRect(left, top, maxW + padX * 2, rowH * lines.length + padY * 2);
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = (i === 0) ? epiRgba(EPI_CARRIER_RGB, 0.92) : 'rgba(230,233,242,0.80)';
      ctx.fillText(lines[i], left + padX, top + padY + rowH * i + rowH / 2);
    }
    ctx.restore();
  }

  // Torque indicators: a violet curved arc-arrow at each ACTUATED joint, sized +
  // oriented by the live applied torque (world.jointCmds[j]). No-op when no joints
  // are actuated (non-actuated chains + all other setups draw nothing). W/H map
  // world→screen; there is NO world-space ctx transform (see drawChainTraceOverlay).
  function drawJointTorques(ctx, state, W, H) {
    const w = state.world;
    const JA = w && w.jointActuators;
    const JC = w && w.jointCmds;
    if (!JA || !JA.length || !JC) return;
    const scale = W(1) - W(0);
    const REF = (BF.chainJoint && BF.chainJoint.CHAIN_JOINT && BF.chainJoint.CHAIN_JOINT.torqueScale) || 8000;
    ctx.save();
    ctx.lineCap = 'round';
    for (let j = 0; j < JA.length; j++) {
      const tau = JC[j] || 0;
      const mag = Math.min(1, Math.abs(tau) / REF);
      if (mag < 0.02) continue;                       // idle joint → draw nothing
      const node = w.nodes[JA[j].b];
      if (!node) continue;
      const cx = W(node.x), cy = H(node.y);
      const r = Math.max(12, (node.radius || 8) * scale + 6);
      const sweep = (0.35 + mag * 1.05) * Math.PI;    // ~63° → ~252°
      const alpha = 0.30 + mag * 0.6;
      const lw = 1.5 + mag * 2.5;
      const dir = tau >= 0 ? 1 : -1;                  // +torque → CCW(screen), −torque → CW
      const a0 = -Math.PI * 0.5;                      // start at the top of the joint
      const a1 = a0 + dir * sweep;
      ctx.strokeStyle = 'rgba(190, 120, 255, ' + alpha.toFixed(3) + ')';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a1, dir < 0);            // anticlockwise when dir < 0
      ctx.stroke();
      // Arrowhead at the leading end (a1), pointing along the direction of travel.
      const ex = cx + r * Math.cos(a1), ey = cy + r * Math.sin(a1);
      const tx = dir * -Math.sin(a1), ty = dir * Math.cos(a1);   // unit tangent of travel
      const px = -ty, py = tx;                                    // unit perpendicular
      const ah = 5 + mag * 4;                                     // arrowhead size
      ctx.beginPath();
      ctx.moveTo(ex + tx * ah, ey + ty * ah);                    // tip
      ctx.lineTo(ex - tx * ah * 0.3 + px * ah * 0.6, ey - ty * ah * 0.3 + py * ah * 0.6);
      ctx.lineTo(ex - tx * ah * 0.3 - px * ah * 0.6, ey - ty * ah * 0.3 - py * ah * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  BF.simRenderer = { make: makeSimRenderer, computeHelperOverlay: computeHelperOverlay };
  BF.canvasSim = Object.assign(BF.canvasSim || {}, {
    drawChainReachTarget, drawChainTraceOverlay, drawEpicycleOverlay,
    drawJointTorques, drawMidpointDots, drawExtraDots, drawObstacle, drawTray,
    drawTerrainOverlay,
  });
})(window.BF);
