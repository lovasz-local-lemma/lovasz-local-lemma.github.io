(function initPolygonMesh(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.PolygonMesh = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPolygonMeshApi() {
  "use strict";

  const CUBE_CORNERS = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]
  ];
  const CUBE_TETRAHEDRA = [
    [0, 5, 1, 6],
    [0, 1, 2, 6],
    [0, 2, 3, 6],
    [0, 3, 7, 6],
    [0, 7, 4, 6],
    [0, 4, 5, 6]
  ];

  function extractIsoSurface(options) {
    const params = options && options.params;
    if (!params || params.length < 5) throw new Error("Polygon extraction requires 3D reconstruction parameters");
    const from = options.from || "box";
    const to = options.to || "sphere";
    const resolution = clampInt(options.resolution || 24, 8, 64);
    const bounds = clampNumber(options.bounds || 0.86, 0.74, 1.2);
    const cells = resolution - 1;
    const step = bounds * 2 / cells;
    const sampleCount = resolution * resolution * resolution;
    const values = new Float32Array(sampleCount);
    const positions = [];
    const normals = [];
    let activeCells = 0;
    let surfaceArea = 0;

    const indexOf = (x, y, z) => (z * resolution + y) * resolution + x;
    for (let z = 0; z < resolution; z += 1) {
      const pz = -bounds + z * step;
      for (let y = 0; y < resolution; y += 1) {
        const py = -bounds + y * step;
        for (let x = 0; x < resolution; x += 1) {
          const px = -bounds + x * step;
          values[indexOf(x, y, z)] = sampleLocalSdf(params, from, to, [px, py, pz]);
        }
      }
    }

    const cubePoints = new Array(8);
    const cubeValues = new Float32Array(8);
    for (let z = 0; z < cells; z += 1) {
      for (let y = 0; y < cells; y += 1) {
        for (let x = 0; x < cells; x += 1) {
          let hasInside = false;
          let hasOutside = false;
          for (let corner = 0; corner < 8; corner += 1) {
            const offset = CUBE_CORNERS[corner];
            const gx = x + offset[0];
            const gy = y + offset[1];
            const gz = z + offset[2];
            const value = values[indexOf(gx, gy, gz)];
            cubeValues[corner] = value;
            cubePoints[corner] = [
              -bounds + gx * step,
              -bounds + gy * step,
              -bounds + gz * step
            ];
            hasInside = hasInside || value <= 0;
            hasOutside = hasOutside || value > 0;
          }
          if (!hasInside || !hasOutside) continue;
          activeCells += 1;
          for (const tetrahedron of CUBE_TETRAHEDRA) {
            polygonizeTetrahedron(tetrahedron, cubePoints, cubeValues, emitTriangle);
          }
        }
      }
    }

    function emitTriangle(a, b, c) {
      const ab = sub3(b, a);
      const ac = sub3(c, a);
      let face = cross3(ab, ac);
      const faceLength = length3(face);
      if (faceLength < 1e-9) return;
      const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
      const gradient = estimateLocalNormal(params, from, to, centroid, step * 0.08);
      let p1 = b;
      let p2 = c;
      if (dot3(face, gradient) < 0) {
        p1 = c;
        p2 = b;
        face = scale3(face, -1);
      }
      surfaceArea += faceLength * params[3] * params[3] * 0.5;
      appendVertex(a);
      appendVertex(p1);
      appendVertex(p2);
    }

    function appendVertex(localPoint) {
      const world = [
        params[0] + localPoint[0] * params[3],
        params[1] + localPoint[1] * params[3],
        params[2] + localPoint[2] * params[3]
      ];
      const normal = estimateLocalNormal(params, from, to, localPoint, step * 0.08);
      positions.push(world[0], world[1], world[2]);
      normals.push(normal[0], normal[1], normal[2]);
    }

    return {
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      triangleCount: positions.length / 9,
      vertexCount: positions.length / 3,
      activeCells,
      sampleCount,
      resolution,
      bounds,
      surfaceArea
    };
  }

  function polygonizeTetrahedron(tetrahedron, points, values, emitTriangle) {
    const inside = [];
    const outside = [];
    for (const index of tetrahedron) {
      (values[index] <= 0 ? inside : outside).push(index);
    }
    if (inside.length === 0 || inside.length === 4) return;

    if (inside.length === 1 || inside.length === 3) {
      const pivotSet = inside.length === 1 ? inside : outside;
      const rimSet = inside.length === 1 ? outside : inside;
      const pivot = pivotSet[0];
      const a = interpolateIso(points[pivot], points[rimSet[0]], values[pivot], values[rimSet[0]]);
      const b = interpolateIso(points[pivot], points[rimSet[1]], values[pivot], values[rimSet[1]]);
      const c = interpolateIso(points[pivot], points[rimSet[2]], values[pivot], values[rimSet[2]]);
      emitTriangle(a, b, c);
      return;
    }

    const a = inside[0];
    const b = inside[1];
    const c = outside[0];
    const d = outside[1];
    const ac = interpolateIso(points[a], points[c], values[a], values[c]);
    const ad = interpolateIso(points[a], points[d], values[a], values[d]);
    const bc = interpolateIso(points[b], points[c], values[b], values[c]);
    const bd = interpolateIso(points[b], points[d], values[b], values[d]);
    emitTriangle(ac, ad, bc);
    emitTriangle(ad, bd, bc);
  }

  function interpolateIso(a, b, valueA, valueB) {
    const denominator = valueA - valueB;
    const t = Math.abs(denominator) < 1e-12 ? 0.5 : clampNumber(valueA / denominator, 0, 1);
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ];
  }

  function sampleLocalSdf(params, from, to, point) {
    const shapeMix = clampNumber(params[4], 0, 1);
    const d0 = shapeSdf(from, point);
    const d1 = shapeSdf(to, point);
    const base = d0 * (1 - shapeMix) + d1 * shapeMix;
    const amplitude = Math.max(0, Number(params[12]) || 0);
    if (amplitude <= 1e-8) return base;
    return base - amplitude * proceduralNoise3d(point, Math.max(1.5, Number(params[13]) || 3.6));
  }

  function proceduralNoise3d(point, frequency) {
    const x = point[0] * frequency;
    const y = point[1] * frequency;
    const z = point[2] * frequency;
    const octave0 = Math.sin(x + Math.sin(z * 0.73) * 0.8) * Math.sin(y * 1.11 - z * 0.31);
    const octave1 = Math.sin((x + y) * 1.93 + 1.7) * Math.cos((z - y * 0.4) * 1.71);
    const octave2 = Math.sin((x - z * 0.6) * 3.87 - 0.8) * Math.sin((y + z) * 3.21 + 0.45);
    return octave0 * 0.58 + octave1 * 0.29 + octave2 * 0.13;
  }

  function shapeSdf(kind, point) {
    if (kind === "box") return boxSdf(point, [0.58, 0.58, 0.58]);
    if (kind === "torus") return torusSdf(point, 0.5, 0.18);
    if (kind === "capsule") return capsuleSdf(point, [-0.42, 0, 0], [0.42, 0, 0], 0.28);
    return length3(point) - 0.72;
  }

  function estimateLocalNormal(params, from, to, point, epsilon) {
    const e = Math.max(0.0008, epsilon || 0.003);
    const dx = sampleLocalSdf(params, from, to, [point[0] + e, point[1], point[2]]) - sampleLocalSdf(params, from, to, [point[0] - e, point[1], point[2]]);
    const dy = sampleLocalSdf(params, from, to, [point[0], point[1] + e, point[2]]) - sampleLocalSdf(params, from, to, [point[0], point[1] - e, point[2]]);
    const dz = sampleLocalSdf(params, from, to, [point[0], point[1], point[2] + e]) - sampleLocalSdf(params, from, to, [point[0], point[1], point[2] - e]);
    const length = Math.hypot(dx, dy, dz) || 1;
    return [dx / length, dy / length, dz / length];
  }

  function boxSdf(point, bounds) {
    const qx = Math.abs(point[0]) - bounds[0];
    const qy = Math.abs(point[1]) - bounds[1];
    const qz = Math.abs(point[2]) - bounds[2];
    const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
    return outside + Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  }

  function torusSdf(point, major, minor) {
    return Math.hypot(Math.hypot(point[0], point[2]) - major, point[1]) - minor;
  }

  function capsuleSdf(point, a, b, radius) {
    const pa = sub3(point, a);
    const ba = sub3(b, a);
    const h = clampNumber(dot3(pa, ba) / dot3(ba, ba), 0, 1);
    return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h) - radius;
  }

  function sub3(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function scale3(value, scalar) {
    return [value[0] * scalar, value[1] * scalar, value[2] * scalar];
  }

  function cross3(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function dot3(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function length3(value) {
    return Math.hypot(value[0], value[1], value[2]);
  }

  function clampNumber(value, low, high) {
    return Math.max(low, Math.min(high, Number(value)));
  }

  function clampInt(value, low, high) {
    return Math.round(clampNumber(value, low, high));
  }

  return {
    extractIsoSurface,
    sampleLocalSdf,
    shapeSdf
  };
});
