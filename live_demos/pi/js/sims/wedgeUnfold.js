import * as THREE from 'three';

// Shared "unfold" view for the mirror-wedge family (optical wedge, cone
// kaleidoscope, helical cylinder). All three develop to the SAME flat wedge of
// opening angle θ = arctan(10^-n), so the unfolding picture is identical: mirror
// the WEDGE at each bounce instead of the ray, and the zig-zag straightens into
// one ray crossing a fan of N = floor(π/θ) wedge copies. The ray's swept angle
// reaches π exactly when the count completes.
//
// Each sim passes its own flat-wedge coordinates, normalized so the fan is a unit
// half-disc:  R (radius scale), wedgeAngle, unfoldN, the ray start (x0, y0), and
// per-frame the unfolded ball position (bx, by).

export function initUnfold(sim, { R, wedgeAngle, unfoldN, x0, y0 }) {
  sim.simScene.clear();
  sim.simCamera = new THREE.OrthographicCamera(-R * 1.12, R * 1.12, R * 1.06, -R * 0.16, 0.1, 10);
  sim.simCamera.position.z = 1;

  const theta = wedgeAngle;
  const N = unfoldN;

  // Fan of unfolded wedge copies (radial lines every θ from 0 to ~π; subsampled
  // when there are thousands).
  const drawStep = Math.max(1, Math.ceil(N / 720));
  const fanPts = [];
  for (let k = 0; k <= N + 1; k += drawStep) {
    const a = Math.min(Math.PI, k * theta);
    fanPts.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0));
  }
  sim.simScene.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(fanPts),
    new THREE.LineBasicMaterial({ color: 0x3a3a5c, transparent: true, opacity: 0.5 })));

  // Outer half-disc rim — the π reference the ray must sweep.
  const rimPts = [];
  for (let i = 0; i <= 96; i++) { const a = (i / 96) * Math.PI; rimPts.push(new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0)); }
  sim.simScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rimPts),
    new THREE.LineBasicMaterial({ color: 0x2a2a4a })));

  // The real wedge = the first sector [0, θ], walls bright.
  for (const a of [0, theta]) {
    sim.simScene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.02), new THREE.Vector3(R * Math.cos(a), R * Math.sin(a), 0.02)]),
      new THREE.LineBasicMaterial({ color: 0xffffff })));
  }

  // Swept-angle wedge (filled, grows 0 → π), rebuilt each frame.
  const sweptArc = new THREE.Mesh(new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.16, side: THREE.DoubleSide }));
  sweptArc.position.z = -0.01;
  sim.simScene.add(sweptArc);

  // The straight unfolded ray (chord at y = y0).
  const xEnd = -Math.sqrt(Math.max(0, R * R - y0 * y0));
  sim.simScene.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, y0, 0.03), new THREE.Vector3(xEnd, y0, 0.03)]),
    new THREE.LineBasicMaterial({ color: 0xf7c948, transparent: true, opacity: 0.8 })));

  // Sweep direction (origin → ball) and the unfolded ball dot.
  const sweepLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0.025), new THREE.Vector3(0, 0, 0.025)]),
    new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.7 }));
  sim.simScene.add(sweepLine);
  const ballMesh = new THREE.Mesh(new THREE.CircleGeometry(R * 0.022, 20), new THREE.MeshBasicMaterial({ color: 0xf7c948 }));
  ballMesh.position.z = 0.04;
  sim.simScene.add(ballMesh);

  // Reflection-equivalence indicator at the current crossing: highlight the mirror
  // edge, its normal, and the REFLECTED (folded) direction — against the straight
  // (unfolded) yellow ray — so the two pictures read as the same physics.
  const mkLine = (color) => {
    const ln = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    ln.position.z = 0.05; ln.visible = false; sim.simScene.add(ln);
    return ln;
  };
  const refl = {
    edgeHi: mkLine(0xffffff),
    normalLn: mkLine(0x4cc9f0),
    reflectLn: mkLine(0xe94560),
    dot: new THREE.Mesh(new THREE.CircleGeometry(R * 0.018, 16), new THREE.MeshBasicMaterial({ color: 0xffffff })),
    ghost: new THREE.Mesh(new THREE.CircleGeometry(R * 0.022, 20),
      new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.5 })),
  };
  refl.dot.position.z = 0.06; refl.dot.visible = false; sim.simScene.add(refl.dot);
  refl.ghost.position.z = 0.055; refl.ghost.visible = false; sim.simScene.add(refl.ghost);
  // Persistent kaleidoscope pool: the ball's mirror image across EVERY crossed
  // edge. Reflection preserves distance from the apex, so every image rides the
  // same radius as the ball — none reach the rim R until the ball completes its
  // sweep, at which point they all exit together. So the images persist for the
  // whole run instead of snapping away at each new bounce.
  refl.pool = [];
  for (let i = 0; i < 48; i++) {
    const g = new THREE.Mesh(new THREE.CircleGeometry(R * 0.017, 16),
      new THREE.MeshBasicMaterial({ color: 0xe94560, transparent: true, opacity: 0.3 }));
    g.position.z = 0.045; g.visible = false; sim.simScene.add(g);
    refl.pool.push(g);
  }

  // Bouncing-ball inset (top-left): a small exaggerated copy of the REAL wedge so
  // the original zig-zag stays in view beside the straightened unfold.
  const insLen = R * 0.30, insAng = 0.55;
  const insC = new THREE.Vector3(-R * 0.93, R * 0.52, 0.05);
  const insBack = new THREE.Mesh(new THREE.CircleGeometry(R * 0.34, 28),
    new THREE.MeshBasicMaterial({ color: 0x0a0a18, transparent: true, opacity: 0.82 }));
  insBack.position.set(insC.x + insLen * 0.45, insC.y + insLen * 0.2, 0.046);
  sim.simScene.add(insBack);
  for (const a of [0, insAng]) {
    sim.simScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(insC.x, insC.y, 0.05),
      new THREE.Vector3(insC.x + insLen * Math.cos(a), insC.y + insLen * Math.sin(a), 0.05)]),
      new THREE.LineBasicMaterial({ color: 0x99a8b8 })));
  }
  const insBall = new THREE.Mesh(new THREE.CircleGeometry(R * 0.02, 16), new THREE.MeshBasicMaterial({ color: 0xf7c948 }));
  insBall.position.z = 0.06; sim.simScene.add(insBall);
  const insTrail = new THREE.Line(new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.6 }));
  sim.simScene.add(insTrail);
  const inset = { c: insC, len: insLen, ang: insAng, ball: insBall, trail: insTrail, pts: [] };

  sim._unfold = { sweptArc, sweepLine, ballMesh, R, theta: wedgeAngle, y0, N: unfoldN, refl, inset };
}

// Render a value as digits of a target constant (default π) with the confirmed
// leading digits highlighted — the count is literally computing the constant
// digit by digit, so show it.
export function piDigitsHTML(value, decimals, target = Math.PI) {
  const refStr = target.toFixed(decimals);
  const valStr = value.toFixed(decimals);
  let i = 0;
  while (i < valStr.length && valStr[i] === refStr[i]) i++;
  // Classes rather than inline colour, so the stylesheet can theme this — the
  // old inline #666 for the unconfirmed tail was 2.77:1 on the panel, i.e. half
  // the site's hero number was effectively invisible, and no CSS could reach it.
  return `<span class="pi-locked">${valStr.slice(0, i)}</span><span class="pi-drift">${valStr.slice(i)}</span>`;
}

export function updateUnfold(sim, { bx, by }) {
  const u = sim._unfold;
  if (!u) return;
  const R = u.R;
  const cbx = Math.max(-R, bx);
  u.ballMesh.position.set(cbx, by, 0.04);
  u.sweepLine.geometry.setFromPoints([new THREE.Vector3(0, 0, 0.025), new THREE.Vector3(cbx, by, 0.025)]);

  const sweep = Math.max(1e-4, Math.min(Math.PI, Math.atan2(by, cbx)));   // 0 → π
  const rad = R * 0.6;
  const segs = Math.max(2, Math.ceil(sweep / 0.03));
  const pos = [];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * sweep, a1 = ((i + 1) / segs) * sweep;
    pos.push(0, 0, 0, rad * Math.cos(a0), rad * Math.sin(a0), 0, rad * Math.cos(a1), rad * Math.sin(a1), 0);
  }
  u.sweptArc.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  u.sweptArc.geometry.attributes.position.needsUpdate = true;

  // (reflection indicator below)
  // Reflection equivalence at the most recently crossed mirror edge: the straight
  // (unfolded) ray here corresponds to a reflection off this mirror in the folded
  // picture — draw the edge, its normal, and the reflected direction to show it.
  const refl = u.refl, theta = u.theta, y0 = u.y0, R2 = u.R;
  const kCross = Math.floor(sweep / theta);
  let show = false, px = 0, py = y0, phi = 0;
  if (refl && kCross >= 1 && kCross <= u.N) {
    phi = kCross * theta;
    if (Math.abs(Math.sin(phi)) > 1e-4) {
      px = y0 / Math.tan(phi);
      show = Math.abs(px) <= R2 * 1.02;
    }
  }
  if (show) {
    const ex = Math.cos(phi), ey = Math.sin(phi);            // edge direction
    const nx = -Math.sin(phi), ny = Math.cos(phi);           // mirror normal
    const c2 = Math.cos(2 * phi), s2 = Math.sin(2 * phi);
    // Ghost ball = the real ball reflected across THIS mirror edge — the folded
    // (bounce) picture overlaid on the straight (unfold) one. It meets the real
    // ball at the mirror and peels off along the reflected ray as the ball moves.
    const gx = cbx * c2 + by * s2, gy = cbx * s2 - by * c2;
    const Ln = R2 * 0.13, Z = 0.05;
    refl.edgeHi.geometry.setFromPoints([new THREE.Vector3(0, 0, Z), new THREE.Vector3(R2 * ex, R2 * ey, Z)]);
    refl.normalLn.geometry.setFromPoints([new THREE.Vector3(px - Ln * nx, py - Ln * ny, Z), new THREE.Vector3(px + Ln * nx, py + Ln * ny, Z)]);
    refl.reflectLn.geometry.setFromPoints([new THREE.Vector3(px, py, Z), new THREE.Vector3(gx, gy, Z)]);
    refl.dot.position.set(px, py, 0.06);
    refl.ghost.position.set(gx, gy, 0.055);
    refl.edgeHi.visible = refl.normalLn.visible = refl.reflectLn.visible = refl.dot.visible = refl.ghost.visible = true;
  } else if (refl) {
    refl.edgeHi.visible = refl.normalLn.visible = refl.reflectLn.visible = refl.dot.visible = refl.ghost.visible = false;
  }

  // Persistent kaleidoscope: one ghost per crossed mirror edge, each = the ball
  // reflected across that edge. They live (on the ball's own radius) until the
  // ball — and so its images — reach the rim R at the end of the sweep. When there
  // are more crossings than pool slots, the slots sample evenly across all edges.
  if (refl && refl.pool) {
    const M = refl.pool.length;
    const cnt = Math.max(0, Math.min(kCross, M));
    const atRim = Math.hypot(cbx, by) >= R2 * 0.999;
    for (let i = 0; i < M; i++) {
      const g = refl.pool[i];
      if (i < cnt && !atRim) {
        const kk = kCross <= M ? (i + 1) : Math.max(1, Math.round((i + 1) * kCross / M));
        const a = 2 * kk * theta;
        const ca = Math.cos(a), sa = Math.sin(a);
        g.position.set(cbx * ca + by * sa, cbx * sa - by * ca, 0.045);
        g.visible = true;
      } else {
        g.visible = false;
      }
    }
  }

  // Bouncing-ball inset: fold the swept angle back into the real wedge (a triangle
  // wave in [0,θ]) and show the ball there, exaggerated, so the original zig-zag
  // plays beside the straightened unfold.
  const ins = u.inset;
  if (ins) {
    if (sweep < 0.02) ins.pts.length = 0;
    const kk2 = Math.floor(sweep / theta); let fr = sweep - kk2 * theta; if (kk2 % 2 === 1) fr = theta - fr;
    const fa = (fr / theta) * ins.ang;
    const rr = Math.min(Math.hypot(cbx, by), R2) / R2 * ins.len;
    const px2 = ins.c.x + rr * Math.cos(fa), py2 = ins.c.y + rr * Math.sin(fa);
    ins.ball.position.set(px2, py2, 0.06);
    ins.pts.push(px2, py2);
    if (ins.pts.length > 220) ins.pts.splice(0, ins.pts.length - 220);
    const tp = []; for (let i = 0; i < ins.pts.length; i += 2) tp.push(new THREE.Vector3(ins.pts[i], ins.pts[i + 1], 0.055));
    ins.trail.geometry.setFromPoints(tp);
  }
}
