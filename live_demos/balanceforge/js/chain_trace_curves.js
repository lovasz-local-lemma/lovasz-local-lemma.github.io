// chain_trace_curves.js
// Single source of truth for the signing-machine target curves. Loaded by
// BOTH the browser (index.html) and the standalone gradient probe
// (chain-trace-adam-openloop.js), so the live path and the probe trace
// identical curves (same pattern as chain_materials.js).
//
// ============================ WHAT MAKES A CURVE HARD =======================
// Measured, on this plant, with the shipped signing config (4 segments, rigid
// material, 3 servo joints, telescope ON) and the repo's own hand-written
// planner. Two things predict the achievable tip error; a third, which the
// placement code's [0.55L, 0.95L] "band" is built around, does NOT.
//
//  1. TARGET SPEED = world arc length / period. The dominant term for the
//     planner: r = +0.74…+0.77 (p ≤ 0.004) across the 12 original curves, β =
//     0.78 in a two-predictor OLS against band residency (R² 0.73–0.76). Give
//     every curve its own period so the cursor runs at a fixed px/s and the
//     error range collapses from 11.0–29.4 px to 14.7–25.2 px AND the ranking
//     inverts. `periodFor()` below turns that into a knob.
//  2. VERTICAL EXTENT (ySpanU). What is left once speed is controlled
//     (r = +0.69), and the DOMINANT predictor for a LEARNED policy
//     (r = −0.77 against band residency, vs +0.20 for arc length) — a lagging
//     learner is hurt by how far the tip must travel up and down, not by how
//     fast the cursor runs.
//  3. BAND RESIDENCY IS NOT IT, on EITHER reading of "the band". Taking it as
//     [0.55L, L] — inside minimum reach and not past full extension — r = −0.38
//     (p 0.22) at r100 / −0.37 (p 0.25) at r140, Spearman −0.17 / −0.14; taking
//     it literally as the placement code's then-current [0.55L, 0.95L] clamp,
//     r = −0.56 (p 0.06) /
//     −0.45 (p 0.14), Spearman −0.24 / −0.25. Non-significant either way, while
//     arc length is r = +0.77 (p 0.003) / +0.74 (p 0.006) on the same 12 curves.
//     And the metric does not SORT them: at r140 `cursive` sits at 79.5 % band
//     residency and is the WORST curve (28.9 px) while `ellipse` sits at 81.7 %
//     and is the BEST (10.1 px) — two curves within 2 points of each other at
//     opposite ends of a 3× error range. (Both read 100 % on the looser
//     [0.55L, L] band, which is where the "100 % band-resident" phrasing in
//     earlier write-ups came from; the point is the same and stronger here.)
//     Worse, the metric is symmetric about the band centre while the plant is
//     not: the same curve at two placements with equal band residency measures
//     56.7 px vs 19.5 px.
//     The band's bounds came from numSegs·segLen = 320, which is the chain's
//     SPRING REST LENGTH — the measured static tip envelope is y ∈ [166.6,
//     518.6] and the passive hang is 326.6, so "below full extension" is not
//     unreachable at all and those phases are traced BETTER, not worse.
//     That clamp is GONE (setups.js, 2026-08): the placement now clamps into
//     the envelope a settle measures. The retired [0.55L, 0.95L] pair was
//     nearly, but NOT entirely, dead: its low side needs r > L, which is out of
//     reach at 4 segments (L = 320 vs a 200 px radius cap) but NOT at the
//     smallest chain the setup allows — at numSegments 2, L = 160 and the
//     radius slider runs to 200, so r = 200 gave 160 − 90 = 70 and the 0.55L
//     bound really did lift it to 88. Anywhere a shipped preset lived it was
//     dead code; at the corner of the dropdowns it was not. What DOES predict
//     error is the part of the curve pushed OUTSIDE the measured band, and
//     asymmetrically: over 288 cells the correlation with the arc fraction
//     above the band's ceiling is r = +0.81, and with the fraction below its
//     floor r = +0.07. Shallow is the expensive side; depth is nearly free.
//     Curves are therefore chosen here on (1) and (2), and named for them.
//
// ANTI-SYMMETRY, MEASURED AND NULL. `descender` and `ascender` are the same
// stroke with the sign of y flipped: identical arc length, identical turning,
// identical vertical span, identical corner count — only the SIDE of the
// baseline the loops fall on differs. Steady-state planner error, both curves
// at the SAME centre: r100 15.6 vs 16.3 (auto-placed, both at y 275), r140 21.5
// vs 20.8 (both forced to y 257 with traceCenterY). That is a designed control,
// and it comes out NULL, which is the cleanest available confirmation that
// depth relative to the hang is not a difficulty axis once the real predictors
// are matched.
//   READ THE r140 ROW WITH ITS CENTRE ATTACHED. The pair is only a control
//   while both halves sit at the same height, and at r140 the auto-placement no
//   longer puts them there: the reach clamp pushes `ascender` 22 px deeper
//   (257 → 279, because its loops rise 0.800·140 = 112 px and the band ceiling
//   is 166.6) and leaves `descender` where it was. Auto-placed they read 19.5
//   vs 21.5, and that 2.0 px is a PLACEMENT difference, not a depth one — which
//   is why the control above is quoted at a forced centre. Set the "Trace
//   centre y" slider to 257 to reproduce it in the app. At r100 nothing moves
//   and the control needs no help.
// (The task-1-protocol number, which includes the start-up loop, shows
// a 1.5× worst-case gap — that gap is the settling transient, not the shape:
// the worst sample lands at s ≈ 0.101, the first sample after the 1 s skip, on
// every curve.)
//
// CLOSED, DELIBERATELY. Every curve added here is CLOSED (a stroke plus a
// return sweep, the way a real signature's underline closes it). An OPEN
// stroke makes the cursor teleport across the page at the wrap, and that costs
// real error: with the transient removed, every closed curve's worst-case sits
// at ≤ 56 px (copperplate is the worst at 55.1, descender next at 53.4) while
// the four open ones sit at 137–173 px (wave 172.9, scriptS 164.0, signature
// 152.6, cursive 137.5, all at r140/T10 at the current placement). The 2026-08
// placement change widened that gap rather than closing it — closed worst cases
// fell (copperplate 69.1 → 55.1) and only ONE open curve moved at all (scriptS
// 168.7 → 164.0), because a clamp can put the curve inside reach but nothing
// can make the cursor's teleport reachable. The same jump is
// what forces mode:'even' in the epicycle path (see curve_fourier.js). Open
// strokes must set `open: true`; the smoke guard checks the flag both ways.
//
// HISTORICAL INITIAL-TIP PLANNER ERROR, r140, period 10, tilts ±0.1, 3 loops with the first
// loop skipped (steady state — mean |tip − cursor| px; do-nothing floor is
// 115–158 px on these). At the old initial-tip x anchor and auto y placement — not one
// height for all of them any more (see below), so this table is a property of
// the setup as much as of the curves. The original placement probe predates the
// centered default; reproductions must pass traceCenterMode:'initial-tip'.
// Centered figure8 was remeasured on 2026-09-09 at 18.1 px versus zero 127.5 px;
// the other centered curves have not been remeasured. Listed in the historical order the numbers
// put them:
//     line 8.5   ellipse 10.1   SWASH 10.9   triangle 14.0  circle 16.2
//     MONOGRAM 16.4  square 16.8  scriptS 16.8  figure8 17.9  ASCENDER 19.5
//     LONGHAND 19.6  flourish 20.5  signature 21.0  autograph 21.2
//     DESCENDER 21.5  COPPERPLATE 25.7  wave 26.6  cursive 28.9
//
// SEVEN OF THE EIGHTEEN MOVED when the placement stopped anchoring on the
// spring rest length and started clamping into the MEASURED reach band
// (setups.js, 2026-08). The three biggest gains are exactly the three curves
// that did not FIT before — at r140 a curve is 2·yTopU·140 px tall and the old
// framing height 320 − 0.45·140 = 257 lifted the tall ones above the band's
// 166.6 ceiling:
//     circle 22.9 → 16.2 (centre 257 → 307, floor-normalised 0.142 → 0.107)
//     square 24.1 → 16.8 (257 → 293, 0.146 → 0.107)
//     triangle 16.5 → 14.0 (257 → 307, 0.128 → 0.121)
//     copperplate 27.3 → 25.7 (257 → 286)   ascender 20.8 → 19.5 (257 → 279)
//     scriptS 16.5 → 16.8 (257 → 286)       flourish 20.1 → 20.5 (257 → 257.3)
// The last two are the honest null of the set: a 29 px move and a 0.3 px one,
// both landing inside the ±0.65–1.5 px loop-to-loop spread of this protocol.
// The other eleven curves already fitted and did not move at all — that is the
// rule working as designed, not an omission. A curve's error is NOT generally
// improved by moving it deeper; it is improved by moving it INTO reach.
(function (BF) {
  // Each fn maps s ∈ [0,1] → a unit point in [-1,1]². The chain-trace setup
  // maps it to world coords: worldX = center.x + u.x*radius, worldY likewise.
  // Trace one edge of a closed polygon given its unit vertices.
  function polyEdge(verts, s) {
    const n = verts.length;
    const seg = Math.floor(s * n) % n;
    const f = s * n - Math.floor(s * n);
    const a = verts[seg], b = verts[(seg + 1) % n];
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f };
  }
  // Closed Catmull-Rom spline through control points — a real pen stroke is a
  // smooth interpolation of hand-picked points, not a formula, so the invented
  // signature curves below are built this way. C¹ continuous ⇒ Fourier
  // coefficients decay fast: fitting |c_k| ~ k^-p over k = 1..40 gives p = 3.2
  // (autograph), 3.3 (longhand), 3.5 (monogram), 3.6 (swash) against 1.8
  // (triangle) and 2.0 (square).
  //
  // FAST DECAY DOES NOT MEAN FEW ARMS, and it is worth stating because the
  // opposite is the intuitive guess. The polygons are harmonic-SPARSE as well
  // as slow-decaying — the square has only 20 nonzero harmonics in the first 40
  // — and almost all of their energy is in k = ±1, so they are the CHEAPEST
  // shapes in the whole registry: 2 arms each (ink 3.0 / 3.3 px at r140). The
  // splines spread real energy across the first dozen harmonics and are the
  // most expensive: autograph needs 12 arms, copperplate 10, longhand 8. At a
  // matched 2 arms the polygons sit at 3.0-3.3 px ink and autograph at 18.4.
  // What the fast decay buys is the TAIL — by 24 arms every spline here is
  // under 0.3 px — not the knee. See curve_fourier.js RECOMMENDED_N.
  function catmullClosed(pts, s) {
    const n = pts.length;
    const f = (((s % 1) + 1) % 1) * n;
    const i = Math.floor(f) % n, t = f - Math.floor(f);
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const t2 = t * t, t3 = t2 * t;
    const c = (a, b, cc, d) =>
      0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
    return { x: c(p0[0], p1[0], p2[0], p3[0]), y: c(p0[1], p1[1], p2[1], p3[1]) };
  }
  // A plausible autograph scrawl: up-loop, three humps, then the long return
  // underline back to the start (which is what closes it).
  const AUTOGRAPH_PTS = [
    [-0.90, 0.30], [-0.75, -0.30], [-0.50, -0.55], [-0.35, -0.10], [-0.45, 0.35],
    [-0.20, 0.20], [-0.05, -0.35], [0.10, 0.10], [0.25, -0.40], [0.45, 0.05],
    [0.62, -0.20], [0.85, -0.05], [0.95, 0.35], [0.55, 0.62], [0.00, 0.70], [-0.55, 0.62],
  ];
  // ---- the measured-difficulty signature set (see the header) ---------------
  // SWASH — the flat closing flourish a signature ends on. Chosen for the two
  // predictors at once: the second-shortest arc in the whole registry (4.13,
  // only `line` is shorter) and by far the smallest vertical span of any
  // signature-like curve — 0.49, against 0.84 for the next flattest (`cursive`)
  // and 1.00–1.77 for all the rest. Both point the same way and it measures
  // 10.9 px — third best overall, first among stroke-like curves.
  const SWASH_PTS = [
    [-0.92, 0.06], [-0.58, 0.24], [-0.16, 0.05], [0.30, 0.22], [0.68, 0.04],
    [0.92, -0.14], [0.60, -0.25], [0.10, -0.13], [-0.42, -0.24], [-0.82, -0.10],
  ];
  // MONOGRAM — two linked capitals with a crossing, closed by a return sweep.
  // Sized to sit between `swash` and a full name (arc 6.15, span 1.00).
  const MONOGRAM_PTS = [
    [-0.78, 0.34], [-0.92, -0.06], [-0.56, -0.42], [-0.20, -0.16], [-0.32, 0.26],
    [0.02, 0.40], [0.26, 0.06], [0.14, -0.34], [0.54, -0.46], [0.86, -0.16],
    [0.80, 0.26], [0.38, 0.50], [-0.22, 0.52],
  ];
  // LONGHAND — the flagship: a name-like word of five humps closed by an
  // underline swash. Arc 7.45 / span 1.12 puts it deliberately alongside
  // `autograph` (7.50 / 1.25) so the two are comparable, and it measures
  // 19.6 px vs autograph's 21.2.
  const LONGHAND_PTS = [
    [-0.90, -0.12], [-0.72, -0.48], [-0.52, -0.05], [-0.40, 0.42], [-0.22, -0.02],
    [-0.06, -0.46], [0.08, 0.02], [0.20, 0.46], [0.36, 0.00], [0.52, -0.44],
    [0.72, -0.05], [0.90, 0.24], [0.60, 0.56], [0.00, 0.64], [-0.55, 0.48],
  ];
  // A connected monoline English word, rather than an unnamed autograph.
  // Coordinates trace B-a-l-a-n-c-e in order, followed by a visible underline
  // return. The return closes the path without teleporting the target cursor.
  const BALANCE_PTS = [
    [0,0],[.05,-1.05],[.15,-2.12],[.75,-2.15],[1.08,-1.77],[.65,-1.23],[.15,-1.12],
    [.8,-1.1],[1.12,-.62],[.78,-.08],[.12,0],[1.22,-.12],
    [1.4,-.75],[1.88,-.96],[2.13,-.65],[1.96,-.16],[1.52,0],[1.31,-.35],[1.48,-.86],[2.03,-.94],[2.08,-.08],[2.43,0],
    [2.79,-.58],[3.02,-1.75],[2.78,-2.11],[2.55,-1.55],[2.64,-.53],[2.99,-.05],[3.3,-.12],
    [3.5,-.78],[3.98,-.96],[4.22,-.64],[4.05,-.14],[3.6,0],[3.4,-.35],[3.56,-.87],[4.12,-.94],[4.16,-.08],[4.55,0],
    [4.78,-.25],[4.9,-.94],[4.87,-.08],[5.1,-.77],[5.49,-.98],[5.81,-.74],[5.86,-.08],[6.14,-.02],
    [6.42,-.72],[6.87,-.95],[7.16,-.75],[6.74,-.94],[6.4,-.59],[6.47,-.14],[6.95,.02],[7.34,-.19],
    [7.57,-.56],[8.11,-.57],[8.2,-.88],[7.85,-1.01],[7.49,-.66],[7.6,-.14],[8.08,.02],[8.63,-.28],
    [8.8,.42],[7.35,.75],[4.5,.82],[1.4,.7],[-.1,.43]
  ].map(([x,y])=>[2*(x+.2)/9.3-1,2*(y+.65)/9.3]);
  // Approximately constant arc speed gives the long underline its fair share
  // of the period. Uniform spline-knot time otherwise races across the entire
  // word width during just the last few knots. Geometry remains the same.
  const BALANCE_ARC = [0];
  for(let i=1;i<=4096;i++){
    const a=catmullClosed(BALANCE_PTS,(i-1)/4096),b=catmullClosed(BALANCE_PTS,i/4096);
    BALANCE_ARC.push(BALANCE_ARC[i-1]+Math.hypot(b.x-a.x,b.y-a.y));
  }
  function balancePoint(s){
    if(s===1)s=0;
    const target=s*BALANCE_ARC[4096];let lo=0,hi=4096;
    while(hi-lo>1){const m=(lo+hi)>>1;if(BALANCE_ARC[m]<target)lo=m;else hi=m;}
    const f=(target-BALANCE_ARC[lo])/(BALANCE_ARC[hi]-BALANCE_ARC[lo] || 1);
    return catmullClosed(BALANCE_PTS,(lo+f)/4096);
  }
  // COPPERPLATE — the honest limit: ascender loops AND descender loops, so it
  // is the longest (9.56) and the tallest (1.77) of the six added here.
  // Registry-wide it is the extreme of nothing: `cursive` has a longer arc
  // (10.34) and `circle`/`square` taller spans (2.00 / 1.80).
  // Both predictors max out together and it measures 25.7 px — worse than every
  // curve in the registry except `wave` (26.6) and `cursive` (28.9), and still
  // the worst of the six signature strokes by a clear margin (next is
  // `descender` at 21.5). It read 27.3 px at the pre-2026-08 placement, and
  // ranked behind `cursive` alone; the clamp pushed it 29 px deeper into reach
  // and `wave` — which never moved — overtook it. Shipped so the showcase has a
  // curve the machine visibly cannot nail, not just ones it can.
  const COPPERPLATE_PTS = [
    [-0.55, 0.30], [-0.85, -0.20], [-0.55, -0.85], [-0.18, -0.35], [-0.30, 0.35],
    [-0.02, 0.85], [0.28, 0.35], [0.12, -0.35], [0.42, -0.85], [0.80, -0.30],
    [0.58, 0.35], [0.90, 0.72], [0.20, 0.92], [-0.50, 0.80], [-0.92, 0.55],
  ];
  // DESCENDER / ASCENDER — the matched mirror pair (see the header). ONE
  // generator, called with sign +1 and -1, so the two curves cannot drift
  // apart: any edit to the stroke changes both identically and the control
  // stays a control.
  const LOOPS = 2, BASE_Y = -0.30, LOOP_H = 0.55, X_HALF = 0.90, X_LOOP = 0.28, SWEEP = 0.72;
  function loopStroke(s, sign) {
    if (s < SWEEP) {
      // The written stroke: a baseline drift plus a circle whose tangential
      // speed beats the drift, so the loops genuinely cross (real cursive).
      const u = s / SWEEP, a = 2 * Math.PI * LOOPS * u;
      return { x: (-X_HALF + 2 * X_HALF * u) + X_LOOP * Math.sin(a),
               y: sign * (BASE_Y + LOOP_H * (1 - Math.cos(a))) };
    }
    // The return sweep that closes it, held just off the baseline.
    const u = (s - SWEEP) / (1 - SWEEP);
    return { x: X_HALF - 2 * X_HALF * u, y: sign * (BASE_Y - 0.18 * Math.sin(Math.PI * u)) };
  }
  const CURVES = {
    // EASIEST first — the "getting started" shapes the tip can actually follow.
    line:      { label: 'Line (horizontal sweep)', desc: 'Degenerate baseline: zero vertical extent, shortest arc. 8.5 px — the floor.',
                 fn: (s) => ({ x: Math.cos(s * 2 * Math.PI), y: 0 }) },
    wave:      { label: 'Wave (left→right squiggle)', open: true, desc: 'Open stroke: the cursor teleports back at the wrap, which pins its worst case at 172.9 px. 26.6 px mean.',
                 fn: (s) => ({ x: s * 2 - 1, y: Math.sin(s * 2 * Math.PI * 3) * 0.55 }) },
    ellipse:   { label: 'Wide loop (flat ellipse)', desc: 'Short arc, small vertical span: both predictors low. 10.1 px.',
                 fn: (s) => { const a = s * 2 * Math.PI; return { x: Math.sin(a), y: Math.cos(a) * 0.4 }; } },
    circle:    { label: 'Circle', desc: 'The largest vertical span in the registry (2.00) — the geometric worst case for a learned policy. 16.2 px. It moves the FURTHEST under the placement clamp (257 → 306.6, tied with triangle): at r140 it is 280 px tall, taller than the old framing height could hold inside the chain\'s reach, and it measured 22.9 px there. The largest error GAIN is square\'s, though — 7.3 px against this curve\'s 6.7 — so "moved most" and "gained most" are not the same curve.',
                 fn: (s) => { const a = s * 2 * Math.PI; return { x: Math.cos(a), y: Math.sin(a) }; } },
    triangle:  { label: 'Triangle', desc: 'Corners, which cost the planner less than length does. 14.0 px (16.5 px before the placement clamp pushed its high vertex back inside reach).',
                 fn: (s) => polyEdge([[0, -1], [0.87, 0.5], [-0.87, 0.5]], s) },
    square:    { label: 'Square', desc: 'Corners plus a large vertical span (1.80). 16.8 px, and 24.1 px before the placement clamp — the BIGGEST single gain of the eighteen, 7.3 px, on every reading (floor-normalised 0.146 → 0.107 against circle\'s 0.142 → 0.107, and −30% against circle\'s −29%). It moves less far than circle (257 → 292.6) and gains more, because gain tracks how much of the curve was outside reach, not how far the centre travels.',
                 fn: (s) => polyEdge([[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]], s) },
    figure8:   { label: 'Figure-8 (Lissajous)', desc: 'Mid arc, mid span; the long-standing default hard-but-solvable scene. 17.9 px.',
                 fn: (s) => { const a = s * 2 * Math.PI; return { x: Math.sin(a), y: Math.sin(2 * a) * 0.62 }; } },
    scriptS:   { label: 'Script S', open: true, desc: 'Open stroke, tall (1.70). Mean 16.8 px but worst 164.0 px — all of it the wrap teleport.',
                 fn: (s) => ({ x: Math.sin(s * 2 * Math.PI) * 0.7, y: (s - 0.5) * 1.7 }) },
    signature: { label: 'Signature flourish', open: true, desc: 'Open stroke, flat (1.07). 21.0 px mean, 152.6 px worst.',
                 fn: (s) => ({ x: (s - 0.5) * 1.9, y: Math.sin(s * 2 * Math.PI * 2.2) * 0.55 * (0.6 + 0.4 * Math.sin(s * Math.PI)) }) },
    // ---- genuinely signature-like curves (added for the epicycle setup) ----
    // OPEN strokes: x sweeps left→right and jumps back at the wrap, so the
    // plain DFT sees a discontinuity (Gibbs). Draw these with mode:'even'
    // (there-and-back) — measured much cheaper in arms. See curve_fourier.js.
    cursive:   {
      label: 'Cursive loops ("eee")',
      open: true,
      desc: 'The longest arc in the registry (10.34) ⇒ the fastest cursor at a fixed period, and the worst curve: 28.9 px. Give it periodFor() and it becomes one of the easiest.',
      // Baseline drift + a circle whose tangential speed (2π·4·0.28 = 7.0)
      // beats the drift (1.4) ⇒ genuine crossing loops, like real cursive.
      // Amplitudes chosen so |x| ≤ 0.98: every curve here must stay inside the
      // unit box or it overflows the traceRadius box the renderer draws.
      fn: (s) => { const a = s * 2 * Math.PI * 4; return { x: (s * 2 - 1) * 0.70 + 0.28 * Math.cos(a), y: 0.28 * Math.sin(a) * 1.5 }; },
    },
    // CLOSED signature: a wavy forward stroke, then a swooping underline that
    // returns to the start. Continuous but with a corner at each end.
    flourish:  {
      label: 'Flourish + underline',
      desc: 'Closed stroke-and-return, mid arc and span. 20.5 px.',
      fn: (s) => {
        if (s < 0.7) { const u = s / 0.7; return { x: -0.95 + 1.9 * u, y: 0.42 * Math.sin(u * 2 * Math.PI * 2.5) - 0.28 * Math.sin(u * Math.PI) }; }
        const u = (s - 0.7) / 0.3;
        return { x: 0.95 - 1.9 * u, y: 0.62 * Math.sin(u * Math.PI) };
      },
    },
    autograph: { label: 'Autograph (spline scrawl)', desc: 'Closed C¹ spline scrawl. The MOST expensive curve in the registry in epicycle arms (12); longhand, matched to it in arc and span, needs 8. 21.2 px.',
                 fn: (s) => catmullClosed(AUTOGRAPH_PTS, s) },
    // ---- the measured-difficulty signature set ------------------------------
    // Six curves, ordered by measured steady-state planner error. They exist to
    // span the two predictors that survive task 1's controls — arc length and
    // vertical span — with real handwriting shapes rather than geometry, and
    // to give the showcase both a win it can land and a limit it cannot.
    swash:      { label: 'Swash (flat flourish)',
                  desc: 'The closing flourish, written low and wide: arc 4.13 and span 0.49, the flattest stroke-like curve here. 10.9 px — only line and ellipse beat it, and neither is a signature.',
                  fn: (s) => catmullClosed(SWASH_PTS, s) },
    monogram:   { label: 'Monogram (linked initials)',
                  desc: 'Two capitals joined by a crossing loop. Arc 6.15, span 1.00. 16.4 px.',
                  fn: (s) => catmullClosed(MONOGRAM_PTS, s) },
    balance:    { label: 'Balance · connected English word',
                  benchmarkStatus: 'unmeasured',
                  desc: 'The letters B-a-l-a-n-c-e form one connected monoline stroke, closed by an underline return. A longer word-tracing challenge; inspect actual pen error rather than treating the target path as the result.',
                  fn: balancePoint },
    longhand:   { label: 'Longhand (name + underline)',
                  desc: 'A five-hump word closed by an underline swash — the flagship signing scene. Matched to autograph in arc and span; 19.6 px vs its 21.2.',
                  fn: (s) => catmullClosed(LONGHAND_PTS, s) },
    ascender:   { label: 'Ascender loops (shallow half of the mirror pair)',
                  desc: 'Loops rising ABOVE the baseline, toward the sharp-fold side of the workspace — far enough that at r140 the reach clamp is what stops it going there, moving this curve 22 px deeper than its mirror twin. Same arc, span and turning as descender. Auto-placed it reads 19.5 px vs 21.5, but that gap is the placement; put both at the same centre (traceCenterY 257) and it is 20.8 vs 21.5 — the depth axis measures NULL.',
                  fn: (s) => loopStroke(s, -1) },
    descender:  { label: 'Descender loops (deep half of the mirror pair)',
                  desc: 'The same stroke with the loops hanging BELOW the baseline, past the chain\'s natural hang. The deep side is the CHEAP side to sit on, but only up to a point: the reach clamp starts moving `ascender` at r123 and this curve at r165. So the mirror pair is placement-MATCHED only below r123 — at the registry\'s r140 the ascender is 22px deeper and this one still sits at the framing height, and from r165 up the clamp moves this one too (r180 → 253 against the framing\'s 239, r200 → 263 against 230). Quote the pair as a control at r100, or force both centres. 21.5 px against the ascender\'s 20.8 at the same centre: depth costs nothing once arc and span are matched.',
                  fn: (s) => loopStroke(s, +1) },
    copperplate: { label: 'Copperplate (tall ornate)',
                  desc: 'Ascenders and descenders together: the longest (9.56) and tallest (1.77) of the six signature strokes added with it. 25.7 px — the honest limit; registry-wide cursive has a longer arc (10.34) and measures worse (28.9 px). It read 27.3 px before the placement clamp, and the two copperplate presets deliberately PIN that older height, so their numbers and this one are quoted at different centres.',
                  fn: (s) => catmullClosed(COPPERPLATE_PTS, s) },
  };
  // MEASURED unit-space geometry — the predictors, not decoration. Sampled at
  // NS = 4096 uniformly in s (arcU is the polygonal length at that sampling;
  // it converges from below, so a guard must resample the same way). The smoke
  // test re-derives every row from the live fn and fails on drift, which is
  // what keeps the descriptions above honest.
  //   arcU    unit arc length  → world arc = arcU·traceRadius, and target
  //           speed = that / tracePeriod. Predictor #1.
  //   ySpanU  unit vertical span → world span = ySpanU·traceRadius. Predictor #2.
  //   yMeanU  mean unit depth (+ = below the curve centre). Reported because it
  //           is the axis the ascender/descender pair controls, and measures null.
  //   yTopU   unit rise ABOVE the curve centre (= −min y). ySpanU says how TALL
  //   yBotU   unit drop BELOW it (= max y).                a curve is; this pair
  //           says how that height is SPLIT, and most of these curves are not
  //           symmetric about their centre (ascender 0.800/0.480, its mirror the
  //           reverse; autograph 0.555/0.700). setups.js needs the split, not the
  //           span: the chain-trace placement clamps the curve into the chain's
  //           MEASURED reach band, and that clamp is one bound per end —
  //           [tipYMin + yTopU·r, tipYMax − yBotU·r]. Using half the span
  //           instead would misplace every asymmetric curve by (yBotU−yTopU)·r/2
  //           (22 px for autograph at r=140).
  //           yTopU + yBotU === ySpanU exactly; the smoke test re-derives all
  //           three from the live fn and checks the identity.
  const GEOM = {
    line:        { arcU: 4.00, ySpanU: 0.00, yMeanU: 0.00, yTopU: 0.000, yBotU: 0.000 },
    wave:        { arcU: 9.03, ySpanU: 1.10, yMeanU: 0.00, yTopU: 0.550, yBotU: 0.550 },
    ellipse:     { arcU: 4.60, ySpanU: 0.80, yMeanU: 0.00, yTopU: 0.400, yBotU: 0.400 },
    circle:      { arcU: 6.28, ySpanU: 2.00, yMeanU: 0.00, yTopU: 1.000, yBotU: 1.000 },
    triangle:    { arcU: 5.21, ySpanU: 1.50, yMeanU: 0.00, yTopU: 1.000, yBotU: 0.500 },
    square:      { arcU: 7.20, ySpanU: 1.80, yMeanU: 0.00, yTopU: 0.900, yBotU: 0.900 },
    figure8:     { arcU: 6.84, ySpanU: 1.24, yMeanU: 0.00, yTopU: 0.620, yBotU: 0.620 },
    scriptS:     { arcU: 5.09, ySpanU: 1.70, yMeanU: 0.00, yTopU: 0.850, yBotU: 0.850 },
    signature:   { arcU: 6.66, ySpanU: 1.07, yMeanU: 0.01, yTopU: 0.524, yBotU: 0.545 },
    cursive:     { arcU: 10.34, ySpanU: 0.84, yMeanU: 0.00, yTopU: 0.420, yBotU: 0.420 },
    flourish:    { arcU: 7.09, ySpanU: 1.27, yMeanU: 0.03, yTopU: 0.648, yBotU: 0.620 },
    autograph:   { arcU: 7.50, ySpanU: 1.25, yMeanU: 0.08, yTopU: 0.555, yBotU: 0.700 },
    swash:       { arcU: 4.13, ySpanU: 0.49, yMeanU: -0.03, yTopU: 0.250, yBotU: 0.240 },
    balance:     { arcU: 10.1483283065, ySpanU: 0.6558122745, yMeanU: 0.0583181702, yTopU: 0.3391774650, yBotU: 0.3166348096 },
    monogram:    { arcU: 6.15, ySpanU: 1.00, yMeanU: 0.06, yTopU: 0.468, yBotU: 0.537 },
    longhand:    { arcU: 7.45, ySpanU: 1.12, yMeanU: 0.08, yTopU: 0.480, yBotU: 0.643 },
    ascender:    { arcU: 7.39, ySpanU: 1.28, yMeanU: -0.06, yTopU: 0.800, yBotU: 0.480 },
    descender:   { arcU: 7.39, ySpanU: 1.28, yMeanU: 0.06, yTopU: 0.480, yBotU: 0.800 },
    copperplate: { arcU: 9.56, ySpanU: 1.77, yMeanU: 0.15, yTopU: 0.851, yBotU: 0.922 },
  };
  const GEOM_SAMPLES = 4096;
  // HISTORICAL ERROR NUMBERS THE DESCRIPTIONS QUOTE, in one place. Unlike GEOM these
  // are not properties of the curve — they are properties of the curve ON THIS
  // PLANT AT THIS PLACEMENT, so they change when either does, and in 2026-08
  // both the placement rule and seven of these numbers did.
  //   Protocol: shipped signing config (4 segments, rigid, 3 servo joints,
  //   telescope on), r140, period 10, initial-tip x / auto y placement, tilts
  //   ±0.1, 3 loops with the first skipped, mean |tip − cursor| px, hand-written
  //   planner. The original chain-trace-placement-probe.js --cost measured this
  //   convention; current replay code must explicitly request initial-tip.
  //   These values are retained as historical metadata, not a freshly verified
  //   performance table for the centered default. See PLANNER_BENCHMARK below.
  const PLANNER_PX_140 = {
    line: 8.5, wave: 26.6, ellipse: 10.1, circle: 16.2, triangle: 14.0, square: 16.8,
    figure8: 17.9, scriptS: 16.8, signature: 21.0, cursive: 28.9, flourish: 20.5,
    autograph: 21.2, swash: 10.9, monogram: 16.4, longhand: 19.6, ascender: 19.5,
    descender: 21.5, copperplate: 25.7,
  };
  // Keep these data available for old reports without silently treating them as
  // scores for the new rail-centered scenes. Geometry and curve functions are
  // unchanged. Visible descriptions carry the same scope as the numeric table.
  const PLANNER_BENCHMARK = Object.freeze({
    scope: 'Historical initial-tip anchor', traceCenterMode: 'initial-tip',
    segments: 4, radius: 140, period: 10, tilts: [-0.1, 0.1],
    loops: 3, discardedLoops: 1, metric: 'mean tip-to-cursor distance in pixels',
  });
  for (const curve of Object.values(CURVES)) {
    if(curve===CURVES.balance)continue; // Newly added word has no historical planner result.
    curve.desc += ' Tracking-error figures are historical: initial-tip anchor, four links, radius 140, 10-second loops. Centered scenes differ.';
  }
  const DEFAULT_KEY = 'circle';
  function resolve(key) { return CURVES[key] || CURVES[DEFAULT_KEY]; }
  function geometry(key) { return GEOM[key] || null; }
  // Evaluate a curve at absolute time t (seconds) given a loop period, → unit point.
  function pointAt(key, t, period) {
    const T = period > 0 ? period : 1;
    const s = (((t % T) + T) % T) / T;
    return resolve(key).fn(s);
  }
  // THE DIFFICULTY KNOB THE MEASUREMENT ACTUALLY JUSTIFIES. Target speed is the
  // strongest single predictor of planner error, and it is the product of a
  // curve's arc length and the radius divided by the period — so a preset that
  // wants two curves to be equally hard must give them DIFFERENT periods.
  // Re-periodising the 12 original curves to a common 70 px/s collapsed their
  // error range from 11.0–29.4 px to 14.7–25.2 px and inverted the ranking
  // (cursive went from worst, 28.2 px, to third best, 16.8 px).
  //   periodFor('cursive', 140, 70) → 20.7 s;  periodFor('swash', 140, 70) → 8.3 s
  function periodFor(key, radius, speedPxPerSec) {
    const g = GEOM[key];
    const v = speedPxPerSec > 0 ? speedPxPerSec : 70;
    if (!g) return null;
    return (g.arcU * (radius > 0 ? radius : 1)) / v;
  }
  // World-space vertical extent of a curve drawn at `radius`, split into the
  // rise above the centre and the drop below it. Unknown keys resolve the way
  // pointAt does (→ circle), so the extent always describes the shape that will
  // actually be DRAWN rather than the one that was asked for — the chain-trace
  // placement in setups.js is built on this, and a mismatch there would clamp
  // the curve using someone else's height.
  function yExtent(key, radius) {
    const g = GEOM[key] || GEOM[DEFAULT_KEY];
    const r = (radius > 0) ? radius : 0;
    return { top: g.yTopU * r, bot: g.yBotU * r };
  }
  BF.chainTraceCurves = {
    curves: CURVES, defaultKey: DEFAULT_KEY, resolve, pointAt,
    GEOM, GEOM_SAMPLES, geometry, periodFor, yExtent, PLANNER_PX_140, PLANNER_BENCHMARK,
  };
})(window.BF = window.BF || {});
