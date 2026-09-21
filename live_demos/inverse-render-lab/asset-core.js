(function initAssetInverseCore(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AssetInverseCore = api;
})(typeof self !== "undefined" ? self : globalThis, () => {
  "use strict";

  const PARAMETER_META = [
    { key: "width", label: "mesh width", group: "geometry" },
    { key: "height", label: "mesh height", group: "geometry" },
    { key: "roundness", label: "profile", group: "geometry" },
    { key: "displacement", label: "displacement", group: "geometry" },
    { key: "normal", label: "normal detail", group: "geometry" },
    { key: "albedoR", label: "albedo R", group: "material" },
    { key: "albedoG", label: "albedo G", group: "material" },
    { key: "albedoB", label: "albedo B", group: "material" },
    { key: "roughness", label: "roughness", group: "material" },
    { key: "metalness", label: "metalness", group: "material" },
    { key: "lightAngle", label: "light azimuth", group: "lighting" },
    { key: "lightPower", label: "HDR intensity", group: "lighting" },
    { key: "microstructure", label: "microstructure", group: "microstructure" },
    // Anisotropy carries the lab's only DISCRETE identifiability failure. Every other exhibit
    // here is a continuous null direction that a local audit can see; these two cannot be seen
    // by any derivative-based diagnostic at all.
    { key: "aniso", label: "anisotropy", group: "material" },
    { key: "tangentAngle", label: "tangent angle", group: "material" }
  ];

  // The last two entries are anisotropy and tangent angle. 0.5 and 0 mean isotropic with an
  // unrotated frame, so the three original models render exactly as they did before.
  const MODEL_META = {
    ggx: {
      label: "GGX baseline",
      short: "continuous NDF",
      target: [0.74, 0.82, 0.57, 0.49, 0.42, 0.22, 0.62, 0.78, 0.38, 0.18, 0.69, 0.66, 0.2, 0.5, 0]
    },
    glint: {
      label: "Discrete glints",
      short: "P-NDF / stochastic facets",
      target: [0.76, 0.84, 0.62, 0.55, 0.48, 0.24, 0.58, 0.74, 0.2, 0.72, 0.73, 0.7, 0.78, 0.5, 0]
    },
    granular: {
      label: "Granular aggregate",
      short: "grain to bulk transport",
      target: [0.78, 0.8, 0.5, 0.68, 0.7, 0.82, 0.55, 0.2, 0.66, 0.04, 0.62, 0.78, 0.74, 0.5, 0]
    },
    aniso: {
      label: "Brushed anisotropic",
      short: "stretched lobe, ambiguous frame",
      target: [0.75, 0.8, 0.55, 0.4, 0.35, 0.66, 0.68, 0.72, 0.3, 0.88, 0.66, 0.72, 0.2, 0.86, 0.62]
    }
  };

  const INITIAL = [0.43, 0.58, 0.18, 0.08, 0.12, 0.58, 0.24, 0.2, 0.78, 0.08, 0.24, 0.38, 0.12, 0.5, 0.1];
  const SCOPE_INDICES = {
    geometry: [0, 1, 2, 3, 4],
    pbr: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    // micro frees the anisotropy magnitude but pins the frame: alpha_x and alpha_y are
    // identifiable from the highlight's aspect, the tangent direction is not.
    micro: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13],
    joint: PARAMETER_META.map((_, index) => index)
  };

  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const fract = (value) => value - Math.floor(value);
  const smoothstep = (a, b, value) => {
    const span = Math.abs(b - a) < 1e-8 ? 1e-8 : b - a;
    const t = clamp01((value - a) / span);
    return t * t * (3 - 2 * t);
  };
  const hash2 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);

  function normalize3(x, y, z) {
    const inv = 1 / Math.max(1e-8, Math.hypot(x, y, z));
    return [x * inv, y * inv, z * inv];
  }

  function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function decodedParameters(params) {
    return {
      width: 0.61 + params[0] * 0.28,
      height: 0.64 + params[1] * 0.3,
      exponent: 1.55 + params[2] * 3.35,
      displacement: params[3] * 0.17,
      normalStrength: params[4] * 0.48,
      albedo: [0.06 + params[5] * 0.86, 0.06 + params[6] * 0.86, 0.06 + params[7] * 0.86],
      roughness: 0.045 + params[8] * 0.62,
      metalness: params[9] * 0.92,
      lightAngle: -1.25 + params[10] * 2.5,
      lightPower: 0.42 + params[11] * 1.25,
      microstructure: 0.04 + params[12] * 0.96,
      // 0.5 maps to zero anisotropy, at which the anisotropic NDF reduces algebraically to the
      // isotropic GGX the other three models use. That keeps this addition non-breaking.
      aniso: ((params[13] === undefined ? 0.5 : params[13]) - 0.5) * 1.8,
      tangentAngle: (params[14] === undefined ? 0 : params[14]) * Math.PI
    };
  }

  // Smith height-correlated visibility, V = G2 / (4 ndotl ndotv).
  //
  // Replaces a Cook-Torrance V-cavity masking term that was paired with a GGX distribution --
  // a known-inconsistent combination, since the two are derived from different microsurface
  // models. Smith is the one GGX is actually built on.
  function smithVisibility(ndotv, ndotl, alpha) {
    const a2 = alpha * alpha;
    const v = Math.max(0.03, ndotv);
    const l = Math.max(0.03, ndotl);
    const lambdaV = l * Math.sqrt(v * v * (1 - a2) + a2);
    const lambdaL = v * Math.sqrt(l * l * (1 - a2) + a2);
    return 0.5 / Math.max(1e-4, lambdaV + lambdaL);
  }

  function smithG1(cosTheta, alpha) {
    const a2 = alpha * alpha;
    const c = Math.max(1e-4, cosTheta);
    return 2 * c / Math.max(1e-6, c + Math.sqrt(a2 + (1 - a2) * c * c));
  }

  // Directional albedo of the SINGLE-scattering GGX lobe with F = 1. A microfacet lobe loses
  // energy as roughness rises -- roughly 60% of it at alpha = 1 -- because paths that would
  // have bounced a second time between facets are simply dropped. Tabulated once by
  // VNDF sampling, which is the estimator this integral is designed for.
  const ENERGY_LUT_SIZE = 16;
  let energyLut = null;

  function sampleGgxVndf(viewX, viewZ, alpha, u1, u2) {
    // View is in the x-z plane by construction here, which is all the isotropic table needs.
    const vhx = alpha * viewX;
    const vhz = viewZ;
    const inv = 1 / Math.max(1e-8, Math.hypot(vhx, vhz));
    const nx = vhx * inv;
    const nz = vhz * inv;
    const r = Math.sqrt(u1);
    const phi = 2 * Math.PI * u2;
    const t1 = r * Math.cos(phi);
    let t2 = r * Math.sin(phi);
    const s = 0.5 * (1 + nz);
    t2 = (1 - s) * Math.sqrt(Math.max(0, 1 - t1 * t1)) + s * t2;
    const nhZ = Math.sqrt(Math.max(0, 1 - t1 * t1 - t2 * t2));
    // Rebuild in the stretched frame, then unstretch.
    const hx = alpha * (t1 * nz + nhZ * nx);
    const hz = Math.max(1e-4, -t1 * nx + nhZ * nz);
    const hlen = Math.hypot(hx, hz);
    return { x: hx / hlen, z: hz / hlen };
  }

  function buildEnergyLut() {
    const lut = new Float64Array(ENERGY_LUT_SIZE * ENERGY_LUT_SIZE);
    for (let ai = 0; ai < ENERGY_LUT_SIZE; ai += 1) {
      const alpha = Math.max(0.02, (ai + 0.5) / ENERGY_LUT_SIZE);
      for (let ci = 0; ci < ENERGY_LUT_SIZE; ci += 1) {
        const cosTheta = Math.max(0.02, (ci + 0.5) / ENERGY_LUT_SIZE);
        const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
        let total = 0;
        const samples = 128;
        for (let s = 0; s < samples; s += 1) {
          // Deterministic low-discrepancy pair keeps the table reproducible run to run.
          const u1 = (s + 0.5) / samples;
          const u2 = fract(s * 0.61803398875 + 0.5);
          const h = sampleGgxVndf(sinTheta, cosTheta, alpha, u1, u2);
          const vdoth = sinTheta * h.x + cosTheta * h.z;
          const lz = 2 * vdoth * h.z - cosTheta;
          if (lz <= 0) continue;
          total += smithVisibility(cosTheta, lz, alpha) * 4 * cosTheta * lz / Math.max(1e-6, smithG1(cosTheta, alpha));
        }
        lut[ai * ENERGY_LUT_SIZE + ci] = Math.min(1, total / samples);
      }
    }
    return lut;
  }

  function singleScatterAlbedo(cosTheta, alpha) {
    if (!energyLut) energyLut = buildEnergyLut();
    // Table coordinates run over [0, SIZE-1], not [0, 1]. Clamping these to the unit interval
    // pinned every lookup to the same cell, so the albedo came back constant in roughness --
    // which silently disabled the whole compensation.
    const span = ENERGY_LUT_SIZE - 1;
    const a = Math.min(span, Math.max(0, alpha * ENERGY_LUT_SIZE - 0.5));
    const c = Math.min(span, Math.max(0, cosTheta * ENERGY_LUT_SIZE - 0.5));
    const ai = Math.min(ENERGY_LUT_SIZE - 2, Math.floor(a));
    const ci = Math.min(ENERGY_LUT_SIZE - 2, Math.floor(c));
    const af = clamp01(a - ai);
    const cf = clamp01(c - ci);
    const at = (index) => energyLut[index * ENERGY_LUT_SIZE + ci] * (1 - cf) + energyLut[index * ENERGY_LUT_SIZE + ci + 1] * cf;
    return Math.max(1e-3, at(ai) * (1 - af) + at(ai + 1) * af);
  }

  // Turquin's bare-bones compensation: scale the single-scattering lobe so the lost energy is
  // returned. It is NOT derived -- it is a shape-matched rescaling based on the observation
  // that secondary lobes resemble scaled copies of the primary. It restores the energy without
  // reproducing the true multiple-scatter angular distribution, and the panel says so.
  function energyCompensation(cosTheta, alpha, f0) {
    const e = singleScatterAlbedo(cosTheta, alpha);
    return 1 + f0 * (1 - e) / Math.max(1e-3, e);
  }

  // White furnace: with F = 1 and a uniform environment, a lossless BRDF integrates to 1.
  //
  // Honest framing, because it is easy to write a vacuous version of this test. At F0 = 1
  // Turquin's factor is exactly 1/E, so the compensated integral is 1 BY CONSTRUCTION and
  // asserting it proves nothing about the tabulated albedo. What is worth checking is the
  // uncompensated deficit: that it is large, and that it grows with roughness, which is a real
  // property of the single-scattering lobe and depends on the table being right.
  function whiteFurnaceError(alpha) {
    let worst = 0;
    for (let ci = 1; ci <= 12; ci += 1) {
      worst = Math.max(worst, 1 - singleScatterAlbedo(ci / 13, alpha));
    }
    return worst;
  }

  // Orthonormal tangent frame around the shading normal, rotated by tangentAngle. The tangent
  // enters the NDF through its AXIS, not its direction, which is the source of the sign
  // ambiguity this model exists to show.
  function tangentFrame(normal, angle) {
    const reference = Math.abs(normal[2]) < 0.999 ? [0, 0, 1] : [1, 0, 0];
    let tx = reference[1] * normal[2] - reference[2] * normal[1];
    let ty = reference[2] * normal[0] - reference[0] * normal[2];
    let tz = reference[0] * normal[1] - reference[1] * normal[0];
    const inv = 1 / Math.max(1e-8, Math.hypot(tx, ty, tz));
    tx *= inv; ty *= inv; tz *= inv;
    const bx = normal[1] * tz - normal[2] * ty;
    const by = normal[2] * tx - normal[0] * tz;
    const bz = normal[0] * ty - normal[1] * tx;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    return {
      tangent: [tx * ca + bx * sa, ty * ca + by * sa, tz * ca + bz * sa],
      bitangent: [-tx * sa + bx * ca, -ty * sa + by * ca, -tz * sa + bz * ca]
    };
  }

  function discreteFacetResponse(u, v, halfVector, roughness, strength, frequency = 28) {
    const gridX = (u + 3.2) * frequency;
    const gridY = (v + 2.4) * frequency;
    const cellX = Math.floor(gridX);
    const cellY = Math.floor(gridY);
    let response = 0;
    const sigma = 0.014 + roughness * 0.06;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const hx = cellX + ox;
        const hy = cellY + oy;
        const selector = hash2(hx - 7, hy + 13);
        if (selector < 0.5) continue;
        const slopeX = (hash2(hx, hy) - 0.5) * (0.42 + roughness * 0.9);
        const slopeY = (hash2(hx + 41, hy - 19) - 0.5) * (0.42 + roughness * 0.9);
        const facet = normalize3(slopeX, slopeY, 1);
        const mismatch = Math.max(0, 1 - dot3(facet, halfVector));
        const dx = gridX - (hx + 0.5);
        const dy = gridY - (hy + 0.5);
        const footprint = Math.exp(-(dx * dx + dy * dy) / 0.42);
        const occupancy = 0.58 + (selector - 0.5) * 1.5;
        response += occupancy * footprint * Math.exp(-mismatch / sigma);
      }
    }
    return response * strength * 0.46;
  }

  function granularResponse(u, v, normal, light, view, roughness, strength) {
    const grain = 0.68 + 0.5 * hash2(Math.floor(u * 42), Math.floor(v * 42));
    const retro = Math.pow(Math.max(0, dot3(light, view)), 3 + roughness * 5);
    const grazing = Math.pow(1 - Math.max(0, normal[2]), 1.6);
    const single = grain * (0.12 + 0.34 * retro) * strength;
    const bulk = (0.12 + 0.24 * grazing) * (0.35 + strength * 0.65);
    return single + bulk;
  }

  // Silhouette families. The solid is an implicit superquadric, so a shape is one multiplier on
  // its radius as a function of polar angle -- cheap, and it leaves every material parameter
  // meaning exactly what it meant before.
  const SHAPE_META = {
    superellipse: { label: "Superellipse", short: "the original rounded solid", lobes: 0, amount: 0, twist: 0 },
    seastar: { label: "Sea star", short: "five arms", lobes: 5, amount: 0.3, twist: 0 },
    spiral: { label: "Spiral", short: "arms winding with radius", lobes: 3, amount: 0.22, twist: 3.1 },
    bloom: { label: "Bloom", short: "eight soft petals", lobes: 8, amount: 0.13, twist: 0 },
    clover: { label: "Clover", short: "four deep lobes", lobes: 4, amount: 0.26, twist: 0 },
    durian: { label: "Durian", short: "spined relief, waxy rind and pore normals", detailed: true },
    rose: { label: "Rose", short: "overlapping petal surfaces, pigment and vein normals", detailed: true }
  };

  // These are compact procedural height surfaces, not imported meshes. Each visible sample
  // carries depth, a geometric normal, pigment and roughness into the SAME forward operator
  // used by the inverse. Petal overlap is resolved by frontmost depth; no painted overlays.
  const ROSE_PETALS = [];
  for (const [ring, count, radius, length, breadth, lift] of [
    [0, 5, 0.48, 0.43, 0.44, 0.11],
    [1, 7, 0.36, 0.30, 0.33, 0.31],
    [2, 6, 0.225, 0.24, 0.23, 0.52],
    [3, 5, 0.12, 0.17, 0.145, 0.69],
    [4, 3, 0.04, 0.12, 0.08, 0.83]
  ]) {
    for (let index = 0; index < count; index += 1) {
      const angle = index * Math.PI * 2 / count + ring * 1.13;
      ROSE_PETALS.push({ ring, index, c: Math.cos(angle), s: Math.sin(angle), radius, length, breadth, lift });
    }
  }

  function detailedSurface(p, shape, x, y, viewAngle) {
    // View azimuth rotates the material/surface chart; it is not a perspective mesh camera.
    const rotation = viewAngle * 0.24;
    const ca = Math.cos(rotation), sa = Math.sin(rotation);
    const nx = x / p.width, ny = y / p.height;
    const u = nx * ca - ny * sa, v = nx * sa + ny * ca;
    let mask = 0, depth = 0, du = 0, dv = 0, pigment = 1, roughness = 1, microU = u, microV = v;
    if (shape === "durian") {
      const angle = Math.atan2(v, u);
      const spineCosine = Math.max(0, Math.cos(angle * 35));
      const silhouetteSpine = Math.pow(spineCosine, 5);
      const radialSquared = u * u + v * v;
      const edgeWeight = Math.min(1, radialSquared ** 6);
      const edgeDerivative = radialSquared < 1 ? 12 * radialSquared ** 5 : 0;
      const rimHeight = 0.025 + p.displacement * 0.3;
      const radius = 0.915 + p.exponent * 0.008 + rimHeight * silhouetteSpine * edgeWeight;
      const q = radialSquared / (radius * radius);
      const angularDerivative = -175 * spineCosine ** 4 * Math.sin(angle * 35);
      const drU = rimHeight * (silhouetteSpine * edgeDerivative * u - angularDerivative * edgeWeight * v / Math.max(1e-8, radialSquared));
      const drV = rimHeight * (silhouetteSpine * edgeDerivative * v + angularDerivative * edgeWeight * u / Math.max(1e-8, radialSquared));
      const dqU = 2 * u / (radius * radius) - 2 * radialSquared * drU / radius ** 3;
      const dqV = 2 * v / (radius * radius) - 2 * radialSquared * drV / radius ** 3;
      mask = smoothstep(1.016, 0.984, q);
      if (mask < 0.0005) return null;
      const z = Math.sqrt(Math.max(0.002, 1 - Math.min(0.998, q)));
      // Staggered triangular rows produce conical rind spines. Their height and slopes use
      // the same displacement coefficient, while the finer pores remain a normal map.
      const row = Math.round(v * 8.5);
      let a = 0, b = 0, nearest = Infinity;
      for (let offset = -1; offset <= 1; offset += 1) {
        const line = row + offset;
        const cell = Math.round(u * 8.5 - (line & 1) * 0.5);
        const centerU = (cell + (line & 1) * 0.5 + Math.sin(cell * 7 + line * 13) * 0.055) / 8.5;
        const centerV = (line + Math.cos(cell * 9 - line * 11) * 0.045) / 8.5;
        const dx = (u - centerU) * 8.5, dy = (v - centerV) * 8.5;
        const distance = dx * dx + dy * dy;
        if (distance < nearest) { nearest = distance; a = dx; b = dy; }
      }
      const r = Math.max(0.001, Math.hypot(a, b));
      const cone = Math.max(0, 1 - r / 0.7);
      const taper = Math.max(0, 1 - q);
      const amplitude = 0.022 + p.displacement * 0.68;
      depth = z * 0.72 + amplitude * cone * taper;
      const slope = cone > 0 ? -amplitude * taper * 8.5 / (0.7 * r) : 0;
      du = -0.36 * dqU / z + slope * a - amplitude * cone * dqU;
      dv = -0.36 * dqV / z + slope * b - amplitude * cone * dqV;
      const pore = Math.sin(u * 133 + Math.sin(v * 49)) * Math.cos(v * 121 - u * 15);
      const seam = Math.pow(Math.abs(Math.sin(Math.atan2(v, u) * 2.5)), 24);
      pigment = (0.56 + cone * 0.48) * (1 - seam * 0.22) + pore * 0.035;
      roughness = 0.78 + 0.45 * (1 - cone);
      microU = u * 3.5; microV = v * 3.5;
    } else {
      const opening = 0.9 + (p.exponent - 1.55) / 3.35 * 0.18;
      for (const petal of ROSE_PETALS) {
        const radial = u * petal.c + v * petal.s;
        const across = -u * petal.s + v * petal.c;
        const a = (radial - petal.radius * opening) / petal.length;
        const b = (across + (radial - petal.radius * opening) * 0.42) / petal.breadth;
        const q = a * a + b * b;
        if (q >= 1.02) continue;
        const cover = smoothstep(1.02, 0.985, q);
        const edge = Math.sqrt(Math.max(0.006, 1 - Math.min(0.994, q)));
        const curl = (0.035 + p.displacement * 0.92);
        const dome = Math.sqrt(Math.max(0.03, 1 - (u * u + v * v) * 0.85));
        const petalDepth = petal.lift * 0.7 + dome * 0.58 + 0.12 * edge + curl * (a * a + b * b * 0.55) - radial * 0.06;
        if (cover <= 0.0005 || (mask > 0 && petalDepth < depth)) continue;
        mask = cover; depth = petalDepth;
        const da = -0.12 * a / edge + curl * 2 * a;
        const db = -0.12 * b / edge + curl * 1.1 * b;
        du = da / petal.length * petal.c + db / petal.breadth * (-petal.s + petal.c * 0.42) - 0.06 * petal.c - 0.58 * 0.85 * u / dome;
        dv = da / petal.length * petal.s + db / petal.breadth * (petal.c + petal.s * 0.42) - 0.06 * petal.s - 0.58 * 0.85 * v / dome;
        const vein = Math.sin(b * 44 + a * 5 + Math.sin(a * 9));
        pigment = 0.28 + 0.45 * edge + 0.18 * (a + 1) * 0.5 + vein * 0.026;
        roughness = 0.86 + 0.22 * (1 - edge);
        microU = a * 0.5; microV = b * 1.6;
      }
      if (!mask) return null;
    }
    const bumpU = p.normalStrength * Math.cos(microU * 37 + Math.sin(microV * 13)) * 0.22;
    const bumpV = p.normalStrength * Math.sin(microV * 71 + microU * 9) * 0.15;
    const gx = ((du + bumpU) * ca + (dv + bumpV) * sa) / p.width;
    const gy = (-(du + bumpU) * sa + (dv + bumpV) * ca) / p.height;
    return { mask, depth, normal: normalize3(-gx, -gy, 1), pigment, roughness, u: microU, v: microV };
  }

  function targetParameters(model, shape) {
    const target = MODEL_META[model].target.slice();
    if (shape === "durian") {
      target.splice(0, 10, 0.73, 0.84, 0.42, 0.79, 0.64, 0.54, 0.66, 0.14, 0.46, 0.04);
    } else if (shape === "rose") {
      target.splice(0, 10, 0.84, 0.76, 0.44, 0.74, 0.54, 0.88, 0.005, 0.05, 0.61, 0.015);
    }
    return target;
  }

  function shapeScale(shape, x, y, p, rawQ) {
    const meta = SHAPE_META[shape];
    if (!meta || !meta.lobes) return 1;
    const theta = Math.atan2(y / p.height, x / p.width);
    // Radius in the superquadric's own metric, so a twist winds with distance from the centre
    // rather than with raw pixel position.
    const radius = Math.pow(Math.max(1e-6, rawQ), 1 / p.exponent);
    // Carve inward rather than bulge outward: the multiplier peaks at exactly 1, so a lobed
    // shape stays inside the plain solid's silhouette instead of growing arms past the frame
    // and being clipped by it.
    return 1 - meta.amount * (1 - Math.cos(meta.lobes * theta + meta.twist * radius));
  }

  function renderPixel(params, model, x, y, viewAngle = 0, facetFrequency = 28, shape = "superellipse") {
    const p = decodedParameters(params);
    const detailed = SHAPE_META[shape]?.detailed ? detailedSurface(p, shape, x, y, viewAngle) : null;
    if (SHAPE_META[shape]?.detailed && !detailed) {
      const horizon = clamp01(0.5 + y * 0.5);
      return { rgb: [0.025 + horizon * 0.018, 0.032 + horizon * 0.021, 0.04 + horizon * 0.028], mask: 0, depth: 0, normal: [0, 0, 1] };
    }
    if (detailed) p.roughness = Math.min(0.9, p.roughness * detailed.roughness);
    const ax = Math.abs(x / p.width);
    const ay = Math.abs(y / p.height);
    const rawQ = Math.pow(ax, p.exponent) + Math.pow(ay, p.exponent);
    // superellipse scales by exactly 1, so the default solid is bit-for-bit what it was before
    // shapes existed and every locked expectation in asset-core-test.js still holds.
    const lobe = shapeScale(shape, x, y, p, rawQ);
    const baseQ = lobe === 1 ? rawQ : rawQ / Math.pow(lobe, p.exponent);
    const phi = Math.atan2(x / p.width, Math.sqrt(Math.max(0.001, 1 - Math.min(0.999, baseQ)))) + viewAngle;
    const reliefWave = Math.sin(phi * 5.2 + 0.7) * Math.sin(y * 7.1 - 0.4)
      + 0.45 * Math.sin(phi * 11.3 - y * 4.2);
    const q = baseQ - p.displacement * reliefWave * 0.16 * Math.max(0, 1 - ay);
    const mask = detailed ? detailed.mask : smoothstep(0.035, -0.035, q - 1);
    if (mask < 0.0005) {
      const horizon = clamp01(0.5 + y * 0.5);
      return { rgb: [0.025 + horizon * 0.018, 0.032 + horizon * 0.021, 0.04 + horizon * 0.028], mask: 0, depth: 0, normal: [0, 0, 1] };
    }

    const z = Math.sqrt(Math.max(0.002, 1 - Math.min(0.998, baseQ)));
    const bumpX = p.normalStrength * (0.65 * Math.cos(phi * 8.1 + y * 3.2) + 0.35 * Math.cos(phi * 17.4));
    const bumpY = p.normalStrength * (0.58 * Math.sin(y * 11.2 - phi * 2.7) + 0.22 * Math.sin(phi * 13.2));
    // Displacement must tilt the shading normal, not only move the silhouette.
    //
    // It previously entered `q` alone, so it changed the mask and the depth and nothing else,
    // while the two bump waves changed the shading and nothing else. The two "geometry detail"
    // parameters were therefore observed through disjoint channels, which is not how a height
    // field behaves and made the detail ablation measure an artifact rather than a degeneracy.
    //
    // Differentiating the same reliefWave the mask uses restores the coupling: displacement,
    // normal detail and roughness now genuinely compete to explain the same shading, which is
    // the real inverse-rendering situation.
    const reliefDPhi = 5.2 * Math.cos(phi * 5.2 + 0.7) * Math.sin(y * 7.1 - 0.4)
      + 0.45 * 11.3 * Math.cos(phi * 11.3 - y * 4.2);
    const reliefDY = 7.1 * Math.sin(phi * 5.2 + 0.7) * Math.cos(y * 7.1 - 0.4)
      - 0.45 * 4.2 * Math.cos(phi * 11.3 - y * 4.2);
    const reliefScale = p.displacement * 0.16 * Math.max(0, 1 - ay);
    const normal = detailed ? detailed.normal : normalize3(
      x / (p.width * p.width) + bumpX * 0.24 - reliefScale * reliefDPhi * 0.24,
      y / (p.height * p.height) + bumpY * 0.24 - reliefScale * reliefDY * 0.24,
      z * 1.5
    );

    const relativeLight = p.lightAngle - viewAngle;
    const light = normalize3(Math.sin(relativeLight), 0.38, Math.cos(relativeLight));
    const view = [0, 0, 1];
    const halfVector = normalize3(light[0] + view[0], light[1] + view[1], light[2] + view[2]);
    const ndotl = Math.max(0, dot3(normal, light));
    const ndotv = Math.max(0.03, normal[2]);
    const ndoth = Math.max(0, dot3(normal, halfVector));
    const alpha = Math.max(0.035, p.roughness * p.roughness);
    const alpha2 = alpha * alpha;
    let distribution;
    if (model === "aniso") {
      // D(h) = 1 / (pi ax ay ((th/ax)^2 + (bh/ay)^2 + nh^2)^2)
      //
      // At ax = ay this is algebraically identical to the isotropic GGX below, because
      // th^2 + bh^2 + nh^2 = 1 on an orthonormal frame. The test asserts that identity.
      // Log-symmetric stretch, so that negating the anisotropy EXCHANGES the two widths:
      //   alphaX = alpha e^k,  alphaY = alpha e^-k   =>   k -> -k swaps them exactly.
      // A (1 + a) / (1 / (1 + a)) pairing looks equivalent but is not -- a -> -a does not
      // exchange those, so the 90-degree branch would only be approximate and the exhibit
      // would be claiming an exact symmetry it does not have.
      const stretch = Math.exp(p.aniso);
      const alphaX = alpha * stretch;
      const alphaY = alpha / stretch;
      const frame = tangentFrame(normal, p.tangentAngle);
      // ndoth is clamped at zero above, so the raw tangential components would no longer
      // satisfy th^2 + bh^2 + ndoth^2 = 1 for half-vectors below the horizon -- and the
      // isotropic reduction would fail exactly there. Rescale the tangential part to match the
      // clamped normal component, preserving azimuth.
      const tangential = Math.sqrt(Math.max(0, 1 - ndoth * ndoth));
      const rawT = dot3(halfVector, frame.tangent);
      const rawB = dot3(halfVector, frame.bitangent);
      const rawLength = Math.hypot(rawT, rawB);
      const rescale = rawLength > 1e-9 ? tangential / rawLength : 0;
      const th = rawT * rescale;
      const bh = rawB * rescale;
      const quadratic = (th / alphaX) ** 2 + (bh / alphaY) ** 2 + ndoth * ndoth;
      const denominator = Math.PI * alphaX * alphaY * quadratic * quadratic;
      // The isotropic branch below floors its denominator at 0.001, which binds at near-normal
      // incidence -- at alpha = 0.053 the true denominator there is 2.6e-5, so the peak lobe is
      // capped. That floor is inherited, not chosen, and the equivalent floor here is 0.001 /
      // alpha^2 because the two denominators differ by exactly that factor. Matching it is what
      // makes the reduction identity hold at the specular peak as well as away from it.
      distribution = 1 / Math.max(0.001 / alpha2, denominator);
    } else {
      const denom = Math.PI * Math.pow(ndoth * ndoth * (alpha2 - 1) + 1, 2);
      distribution = alpha2 / Math.max(0.001, denom);
    }
    const fresnelBase = 0.04 * (1 - p.metalness) + p.metalness * (p.albedo[0] + p.albedo[1] + p.albedo[2]) / 3;
    const fresnel = fresnelBase + (1 - fresnelBase) * Math.pow(1 - Math.max(0, dot3(halfVector, view)), 5);
    const visibility = smithVisibility(ndotv, ndotl, alpha);
    // Energy compensation returns what single-scattering GGX drops. Without it a rough lobe is
    // measurably dark, and stacking two lossy lobes would compound two unrelated errors -- so a
    // furnace failure anywhere downstream would be unattributable.
    const compensation = energyCompensation(ndotv, alpha, fresnelBase);
    let specular = Math.min(3.2, distribution * fresnel * visibility * compensation);

    if (model === "glint") {
      specular += discreteFacetResponse(phi, y, halfVector, p.roughness, p.microstructure, facetFrequency);
    } else if (model === "granular") {
      specular *= 0.28;
      specular += granularResponse(phi, y, normal, light, view, p.roughness, p.microstructure);
    }

    const stripe = detailed ? detailed.pigment : 0.78 + 0.22 * Math.sin(phi * 2.1 + y * 2.4 + 0.5);
    const patina = detailed ? 1 : 0.9 + 0.1 * hash2(Math.floor((phi + 3.2) * 12), Math.floor((y + 1.1) * 18));
    const diffuseScale = (0.12 + ndotl * 0.88) * (1 - p.metalness * 0.82);
    const rim = Math.pow(1 - ndotv, 2.2) * 0.18;
    const depth = (detailed ? detailed.depth : 0.2 + 0.8 * z + p.displacement * reliefWave * 0.16) * mask;
    const rgb = p.albedo.map((channel, channelIndex) => {
      const metalTint = specular * ((1 - p.metalness) + p.metalness * channel);
      const env = [0.035, 0.045, 0.06][channelIndex];
      const shaded = env + p.lightPower * (channel * stripe * patina * diffuseScale + metalTint + rim * channel);
      return clamp01(shaded * mask + (1 - mask) * env);
    });
    return { rgb, mask, depth, normal };
  }

  function viewAngles(viewCount) {
    const count = Math.max(1, Number(viewCount) || 12);
    return Array.from({ length: count }, (_, index) => -Math.PI + Math.PI * 2 * index / count);
  }

  function sampleLoss(params, target, model, viewCount, workResolution, iteration = 0, shape = "superellipse") {
    const angles = viewAngles(viewCount);
    const maxViews = Math.min(8, angles.length);
    const stride = Math.max(1, Math.floor(angles.length / maxViews));
    const offset = angles.length > maxViews ? iteration % stride : 0;
    const resolution = Math.max(8, Math.min(30, workResolution || 18));
    let loss = 0;
    let count = 0;
    for (let viewIndex = offset; viewIndex < angles.length && count < maxViews * resolution * resolution; viewIndex += stride) {
      const angle = angles[viewIndex % angles.length];
      for (let iy = 0; iy < resolution; iy += 1) {
        const y = -1 + 2 * (iy + 0.5) / resolution;
        for (let ix = 0; ix < resolution; ix += 1) {
          const x = -1 + 2 * (ix + 0.5) / resolution;
          const prediction = renderPixel(params, model, x, y, angle, 28, shape);
          const reference = renderPixel(target, model, x, y, angle, 28, shape);
          const dr = prediction.rgb[0] - reference.rgb[0];
          const dg = prediction.rgb[1] - reference.rgb[1];
          const db = prediction.rgb[2] - reference.rgb[2];
          const dm = prediction.mask - reference.mask;
          const dd = prediction.depth - reference.depth;
          loss += 0.56 * (dr * dr + dg * dg + db * db) / 3 + 1.15 * dm * dm + 0.22 * dd * dd;
          count += 1;
        }
      }
    }
    return loss / Math.max(1, count);
  }

  function activeIndices(scope) {
    return SCOPE_INDICES[scope] || SCOPE_INDICES.joint;
  }

  function createSolver(options = {}) {
    const model = MODEL_META[options.model] ? options.model : "glint";
    const shape = SHAPE_META[options.shape] ? options.shape : "superellipse";
    const scope = SCOPE_INDICES[options.scope] ? options.scope : "joint";
    const params = INITIAL.slice();
    if (SHAPE_META[shape]?.detailed) {
      // A shared neutral-size starting specimen, independent of the generating parameters.
      // A tiny collapsed petal cluster otherwise starts on a different visibility branch.
      params[0] = 0.62; params[1] = 0.66; params[3] = 0.35;
    }
    const target = targetParameters(model, shape);
    if (scope !== "joint") {
      params[10] = MODEL_META[model].target[10];
      params[11] = MODEL_META[model].target[11];
    }
    return {
      model,
      shape,
      scope,
      viewCount: Math.max(1, Number(options.viewCount) || 12),
      workResolution: Math.max(8, Number(options.workResolution) || 18),
      params,
      target,
      m: new Float64Array(PARAMETER_META.length),
      v: new Float64Array(PARAMETER_META.length),
      iteration: 0,
      loss: sampleLoss(params, target, model, options.viewCount || 12, options.workResolution || 18, 0, shape),
      history: [],
      learningRate: Number(options.learningRate) || 0.028
    };
  }

  function stepSolver(state, steps = 1) {
    const indices = activeIndices(state.scope);
    for (let step = 0; step < steps; step += 1) {
      const epsilon = state.model === "glint" ? 0.012 : 0.009;
      const gradients = new Float64Array(PARAMETER_META.length);
      for (const index of indices) {
        const original = state.params[index];
        state.params[index] = clamp01(original + epsilon);
        const positive = sampleLoss(state.params, state.target, state.model, state.viewCount, state.workResolution, state.iteration, state.shape);
        state.params[index] = clamp01(original - epsilon);
        const negative = sampleLoss(state.params, state.target, state.model, state.viewCount, state.workResolution, state.iteration, state.shape);
        state.params[index] = original;
        gradients[index] = (positive - negative) / (2 * epsilon);
      }

      state.iteration += 1;
      const beta1 = 0.9;
      const beta2 = 0.985;
      const lr = state.learningRate * (0.35 + 0.65 / Math.sqrt(1 + state.iteration * 0.012));
      for (const index of indices) {
        const gradient = Math.max(-1.4, Math.min(1.4, gradients[index]));
        state.m[index] = beta1 * state.m[index] + (1 - beta1) * gradient;
        state.v[index] = beta2 * state.v[index] + (1 - beta2) * gradient * gradient;
        const mHat = state.m[index] / (1 - Math.pow(beta1, state.iteration));
        const vHat = state.v[index] / (1 - Math.pow(beta2, state.iteration));
        state.params[index] = clamp01(state.params[index] - lr * mHat / (Math.sqrt(vHat) + 1e-6));
      }
      state.loss = sampleLoss(state.params, state.target, state.model, state.viewCount, state.workResolution, state.iteration, state.shape);
      state.history.push(state.loss);
      if (state.history.length > 180) state.history.shift();
    }
    return snapshot(state);
  }

  function groupErrors(params, target) {
    const result = {};
    for (const group of ["geometry", "material", "lighting", "microstructure"]) {
      const indices = PARAMETER_META.map((meta, index) => meta.group === group ? index : -1).filter((index) => index >= 0);
      const mse = indices.reduce((sum, index) => sum + Math.pow(params[index] - target[index], 2), 0) / Math.max(1, indices.length);
      result[group] = Math.sqrt(mse);
    }
    return result;
  }

  // Column norms of a central finite-difference Jacobian at the current parameter vector.
  // It answers "which measurement channel currently constrains which factor" from the
  // forward model itself, rather than from a table of assumed answers.
  //
  // Restricted to INTERIOR samples -- pixels fully covered in both perturbed renders. That
  // restriction is not a convenience, it is a correctness requirement. The coverage mask is
  // smoothstep(0.035, -0.035, q - 1), a band far narrower than any grid this lab can afford,
  // so a per-pixel difference of the mask channel is pure aliasing: sweeping the sampling
  // resolution for `mesh width` gives 0.00 at 12, 2.16 at 16, 0.46 at 20, 3.48 at 28, and it
  // is still oscillating at 128. The silhouette derivative is a boundary integral and needs a
  // boundary estimator -- see the Differentiation workspace, which implements four of them.
  // What this function reports instead is the fraction of samples that changed coverage, so
  // the undefined part of the derivative is visible rather than silently averaged in.
  //
  // Everything here is LOCAL and FIRST-ORDER. It is blind to discrete branches and to
  // multimodality: a parameter can score high and still be globally unidentifiable. It also
  // says nothing about correlation -- two factors can each be strongly observed and still be
  // observed only in combination.
  function sensitivityMatrix(params, model, options = {}) {
    const angles = viewAngles(options.viewCount || 12);
    const maxViews = Math.max(1, Math.min(3, angles.length));
    const stride = Math.max(1, Math.floor(angles.length / maxViews));
    const resolution = Math.max(12, Math.min(32, options.resolution || 18));
    const step = 0.012;
    const raw = PARAMETER_META.map(() => ({ rgb: 0, depth: 0, interior: 0, boundary: 0, total: 0 }));
    for (let index = 0; index < PARAMETER_META.length; index += 1) {
      const lo = params.slice();
      const hi = params.slice();
      lo[index] = clamp01(params[index] - step);
      hi[index] = clamp01(params[index] + step);
      const delta = Math.max(1e-6, hi[index] - lo[index]);
      const row = raw[index];
      for (let viewIndex = 0; viewIndex < angles.length; viewIndex += stride) {
        const angle = angles[viewIndex];
        for (let iy = 0; iy < resolution; iy += 1) {
          const y = -1 + 2 * (iy + 0.5) / resolution;
          for (let ix = 0; ix < resolution; ix += 1) {
            const x = -1 + 2 * (ix + 0.5) / resolution;
            const a = renderPixel(lo, model, x, y, angle, 28, options.shape || "superellipse");
            const b = renderPixel(hi, model, x, y, angle, 28, options.shape || "superellipse");
            row.total += 1;
            // Three mutually exclusive classes. A sample where this parameter moved coverage
            // at all is a boundary sample: the finite difference there is a step, not a
            // derivative. A statically soft edge pixel is neither -- it is partially covered
            // in both renders, which is a property of the silhouette, not of the parameter.
            if (Math.abs(b.mask - a.mask) > 1e-6) {
              row.boundary += 1;
            } else if (a.mask > 0.999) {
              const dr = (b.rgb[0] - a.rgb[0]) / delta;
              const dg = (b.rgb[1] - a.rgb[1]) / delta;
              const db = (b.rgb[2] - a.rgb[2]) / delta;
              const dd = (b.depth - a.depth) / delta;
              row.rgb += (dr * dr + dg * dg + db * db) / 3;
              row.depth += dd * dd;
              row.interior += 1;
            }
          }
        }
      }
    }
    const channels = ["rgb", "depth", "boundary"];
    const norms = raw.map((row) => {
      const interior = Math.max(1, row.interior);
      return {
        rgb: Math.sqrt(row.rgb / interior),
        depth: Math.sqrt(row.depth / interior),
        boundary: row.total ? row.boundary / row.total : 0,
        interiorSamples: row.interior,
        boundarySamples: row.boundary,
        totalSamples: row.total
      };
    });
    const peak = {};
    for (const channel of channels) {
      peak[channel] = norms.reduce((max, row) => Math.max(max, row[channel]), 0);
    }
    return {
      channels,
      peak,
      resolution,
      rows: norms.map((row, index) => ({
        label: PARAMETER_META[index].label,
        group: PARAMETER_META[index].group,
        raw: row,
        normalized: Object.fromEntries(channels.map((channel) =>
          [channel, peak[channel] > 0 ? row[channel] / peak[channel] : 0]))
      }))
    };
  }

  function snapshot(state) {
    return {
      model: state.model,
      shape: state.shape,
      scope: state.scope,
      viewCount: state.viewCount,
      workResolution: state.workResolution,
      params: state.params.slice(),
      target: state.target.slice(),
      iteration: state.iteration,
      loss: state.loss,
      history: state.history.slice(),
      errors: groupErrors(state.params, state.target)
    };
  }

  function renderRgba(params, model, width, height, viewAngle = 0, shape = "superellipse", sampleGrid = 1) {
    const data = new Uint8ClampedArray(width * height * 4);
    // Square pixels. Both axes used to span the same world range whatever the buffer's shape,
    // so the horizontal scale was width/height times the vertical one and the solid came out
    // stretched sideways -- 1.5x at the shipped 360x240, measurably: one silhouette spans
    // 188x204 pixels in a square buffer and spanned 283x204 in this one. Holding the vertical
    // half-extent and widening the horizontal one by the aspect keeps the framing and fixes
    // the shape.
    const halfY = 1.05;
    const halfX = halfY * (width / height);
    const grid = Math.max(1, Math.min(3, Math.floor(sampleGrid) || 1));
    for (let y = 0; y < height; y += 1) {
      const sy = -halfY + 2 * halfY * (y + 0.5) / height;
      for (let x = 0; x < width; x += 1) {
        const sx = -halfX + 2 * halfX * (x + 0.5) / width;
        let sample = null;
        if (grid === 1) sample = renderPixel(params, model, sx, sy, viewAngle, 28, shape);
        else {
          const rgb = [0, 0, 0];
          for (let jy = 0; jy < grid; jy += 1) {
            for (let jx = 0; jx < grid; jx += 1) {
              const ox = ((jx + 0.5) / grid - 0.5) * 2 * halfX / width;
              const oy = ((jy + 0.5) / grid - 0.5) * 2 * halfY / height;
              const sub = renderPixel(params, model, sx + ox, sy + oy, viewAngle, 28, shape);
              for (let channel = 0; channel < 3; channel += 1) rgb[channel] += sub.rgb[channel] / (grid * grid);
            }
          }
          sample = { rgb };
        }
        const base = (y * width + x) * 4;
        data[base] = Math.round(255 * Math.pow(clamp01(sample.rgb[0]), 1 / 2.2));
        data[base + 1] = Math.round(255 * Math.pow(clamp01(sample.rgb[1]), 1 / 2.2));
        data[base + 2] = Math.round(255 * Math.pow(clamp01(sample.rgb[2]), 1 / 2.2));
        data[base + 3] = 255;
      }
    }
    return data;
  }

  function mapSample(params, model, map, u, v, shape = "superellipse", aspect = 1) {
    const p = decodedParameters(params);
    if (SHAPE_META[shape]?.detailed) {
      // Surface-space maps are views of the actual current object, not an unrelated swatch.
      const surface = detailedSurface(p, shape, (u - 0.5) * 2.1 * aspect, (v - 0.5) * 2.1, 0);
      if (!surface) return [0.035, 0.043, 0.052];
      if (map === "normal") return surface.normal.map((value) => value * 0.5 + 0.5);
      if (map === "albedo") return p.albedo.map((value) => value * surface.pigment);
      if (map === "roughness") return Array(3).fill(Math.min(0.9, p.roughness * surface.roughness));
      if (map === "displacement" || map === "geometry") return [surface.depth * 0.7, surface.depth, surface.depth * 0.92];
    }
    const phi = (u - 0.5) * Math.PI * 2;
    const y = (v - 0.5) * 2;
    const wave = 0.5 + 0.5 * Math.sin(phi * 5.2 + 0.7) * Math.sin(y * 7.1 - 0.4);
    if (map === "albedo") {
      const stripe = 0.78 + 0.22 * Math.sin(phi * 2.1 + y * 2.4 + 0.5);
      return p.albedo.map((channel) => clamp01(channel * stripe));
    }
    if (map === "normal") {
      const nx = p.normalStrength * Math.cos(phi * 8.1 + y * 3.2);
      const ny = p.normalStrength * Math.sin(y * 11.2 - phi * 2.7);
      const normal = normalize3(nx, ny, 1);
      return normal.map((value) => value * 0.5 + 0.5);
    }
    if (map === "displacement") return [wave * p.displacement * 4.2, wave * p.displacement * 3.6, wave * p.displacement * 2.7];
    if (map === "roughness") return [p.roughness, p.roughness, p.roughness];
    if (map === "metalness") return [p.metalness * 0.7, p.metalness * 0.86, p.metalness];
    if (map === "microstructure") {
      if (model === "glint") {
        const facet = hash2(Math.floor(u * 48), Math.floor(v * 48));
        const spark = facet > 0.92 - p.microstructure * 0.05 ? 1 : facet * 0.18;
        return [spark, spark * 0.88, spark * 0.55];
      }
      if (model === "granular") {
        const grain = hash2(Math.floor(u * 38), Math.floor(v * 38));
        return [0.22 + grain * 0.72, 0.16 + grain * 0.45, 0.08 + grain * 0.18];
      }
      return [p.roughness, 0.3 + p.roughness * 0.5, 0.42];
    }
    return [0, 0, 0];
  }

  function renderMapRgba(params, model, map, width, height, shape = "superellipse") {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const color = mapSample(params, model, map, (x + 0.5) / width, (y + 0.5) / height, shape, width / height);
        const base = (y * width + x) * 4;
        data[base] = Math.round(clamp01(color[0]) * 255);
        data[base + 1] = Math.round(clamp01(color[1]) * 255);
        data[base + 2] = Math.round(clamp01(color[2]) * 255);
        data[base + 3] = 255;
      }
    }
    return data;
  }

  function bsdfSlice(params, model, count = 180) {
    const p = decodedParameters(params);
    const values = [];
    const light = normalize3(Math.sin(p.lightAngle), 0.2, Math.cos(p.lightAngle));
    for (let index = 0; index < count; index += 1) {
      const angle = -1.35 + 2.7 * index / Math.max(1, count - 1);
      const view = normalize3(Math.sin(angle), 0, Math.cos(angle));
      const halfVector = normalize3(light[0] + view[0], light[1], light[2] + view[2]);
      const normal = [0, 0, 1];
      const delta = angle + p.lightAngle;
      let value = (1 - p.metalness * 0.8) * 0.22 * Math.max(0, view[2]);
      value += (0.18 + p.metalness * 0.82) * Math.exp(-0.5 * Math.pow(delta / (0.04 + p.roughness * 0.42), 2));
      if (model === "glint") value += discreteFacetResponse(angle * 1.7, 0.12, halfVector, p.roughness, p.microstructure);
      if (model === "granular") value += granularResponse(angle * 1.3, 0.2, normal, light, view, p.roughness, p.microstructure);
      values.push(value);
    }
    return values;
  }

  return {
    PARAMETER_META,
    MODEL_META,
    SHAPE_META,
    createSolver,
    stepSolver,
    snapshot,
    renderPixel,
    renderRgba,
    renderMapRgba,
    bsdfSlice,
    decodedParameters,
    targetParameters,
    sampleLoss,
    viewAngles,
    activeIndices,
    groupErrors,
    sensitivityMatrix,
    smithVisibility,
    singleScatterAlbedo,
    energyCompensation,
    whiteFurnaceError
  };
});
