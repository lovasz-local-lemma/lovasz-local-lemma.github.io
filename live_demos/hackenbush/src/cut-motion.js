// Motion styles for the cut animation.
//
// The idea here is that the STYLE lives in the movement, not in the imagery: no
// mode draws a vine, a mobile, or a Bauhaus poster. Each one borrows a way of
// moving — how a thing accelerates, hesitates, resists, or settles — and applies
// it to whatever the board happens to look like.
//
// Each style is `(svgEl, bodies, ctx) => void` and owns its own lifetime: it
// must remove `svgEl` when finished. `bodies` come from buildComponentSprites,
// so each has { group, originX, originY, minX, maxX, minY, maxY, width, height,
// color, includesCut }.

const easeOutCubic = (t) => 1 - ((1 - t) ** 3);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

// Damped harmonic oscillator, normalised to start at 1 and settle at 0.
// `zeta` is the damping ratio: below 1 it rings, near 1 it settles dead.
function damped(t, freq, zeta) {
  return Math.exp(-zeta * freq * t) * Math.cos(freq * t * Math.sqrt(Math.max(1 - zeta * zeta, 0)));
}

function runFrames(svgEl, duration, onFrame) {
  const start = performance.now();
  function step(now) {
    const t = clamp01((now - start) / duration);
    onFrame(t);
    if (t < 1) requestAnimationFrame(step);
    else svgEl.remove();
  }
  requestAnimationFrame(step);
}

// Respecting prefers-reduced-motion: every style collapses to the same quiet
// fade rather than being skipped, so the cut is still legible.
function reducedFade(svgEl, bodies) {
  runFrames(svgEl, 260, (t) => {
    for (const body of bodies) body.group.setAttribute("opacity", String(1 - t));
  });
}

// ── Jelly ────────────────────────────────────────────────────────────────────
// Elasticity as a motion language. The piece is a mass on a spring: the cut
// releases stored tension, so it squashes, overshoots, rings down through a
// couple of decreasing wobbles, and only then lets go and drops. Squash and
// stretch stay volume-preserving (x and y are always in opposite phase), which
// is what sells it as a physical body rather than a scaling rectangle.
function jelly(svgEl, bodies) {
  runFrames(svgEl, 1250, (t) => {
    for (const body of bodies) {
      const phase = clamp01(t / 0.62);
      const ring = damped(phase * 3.1, 6.2, body.includesCut ? 0.16 : 0.26);
      const squash = ring * (body.includesCut ? 0.34 : 0.2);
      const drop = t < 0.55 ? 0 : easeOutCubic((t - 0.55) / 0.45) * 240;
      const tilt = ring * 7;
      body.group.setAttribute(
        "transform",
        `translate(${body.originX}, ${body.originY}) rotate(${tilt}) scale(${1 - squash}, ${1 + squash}) translate(${-body.originX}, ${-body.originY + drop})`,
      );
      body.group.setAttribute("opacity", String(t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28));
    }
  });
}

// ── Bauhaus ──────────────────────────────────────────────────────────────────
// Rationalist motion. Nothing curves and nothing eases: movement happens only
// along a primary axis, at constant speed, in equal metronomic beats separated
// by dead stops. The piece steps sideways, halts, steps down, halts, snaps
// through a right angle, then is erased along a single axis. The style is the
// grammar — right angles, regular meter, no ornament — not the palette.
function bauhaus(svgEl, bodies) {
  const BEATS = 5;
  runFrames(svgEl, 1150, (t) => {
    const beat = Math.min(Math.floor(t * BEATS), BEATS - 1);
    const local = (t * BEATS) - beat; // 0..1 within the beat, linear on purpose
    for (const body of bodies) {
      const dir = body.originX < 490 ? -1 : 1;
      const step = body.width * 0.5 + 40;
      let dx = 0;
      let dy = 0;
      let rot = 0;
      let scaleY = 1;
      if (beat >= 1) dx = step * dir;
      if (beat === 0) dx = step * dir * local;
      if (beat >= 2) dy = 70;
      if (beat === 1) dy = 70 * local;
      if (beat >= 3) rot = 90;
      if (beat === 2) rot = 90 * Math.floor(local * 2) / 2; // snaps at the halfway point
      if (beat >= 4) scaleY = Math.max(1 - local, 0);
      body.group.setAttribute(
        "transform",
        `translate(${dx}, ${dy}) translate(${body.originX}, ${body.originY}) rotate(${rot}) scale(1, ${scaleY}) translate(${-body.originX}, ${-body.originY})`,
      );
    }
  });
}

// ── Whiplash ─────────────────────────────────────────────────────────────────
// Art Nouveau's signature line is the "whiplash": a long, slow, swelling curve
// that suddenly tightens into a curl. Here that curve is traced through TIME
// rather than drawn — the piece drifts almost imperceptibly for the first half,
// then accelerates hard as it spirals inward, rotation and shrink both running
// away together. Asymmetric easing is the whole effect.
function whiplash(svgEl, bodies) {
  runFrames(svgEl, 1500, (t) => {
    // Quintic ease-in: nearly still, then a whip.
    const whip = t ** 5;
    const drift = t ** 1.4;
    for (const body of bodies) {
      const dir = body.includesCut ? 1 : -1;
      const swing = 26 * drift + 150 * whip;
      const angle = dir * (18 * drift + 520 * whip);
      const curlX = Math.cos(angle * Math.PI / 180) * swing * 0.35;
      const curlY = swing;
      const shrink = 1 - whip * 0.92;
      body.group.setAttribute(
        "transform",
        `translate(${curlX}, ${curlY}) translate(${body.originX}, ${body.originY}) rotate(${angle}) scale(${shrink}) translate(${-body.originX}, ${-body.originY})`,
      );
      body.group.setAttribute("opacity", String(1 - whip * 0.9));
    }
  });
}

// ── Butoh ────────────────────────────────────────────────────────────────────
// Butoh moves at the edge of stillness: the body resists its own collapse,
// trembling, sinking by increments, sometimes twitching back upward against
// gravity — and then yields all at once. So this is deliberately the SLOWEST
// mode, and most of its duration is spent almost not moving.
function butoh(svgEl, bodies) {
  runFrames(svgEl, 2200, (t) => {
    for (const body of bodies) {
      const seed = body.originX * 0.07;
      // High-frequency tremor that fades as the body gives up resisting.
      const tremor = Math.sin(t * 46 + seed) * 2.4 * (1 - t) + Math.sin(t * 91 + seed) * 1.1 * (1 - t);
      // Three discrete refusals: brief upward twitches against the sinking.
      const refusal = [0.22, 0.44, 0.63].reduce((acc, at) => {
        const d = Math.abs(t - at);
        return acc - (d < 0.035 ? (0.035 - d) * 150 : 0);
      }, 0);
      // Creeping sink for most of the run, then a sudden yield at the end.
      const creep = Math.min(t / 0.78, 1) ** 2.4 * 46;
      const yieldDrop = t <= 0.78 ? 0 : ((t - 0.78) / 0.22) ** 2 * 260;
      const collapse = t <= 0.78 ? 0 : (t - 0.78) / 0.22;
      body.group.setAttribute(
        "transform",
        `translate(${tremor}, ${creep + refusal + yieldDrop}) translate(${body.originX}, ${body.originY}) scale(${1 + collapse * 0.12}, ${1 - collapse * 0.55}) translate(${-body.originX}, ${-body.originY})`,
      );
      body.group.setAttribute("opacity", String(t < 0.8 ? 1 : Math.max(1 - (t - 0.8) / 0.2, 0)));
    }
  });
}

// ── Mobile ───────────────────────────────────────────────────────────────────
// Calder's mobiles are about equilibrium: disturb one arm and the whole
// structure hunts for balance again. So the cut piece doesn't fall — it swings
// from its top edge as a damped pendulum, and every OTHER falling component
// counter-rotates the opposite way, as if the shared armature were rebalancing.
// The piece only releases once the swing has nearly settled.
function mobile(svgEl, bodies) {
  runFrames(svgEl, 1900, (t) => {
    for (const body of bodies) {
      const pivotX = body.originX;
      const pivotY = body.minY - 6;
      const dir = body.includesCut ? 1 : -0.55; // counterweights swing against
      const swing = damped(t * 4.6, 5.4, 0.12) * 26 * dir;
      const release = t <= 0.72 ? 0 : easeOutCubic((t - 0.72) / 0.28);
      body.group.setAttribute(
        "transform",
        `translate(0, ${release * 300}) rotate(${swing}, ${pivotX}, ${pivotY})`,
      );
      body.group.setAttribute("opacity", String(1 - release * 0.95));
    }
  });
}

// ── Suprematist ──────────────────────────────────────────────────────────────
// Malevich's compositions float: no ground, no gravity, no up. Pieces leave
// along fixed diagonals at constant velocity — no acceleration curve at all,
// which is what makes it read as weightless rather than dropped — rotating
// slowly and evenly as they go, and thinning into the white.
function suprematist(svgEl, bodies) {
  runFrames(svgEl, 1400, (t) => {
    bodies.forEach((body, i) => {
      // Fixed diagonal per body, evenly spaced — a composition, not a scatter.
      const angle = (-52 + (i % 4) * 37) * Math.PI / 180;
      const distance = t * 420; // linear: constant velocity, no easing
      const spin = t * (body.includesCut ? 34 : -22); // slow, even
      body.group.setAttribute(
        "transform",
        `translate(${Math.cos(angle) * distance}, ${Math.sin(angle) * distance}) translate(${body.originX}, ${body.originY}) rotate(${spin}) translate(${-body.originX}, ${-body.originY})`,
      );
      body.group.setAttribute("opacity", String(Math.max(1 - t ** 1.7, 0)));
    });
  });
}

// ── Breath ───────────────────────────────────────────────────────────────────
// The quietest one. The piece simply breathes — two slow, shallow swells, the
// second smaller than the first — and then lets go on the exhale. Nothing
// travels far; the whole effect is in the timing, which is why it reads as
// alive rather than animated.
function breath(svgEl, bodies) {
  runFrames(svgEl, 1700, (t) => {
    for (const body of bodies) {
      const breathing = clamp01(t / 0.68);
      // Two cycles, decaying: an inhale, a smaller one, then release.
      const swell = Math.sin(breathing * Math.PI * 2 * 2) * 0.045 * (1 - breathing * 0.55);
      const lift = -Math.sin(breathing * Math.PI * 2 * 2) * 5 * (1 - breathing * 0.55);
      const exhale = t <= 0.68 ? 0 : easeOutCubic((t - 0.68) / 0.32);
      body.group.setAttribute(
        "transform",
        `translate(0, ${lift + exhale * 120}) translate(${body.originX}, ${body.originY}) scale(${1 + swell}) translate(${-body.originX}, ${-body.originY})`,
      );
      body.group.setAttribute("opacity", String(1 - exhale));
    }
  });
}

// ── Wither ───────────────────────────────────────────────────────────────────
// A drying leaf. The piece curls about its own base, shrivelling along one axis
// while thickening slightly along the other — the way plant tissue loses water
// unevenly — with the curl accelerating as it goes brittle.
function wither(svgEl, bodies) {
  runFrames(svgEl, 1800, (t) => {
    bodies.forEach((body, i) => {
      const curl = t ** 1.9;
      const dir = i % 2 === 0 ? 1 : -1;
      const pivotX = body.originX;
      const pivotY = body.maxY; // curls from where it meets the ground
      const rot = dir * curl * 26;
      const skew = dir * curl * 15;
      const shrivel = 1 - curl * 0.6;
      const thicken = 1 + curl * 0.09;
      body.group.setAttribute(
        "transform",
        `translate(${pivotX}, ${pivotY}) rotate(${rot}) skewX(${skew}) scale(${thicken}, ${shrivel}) translate(${-pivotX}, ${-pivotY})`,
      );
      body.group.setAttribute("opacity", String(Math.max(1 - curl * 1.05, 0)));
    });
  });
}

// ── Tide ─────────────────────────────────────────────────────────────────────
// Weed in a current. The body lifts on a long swell, leaning as the water
// pushes past, hangs at the top of the surge, then is drawn away — the lateral
// sway continuing the whole time, slightly out of phase per body so the group
// moves like water rather than like a slideshow.
function tide(svgEl, bodies) {
  runFrames(svgEl, 2100, (t) => {
    for (const body of bodies) {
      const phase = body.originX / 130;
      const sway = Math.sin(t * Math.PI * 1.6 + phase) * 26 * (0.4 + t * 0.6);
      const lift = -Math.sin(t * Math.PI) * 20;
      const lean = Math.sin(t * Math.PI * 1.6 + phase) * 6;
      const pull = t <= 0.6 ? 0 : ((t - 0.6) / 0.4) ** 1.7;
      body.group.setAttribute(
        "transform",
        `translate(${sway + pull * 90}, ${lift + pull * 150}) translate(${body.originX}, ${body.originY}) rotate(${lean}) translate(${-body.originX}, ${-body.originY})`,
      );
      body.group.setAttribute("opacity", String(1 - pull));
    }
  });
}

// ── Murmuration ──────────────────────────────────────────────────────────────
// A flock turning. Every body shares one drifting heading but carries its own
// small phase offset, so they stay cohesive while never moving in lockstep —
// the cohesion-plus-variation that makes a starling cloud read as one creature.
function murmuration(svgEl, bodies) {
  runFrames(svgEl, 1900, (t) => {
    bodies.forEach((body, i) => {
      const seed = i * 1.7 + body.originX / 220;
      // One shared heading that wanders, plus a per-body wobble around it.
      const heading = -1.1 + Math.sin(t * 2.2) * 0.45 + Math.sin(t * 5.1 + seed) * 0.22;
      const speed = (t ** 1.6) * 360 * (0.82 + ((i % 3) * 0.12));
      const flutter = Math.sin(t * 17 + seed) * 5 * (1 - t);
      const bank = Math.sin(t * 5.1 + seed) * 16;
      body.group.setAttribute(
        "transform",
        `translate(${Math.cos(heading) * speed}, ${Math.sin(heading) * speed + flutter}) translate(${body.originX}, ${body.originY}) rotate(${bank}) translate(${-body.originX}, ${-body.originY})`,
      );
      body.group.setAttribute("opacity", String(Math.max(1 - t ** 2.1, 0)));
    });
  });
}

// ── Bloom ────────────────────────────────────────────────────────────────────
// Unfurling. The piece opens outward from the board's centre with the slight
// overshoot of a petal releasing tension, turning as it opens, then thins away.
// Growth first, disappearance second — the opposite order to every falling mode.
function bloom(svgEl, bodies, ctx = {}) {
  const cx = ctx.centerX ?? 490;
  const cy = ctx.centerY ?? 310;
  runFrames(svgEl, 1750, (t) => {
    bodies.forEach((body, i) => {
      const open = easeOutCubic(clamp01(t / 0.55));
      const overshoot = open + damped(t * 5, 7, 0.3) * 0.06 * (1 - open);
      const dx = body.originX - cx;
      const dy = body.originY - cy;
      const spread = overshoot * 0.42;
      const turn = overshoot * (i % 2 === 0 ? 15 : -15);
      const fade = t <= 0.5 ? 0 : (t - 0.5) / 0.5;
      body.group.setAttribute(
        "transform",
        `translate(${dx * spread}, ${dy * spread}) translate(${body.originX}, ${body.originY}) rotate(${turn}) scale(${1 + overshoot * 0.16 - fade * 0.3}) translate(${-body.originX}, ${-body.originY})`,
      );
      body.group.setAttribute("opacity", String(Math.max(1 - fade ** 1.5, 0)));
    });
  });
}

export const MOTION_STYLES = {
  jelly,
  bauhaus,
  whiplash,
  butoh,
  mobile,
  suprematist,
  breath,
  wither,
  tide,
  murmuration,
  bloom,
};

// Labels for the effect picker, in the order they should appear.
export const MOTION_STYLE_LABELS = [
  ["jelly", "Jelly", "Springs, overshoots and rings down before letting go"],
  ["mobile", "Mobile", "Swings from its top edge; the rest counterweights"],
  ["whiplash", "Whiplash", "Barely moves, then whips into a tightening curl"],
  ["bauhaus", "Bauhaus", "Right angles and dead stops, on a strict metronome"],
  ["butoh", "Butoh", "Resists, trembles, refuses — then yields all at once"],
  ["suprematist", "Suprematist", "Weightless drift along fixed diagonals"],
  ["breath", "Breath", "Two shallow swells, then lets go on the exhale"],
  ["wither", "Wither", "Curls and shrivels from the base, like a drying leaf"],
  ["tide", "Tide", "Lifts on a swell, leans with the current, is drawn away"],
  ["murmuration", "Murmuration", "One shared heading, each piece wobbling around it"],
  ["bloom", "Bloom", "Opens outward with a petal's overshoot, then thins away"],
];

export function runMotionStyle(name, svgEl, bodies, ctx = {}) {
  const style = MOTION_STYLES[name];
  if (!style) return false;
  if (ctx.reduceMotion) reducedFade(svgEl, bodies);
  else style(svgEl, bodies, ctx);
  return true;
}
