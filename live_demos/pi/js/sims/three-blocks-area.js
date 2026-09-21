// A solid-angle measurement of the actual three-block / wall chamber.
// This samples an ensemble, not the occupancy of a collision trajectory.
// See docs/three-blocks-area.md for the change of variables and uncertainty.

// atan(x)/x by a convergent arithmetic series. Our positive-octant triangle
// has 0 <= x < sqrt(2)-1, so 48 terms are more than enough for double precision.
// Keeping the ratio avoids cancellation/underflow for needle-like chambers.
function atanRatio(x) {
  let sum = 1, power = 1;
  for (let k = 1; k < 48; k++) {
    power *= -x * x;
    const term = power / (2 * k + 1);
    sum += term;
    if (Math.abs(term) < Number.EPSILON * Math.abs(sum)) break;
  }
  return sum;
}

export function chamberAreaGeometry(masses) {
  if (masses.length !== 3 || masses.some(m => !Number.isFinite(m) || m <= 0)) {
    throw new RangeError('Three finite positive masses are required');
  }
  const root = masses.map(Math.sqrt);
  const scale = Math.max(...root);
  const axes = root.map(x => x / scale);
  const [a, b, c] = axes;
  const r = Math.hypot(a, b, c), s = Math.hypot(b, c);
  // Vertices are (0,0,1), (0,b,c)/s, and (a,b,c)/r.
  const denominator = 1 + c / s + c / r + (b * b + c * c) / (r * s);
  const determinant = a * b * c;
  const ratio = 1 / (c * r * s * denominator);
  const tangent = determinant * ratio;
  const scaledArea = 2 * ratio * atanRatio(tangent);
  if (!(determinant > 0 && Number.isFinite(scaledArea))) {
    throw new RangeError('Mass ratio exceeds solid-angle precision');
  }
  return { axes, determinant, scaledArea, solidAngle: determinant * scaledArea };
}

// Marsaglia's disk rejection map produces a uniform unit-sphere direction
// from uniform random numbers without a trigonometric function or pi constant.
export function sampleSphereDirection(random = Math.random) {
  let x, y, s;
  do {
    x = 2 * random() - 1;
    y = 2 * random() - 1;
    s = x * x + y * y;
  } while (s >= 1);
  const t = 2 * Math.sqrt(1 - s);
  return [t * x, t * y, 1 - 2 * s];
}

export function mapChamberSample(direction, axes) {
  const scaled = direction.map((u, i) => axes[i] * u);
  const norm = Math.hypot(...scaled);
  const point = scaled.map(x => x / norm);
  // q_i / sqrt(m_i) is ordered exactly when u_i is ordered.
  const hit = direction[0] >= 0 && direction[1] >= direction[0]
    && direction[2] >= direction[1];
  return { point, hit, scaledWeight: hit ? 1 / (norm * norm * norm) : 0 };
}

export class ThreeBlockAreaCounter {
  constructor(masses, random = Math.random) {
    this.geometry = chamberAreaGeometry(masses);
    this.random = random;
    this.count = 0;
    this.hits = 0;
    this.mean = 0;
    this.m2 = 0;
    this.last = null;
  }

  sample() {
    const sample = mapChamberSample(sampleSphereDirection(this.random), this.geometry.axes);
    this.count++;
    if (sample.hit) this.hits++;
    const delta = sample.scaledWeight - this.mean;
    this.mean += delta / this.count;
    this.m2 += delta * (sample.scaledWeight - this.mean);
    this.last = sample;
    return sample;
  }

  stats() {
    if (this.hits === 0) return { count: this.count, hits: 0, estimate: null, interval: null };
    const factor = this.geometry.scaledArea / 4;
    const estimate = factor / this.mean;
    const meanSE = this.count > 1
      ? Math.sqrt(Math.max(0, this.m2) / ((this.count - 1) * this.count)) : null;
    // Invert a normal approximation for the sample mean, not a claimed exact
    // confidence interval. Delay it until there are enough nonzero samples.
    const half = meanSE === null ? Infinity : 1.96 * meanSE;
    const interval = this.hits >= 30 && this.mean > half
      ? [factor / (this.mean + half), factor / (this.mean - half)] : null;
    return { count: this.count, hits: this.hits, estimate, interval, meanSE,
      areaFraction: this.geometry.determinant * this.mean };
  }
}
