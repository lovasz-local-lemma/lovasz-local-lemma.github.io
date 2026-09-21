// THREE-free geometry for rolling-shape pi. Boundary points are [x,y] arrays
// with the centroid near the origin and CCW winding.
const TAU = Math.PI * 2;

export function circle(diameter = 1, n = 720) {
  const r = diameter / 2, pts = [];
  for (let i = 0; i < n; i++) { const a = TAU * i / n; pts.push([r * Math.cos(a), r * Math.sin(a)]); }
  return pts;
}
export function ellipse(a, b, n = 720) {
  const pts = [];
  for (let i = 0; i < n; i++) { const t = TAU * i / n; pts.push([a * Math.cos(t), b * Math.sin(t)]); }
  return pts;
}
export function regularPolygon(N, R = 0.5) {
  const pts = [];
  for (let i = 0; i < N; i++) { const a = TAU * i / N; pts.push([R * Math.cos(a), R * Math.sin(a)]); }
  return pts;
}
export function reuleaux(width = 1, seg = 240) {
  const h = Math.sqrt(3) * width / 2;
  const V = [[0, 2 * h / 3], [-width / 2, -h / 3], [width / 2, -h / 3]];
  const arcs = [[0, 1, 2], [1, 2, 0], [2, 0, 1]];
  const pts = [];
  for (const [c, f, t] of arcs) {
    let a0 = Math.atan2(V[f][1] - V[c][1], V[f][0] - V[c][0]);
    let a1 = Math.atan2(V[t][1] - V[c][1], V[t][0] - V[c][0]);
    while (a1 < a0) a1 += TAU; if (a1 - a0 > Math.PI) a0 += TAU;
    for (let i = 0; i <= seg; i++) { const a = a0 + (a1 - a0) * i / seg; pts.push([V[c][0] + width * Math.cos(a), V[c][1] + width * Math.sin(a)]); }
  }
  return pts;
}

export function perimeter(pts) {
  let p = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; p += Math.hypot(b[0] - a[0], b[1] - a[1]); }
  return p;
}

// breadth between supporting lines perpendicular to direction theta
export function widthAt(pts, theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  let mn = Infinity, mx = -Infinity;
  for (const p of pts) { const pr = p[0] * c + p[1] * s; if (pr < mn) mn = pr; if (pr > mx) mx = pr; }
  return mx - mn;
}

export function widthStats(pts, samples = 720) {
  let min = Infinity, max = -Infinity, sum = 0;
  for (let j = 0; j < samples; j++) { const w = widthAt(pts, Math.PI * j / samples); if (w < min) min = w; if (w > max) max = w; sum += w; }
  return { min, max, mean: sum / samples };
}
