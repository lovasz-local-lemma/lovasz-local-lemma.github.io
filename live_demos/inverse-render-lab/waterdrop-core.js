(function initWaterdropCore(root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WaterdropCore = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  // EXPERIMENTAL. Accidental refractive optics: stereo from raindrops on a window.
  //
  // A drop adhered to glass is transparent and convex, so it works as a very short focal length
  // lens. Two drops in one photograph are therefore two viewpoints, and the pair is a stereo
  // rig nobody installed. This shares the premise of the coded-aperture and NLOS lanes -- the
  // world is full of uncalibrated optics that already encode more than the direct view -- and
  // shares no forward model with any of them, which is why it ships marked experimental.
  //
  // Anchor: You, Tan, Kawakami, Mukaigawa and Ikeuchi 2016, Waterdrop Stereo.
  //
  // WHAT THIS LANE IS ACTUALLY ABOUT. Not that triangulation works -- two rays in a plane meet,
  // and demonstrating that would prove nothing. The interesting quantity is how hard the method
  // leans on knowing the drop's SHAPE. Every recovered ray direction comes from Snell's law at
  // a surface whose curvature was assumed rather than observed, so a shape error becomes a ray
  // direction error becomes a depth error, with a gain that this lane measures. That gain is
  // the reason the paper's real contribution is recovering drop geometry by minimising surface
  // tension plus gravitational potential energy rather than assuming a sphere.
  //
  // SCOPE, and it is a large one.
  //   * A two-dimensional cross-section. The window is a line, drops are circular arcs, the
  //     sensor is one-dimensional. A real drop is a 3-D surface flattened by gravity, and
  //     recovering that shape is the part of the paper this lane deliberately does not do.
  //   * The drop is modelled as a spherical cap: the zero-gravity equilibrium shape. Gravity
  //     makes real drops asymmetric, teardrop-like, and the sensitivity measured below is
  //     precisely what says how much that matters.
  //   * CORRESPONDENCE IS GIVEN. The lane is told which sample in drop A views the same world
  //     point as which sample in drop B. Solving that is most of the difficulty in practice.
  //   * The glass slab is ignored. Two parallel refractions through a thin plate offset a ray
  //     laterally without turning it, and that offset is small against the drop's curvature.
  //   * No Fresnel weighting, no total-internal-reflection imaging, no dispersion, no
  //     absorption. Geometry only.

  const DEFAULTS = {
    waterIor: 1.333,
    cameraX: 300,          // mm from the window, inside
    cameraY: 0,
    dropRadius: 1.6,       // mm, sphere radius of the cap
    dropHeight: 1.05,      // mm, how far the cap bulges out of the glass
    pixelsPerDrop: 96,     // how many sensor samples the drop covers
    drops: [-6, -2, 3, 8]  // contact centres along the window, mm
  };

  // ---------------------------------------------------------------------------------------
  // Geometry helpers
  // ---------------------------------------------------------------------------------------

  function length(v) { return Math.hypot(v.x, v.y); }
  function normalize(v) {
    const n = length(v);
    return n > 0 ? { x: v.x / n, y: v.y / n } : { x: 0, y: 0 };
  }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }

  // Where the cap's sphere centre sits. For a cap shallower than a hemisphere this is INSIDE
  // the glass, at positive x, while the drop itself bulges to negative x.
  function capCentreX(shape) { return shape.radius - shape.height; }

  // Half-width of the wetted footprint on the glass, from the circle meeting the plane x = 0.
  function contactHalfWidth(shape) {
    const c = capCentreX(shape);
    const inner = shape.radius * shape.radius - c * c;
    return inner > 0 ? Math.sqrt(inner) : 0;
  }

  // Snell in vector form. n is flipped if needed so it faces the incoming ray, which makes the
  // function safe to call without the caller tracking which side of a surface it is on --
  // exactly the kind of bookkeeping that produces a plausible but wrong ray.
  function refract(direction, normal, etaRatio) {
    let n = normal;
    let cosIncident = -dot(direction, n);
    if (cosIncident < 0) {
      n = { x: -n.x, y: -n.y };
      cosIncident = -cosIncident;
    }
    const k = 1 - etaRatio * etaRatio * (1 - cosIncident * cosIncident);
    if (k < 0) return null; // total internal reflection
    const cosTransmitted = Math.sqrt(k);
    const scale = etaRatio * cosIncident - cosTransmitted;
    return normalize({
      x: etaRatio * direction.x + scale * n.x,
      y: etaRatio * direction.y + scale * n.y
    });
  }

  // Nearest positive intersection of a ray with a circle.
  function intersectCircle(origin, direction, centre, radius) {
    const ox = origin.x - centre.x;
    const oy = origin.y - centre.y;
    const b = 2 * (ox * direction.x + oy * direction.y);
    const c = ox * ox + oy * oy - radius * radius;
    const discriminant = b * b - 4 * c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    const t0 = (-b - root) / 2;
    const t1 = (-b + root) / 2;
    const t = t0 > 1e-9 ? t0 : (t1 > 1e-9 ? t1 : null);
    if (t === null) return null;
    return { x: origin.x + t * direction.x, y: origin.y + t * direction.y, t };
  }

  // ---------------------------------------------------------------------------------------
  // Forward optics
  // ---------------------------------------------------------------------------------------

  // Where each sensor sample of a drop lands on the glass. Laid out from the TRUE footprint,
  // because a pixel is fixed by the camera: guessing the drop's shape wrong later must not
  // retroactively move where the camera was looking.
  function sampleEntries(dropY, shape, overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const half = contactHalfWidth(shape);
    const entries = [];
    for (let k = 0; k < config.pixelsPerDrop; k += 1) {
      entries.push(dropY - half + 2 * half * (k + 0.5) / config.pixelsPerDrop);
    }
    return entries;
  }

  // Camera -> flat glass face -> water -> curved cap -> world. Two refractions; the flat one
  // uses the plane normal and the curved one the radial normal.
  //
  // `shape` is the ASSUMED cap. Passing the true one gives the forward model; passing a
  // perturbed one is what the sensitivity measurement is made of.
  function traceRay(entryY, dropY, shape, overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const entry = { x: 0, y: entryY };
    const incident = normalize({ x: -config.cameraX, y: entryY - config.cameraY });
    const inWater = refract(incident, { x: 1, y: 0 }, 1 / config.waterIor);
    if (!inWater) return null;
    const centre = { x: capCentreX(shape), y: dropY };
    const exit = intersectCircle(entry, inWater, centre, shape.radius);
    if (!exit || exit.x > 1e-9) return null; // must leave through the bulge, not back into glass
    const outward = normalize({ x: exit.x - centre.x, y: exit.y - centre.y });
    const outDirection = refract(inWater, outward, config.waterIor);
    if (!outDirection) return null; // total internal reflection: this sample sees nothing useful
    return { origin: { x: exit.x, y: exit.y }, direction: outDirection };
  }

  function trueShape(overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    return { radius: config.dropRadius, height: config.dropHeight };
  }

  // ---------------------------------------------------------------------------------------
  // What one drop buys, and what it costs
  // ---------------------------------------------------------------------------------------

  // Two numbers that together are the whole trade. The drop turns a sliver of sensor into a
  // wide view of the world, and the ratio of those two spans is exactly the factor by which
  // angular resolution is destroyed. A fisheye is not free; it is a compression.
  function opticalBudget(dropY, overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    const shape = trueShape(overrides);
    const entries = sampleEntries(dropY, shape, overrides);
    let minAngle = Infinity;
    let maxAngle = -Infinity;
    let usable = 0;
    for (const entryY of entries) {
      const ray = traceRay(entryY, dropY, shape, overrides);
      if (!ray) continue;
      usable += 1;
      const angle = Math.atan2(ray.direction.y, -ray.direction.x);
      minAngle = Math.min(minAngle, angle);
      maxAngle = Math.max(maxAngle, angle);
    }
    const worldSpan = usable > 1 ? (maxAngle - minAngle) * 180 / Math.PI : 0;
    // How much of the sensor the drop occupies, in degrees, as seen from the camera.
    const half = contactHalfWidth(shape);
    const sensorSpan = (
      Math.atan2(dropY + half - config.cameraY, config.cameraX)
      - Math.atan2(dropY - half - config.cameraY, config.cameraX)
    ) * 180 / Math.PI;
    return {
      dropY,
      usableSamples: usable,
      totalSamples: entries.length,
      worldFieldOfView: worldSpan,
      sensorFieldOfView: sensorSpan,
      // Degrees of world per sensor sample, against what the bare camera would deliver over
      // the same samples.
      worldDegreesPerSample: usable > 1 ? worldSpan / usable : 0,
      directDegreesPerSample: entries.length > 0 ? sensorSpan / entries.length : 0,
      angularCompression: sensorSpan > 0 ? worldSpan / sensorSpan : 0
    };
  }

  // ---------------------------------------------------------------------------------------
  // Triangulation
  // ---------------------------------------------------------------------------------------

  // Two rays in a plane. Unlike the 3-D case there is no closest-point-of-approach to take:
  // they meet exactly unless parallel, and how badly conditioned that meeting is IS the
  // baseline story, so it is reported rather than hidden behind a least-squares fit.
  function intersectRays(a, b) {
    const determinant = a.direction.x * (-b.direction.y) - a.direction.y * (-b.direction.x);
    if (Math.abs(determinant) < 1e-12) return null;
    const rx = b.origin.x - a.origin.x;
    const ry = b.origin.y - a.origin.y;
    const t = (rx * (-b.direction.y) - ry * (-b.direction.x)) / determinant;
    return {
      x: a.origin.x + t * a.direction.x,
      y: a.origin.y + t * a.direction.y,
      conditioning: Math.abs(determinant)
    };
  }

  // Which sample of this drop looks most nearly at the given world point. This stands in for
  // solving correspondence, which in practice is most of the work.
  function bestSample(dropY, target, overrides) {
    const shape = trueShape(overrides);
    const entries = sampleEntries(dropY, shape, overrides);
    let best = null;
    for (let k = 0; k < entries.length; k += 1) {
      const ray = traceRay(entries[k], dropY, shape, overrides);
      if (!ray) continue;
      const toTarget = { x: target.x - ray.origin.x, y: target.y - ray.origin.y };
      const along = dot(toTarget, ray.direction);
      if (along <= 0) continue;
      const perpendicular = Math.abs(toTarget.x * ray.direction.y - toTarget.y * ray.direction.x);
      if (!best || perpendicular < best.miss) {
        best = { index: k, entryY: entries[k], miss: perpendicular, ray };
      }
    }
    return best;
  }

  // Triangulate one world point from two drops, optionally believing a wrong drop shape.
  function triangulate(target, dropA, dropB, overrides, assumedShape) {
    const shape = assumedShape || trueShape(overrides);
    const a = bestSample(dropA, target, overrides);
    const b = bestSample(dropB, target, overrides);
    if (!a || !b) return null;
    // Re-trace the SAME sensor samples under the assumed shape. The camera did not move and
    // the pixels did not move; only the belief about the surface they look through changed.
    const rayA = traceRay(a.entryY, dropA, shape, overrides);
    const rayB = traceRay(b.entryY, dropB, shape, overrides);
    if (!rayA || !rayB) return null;
    const point = intersectRays(rayA, rayB);
    if (!point) return null;
    return {
      point,
      target,
      baseline: Math.abs(dropA - dropB),
      error: Math.hypot(point.x - target.x, point.y - target.y),
      depthError: Math.abs(point.x - target.x),
      conditioning: point.conditioning,
      sampleA: a.index,
      sampleB: b.index
    };
  }

  // ---------------------------------------------------------------------------------------
  // The two experiments
  // ---------------------------------------------------------------------------------------

  // Depth error against drop separation. Two drops nearly touching are a stereo rig with almost
  // no baseline, and no amount of care in the optics repairs that.
  function baselineSweep(target, overrides) {
    const config = Object.assign({}, DEFAULTS, overrides || {});
    // Every distinct pair, deduplicated by baseline so the sweep reads as one curve rather than
    // repeating whichever separations happen to occur more than once in the drop layout.
    const byBaseline = new Map();
    for (let i = 0; i < config.drops.length; i += 1) {
      for (let j = i + 1; j < config.drops.length; j += 1) {
        const result = triangulate(target, config.drops[i], config.drops[j], overrides);
        if (!result) continue;
        const key = result.baseline.toFixed(6);
        if (!byBaseline.has(key)) byBaseline.set(key, result);
      }
    }
    return Array.from(byBaseline.values()).sort((p, q) => p.baseline - q.baseline);
  }

  // THE measurement. Perturb the assumed drop radius by a relative amount and watch the
  // recovered depth move. The amplification is dimensionless: relative depth error per relative
  // shape error, so it can be quoted without reference to the scene scale.
  function shapeSensitivity(target, dropA, dropB, overrides, perturbations) {
    const steps = perturbations || [0.002, 0.005, 0.01, 0.02, 0.05];
    const base = trueShape(overrides);
    const reference = triangulate(target, dropA, dropB, overrides, base);
    const rows = [];
    for (const step of steps) {
      const shape = { radius: base.radius * (1 + step), height: base.height };
      const perturbed = triangulate(target, dropA, dropB, overrides, shape);
      if (!perturbed || !reference) continue;
      const relativeDepthError = Math.abs(perturbed.point.x - target.x) / Math.abs(target.x);
      rows.push({
        relativeShapeError: step,
        relativeDepthError,
        amplification: relativeDepthError / step,
        recovered: perturbed.point
      });
    }
    return { reference, rows };
  }

  return {
    DEFAULTS,
    normalize,
    dot,
    refract,
    intersectCircle,
    capCentreX,
    contactHalfWidth,
    trueShape,
    sampleEntries,
    traceRay,
    opticalBudget,
    intersectRays,
    bestSample,
    triangulate,
    baselineSweep,
    shapeSensitivity
  };
});
