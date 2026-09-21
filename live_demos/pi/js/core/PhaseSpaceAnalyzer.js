// js/core/PhaseSpaceAnalyzer.js
//
// Estimates π from the geometry of the phase-space region filled by a trajectory.
//
// Important: this is intentionally an experimental estimator. A chaotic trajectory
// only gives a useful π estimate if its sampled coordinates really fill something
// close to an n-ball. The code below avoids using Math.PI in the solve step, but
// the model assumption is still much weaker than the exact reflection counters.

/**
 * Estimate π from a set of phase space points.
 * @param {number[][]} points - Array of N-dimensional phase space points
 * @param {string} method - 'surface' (points on a surface) or 'volume' (points fill a volume)
 * @returns {{ pi: number, confidence: number, radius: number, dimension: number, details: string }}
 */
export function estimatePiFromTrajectory(points, method = 'surface') {
  if (points.length < 10) {
    return { pi: 0, confidence: 0, radius: 0, dimension: 0, details: 'Need more points' };
  }

  const dim = points[0].length;

  // 1. Estimate the center (centroid)
  const center = new Array(dim).fill(0);
  for (const pt of points) {
    for (let d = 0; d < dim; d++) center[d] += pt[d];
  }
  for (let d = 0; d < dim; d++) center[d] /= points.length;

  // 2. Estimate radius (RMS distance from center)
  let sumR2 = 0;
  for (const pt of points) {
    let r2 = 0;
    for (let d = 0; d < dim; d++) r2 += (pt[d] - center[d]) ** 2;
    sumR2 += r2;
  }
  const rmsRadius = Math.sqrt(sumR2 / points.length);

  if (rmsRadius < 1e-10) {
    return { pi: 0, confidence: 0, radius: 0, dimension: dim, details: 'Points collapsed to a single point' };
  }

  if (method === 'surface') {
    return estimateFromSurface(points, center, rmsRadius, dim);
  } else {
    return estimateFromVolume(points, center, rmsRadius, dim);
  }
}

/**
 * Surface method: Points lie ON a surface (like collision-counting sims).
 * Estimate the "angular coverage" of the trajectory on the unit sphere.
 * For a circle (dim=2): coverage = arc length / circumference. π = arcLength / (2R × coverage).
 * More generally: estimate the fraction of the n-sphere surface covered.
 */
function estimateFromSurface(points, center, R, dim) {
  if (dim === 2) {
    // Arc length estimation: sum of distances between consecutive points
    let arcLength = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i][0] - points[i - 1][0];
      const dy = points[i][1] - points[i - 1][1];
      arcLength += Math.sqrt(dx * dx + dy * dy);
    }

    // Angle swept (in radians)
    let totalAngle = 0;
    for (let i = 1; i < points.length; i++) {
      const a1 = Math.atan2(points[i - 1][1] - center[1], points[i - 1][0] - center[0]);
      const a2 = Math.atan2(points[i][1] - center[1], points[i][0] - center[0]);
      let da = a2 - a1;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      totalAngle += Math.abs(da);
    }

    // π ≈ totalAngle / 2 (if trajectory sweeps a full semicircle)
    // More precisely: circumference = 2πR, arc = totalAngle × R
    // So π = arc / (2R) if we've swept the full thing, but we may have
    // gone back and forth. Use total angle directly.
    const piEstimate = totalAngle / 2;

    return {
      pi: piEstimate,
      confidence: Math.min(1, points.length / 100),
      radius: R,
      dimension: dim,
      details: `Arc length: ${arcLength.toFixed(3)}, Total angle swept: ${totalAngle.toFixed(3)} rad`
    };
  }

  if (dim === 3) {
    // Solid angle estimation using point distribution on sphere
    // Normalize all points to unit sphere
    const normalized = points.map(pt => {
      const r = Math.sqrt(pt.reduce((s, v, d) => s + (v - center[d]) ** 2, 0));
      return pt.map((v, d) => (v - center[d]) / (r || 1));
    });

    // Estimate surface area via grid-based coverage
    // Divide sphere into cells, count occupied cells
    const gridRes = 20; // cells per dimension
    const occupied = new Set();
    for (const npt of normalized) {
      // Convert to spherical coordinates
      const theta = Math.acos(Math.max(-1, Math.min(1, npt[2]))); // polar
      const phi = Math.atan2(npt[1], npt[0]); // azimuthal
      const thetaBin = Math.floor(theta / Math.PI * gridRes);
      const phiBin = Math.floor((phi + Math.PI) / (2 * Math.PI) * gridRes);
      occupied.add(`${thetaBin},${phiBin}`);
    }

    const totalCells = gridRes * gridRes;
    const coverage = occupied.size / totalCells;
    // This diagnostic deliberately does not return a fake π value. Estimating a
    // sphere's surface area from grid coverage needs a calibrated cell area, which
    // would reintroduce π. The variance of radii is still a useful health check.
    const radii = points.map(pt => Math.sqrt(pt.reduce((s, v, d) => s + (v - center[d]) ** 2, 0)));
    const meanR = radii.reduce((a, b) => a + b, 0) / radii.length;
    const varR = radii.reduce((s, r) => s + (r - meanR) ** 2, 0) / radii.length;
    const cvR = Math.sqrt(varR) / meanR; // coefficient of variation

    return {
      pi: 0,
      confidence: Math.min(1, coverage),
      radius: R,
      dimension: dim,
      details: `Coverage: ${(coverage * 100).toFixed(1)}%, Radius CV: ${cvR.toFixed(3)}. Surface-area π extraction intentionally disabled.`
    };
  }

  // Higher dimensions: use bounding box method
  return estimateFromVolume(points, center, R, dim);
}

/**
 * Volume method: Points FILL a region (chaotic/ergodic systems).
 * Use Monte Carlo estimation: if points fill an n-ball of radius R,
 * the volume = C_n × R^n where C_n contains π.
 *
 * V_n = π^(n/2) / Γ(n/2 + 1) × R^n
 *
 * We estimate V via bounding-box ratio (fraction of bounding box occupied),
 * then solve for π.
 */
function estimateFromVolume(points, center, R, dim) {
  if (points.length < 50) {
    return { pi: 0, confidence: 0, radius: R, dimension: dim, details: 'Need more points for volume estimation' };
  }

  // Compute bounding box
  const mins = new Array(dim).fill(Infinity);
  const maxs = new Array(dim).fill(-Infinity);
  for (const pt of points) {
    for (let d = 0; d < dim; d++) {
      mins[d] = Math.min(mins[d], pt[d]);
      maxs[d] = Math.max(maxs[d], pt[d]);
    }
  }

  // Bounding box volume
  let bbVolume = 1;
  for (let d = 0; d < dim; d++) bbVolume *= (maxs[d] - mins[d]);

  // Grid-based volume estimation
  const gridRes = 10;
  const occupied = new Set();
  for (const pt of points) {
    const key = pt.map((v, d) => {
      const range = maxs[d] - mins[d];
      return range > 0 ? Math.floor((v - mins[d]) / range * gridRes) : 0;
    }).join(',');
    occupied.add(key);
  }

  const totalCells = Math.pow(gridRes, dim);
  const filledFraction = occupied.size / totalCells;
  const estimatedVolume = filledFraction * bbVolume;

  // For an n-ball, V = c_n * π^p * R^n, where c_n is rational:
  // even n=2k:   V = π^k / k! * R^n
  // odd  n=2k+1: V = (2^(2k+1) k! / (2k+1)!) * π^k * R^n
  const coeff = unitBallPiCoefficient(dim);
  const Rn = Math.pow(R, dim);

  let piEstimate = 0;
  if (Rn > 0 && coeff.power > 0 && coeff.factor > 0) {
    piEstimate = Math.pow(estimatedVolume / (coeff.factor * Rn), 1 / coeff.power);
  }

  return {
    pi: piEstimate,
    confidence: Math.min(1, filledFraction),
    radius: R,
    dimension: dim,
    details: `Filled: ${(filledFraction * 100).toFixed(1)}% of bounding box, Est. volume: ${estimatedVolume.toFixed(4)}, model: V=${coeff.factor.toFixed(5)}π^${coeff.power}R^${dim}`
  };
}

function factorial(n) {
  let out = 1;
  for (let i = 2; i <= n; i++) out *= i;
  return out;
}

function unitBallPiCoefficient(dim) {
  if (dim < 2) return { factor: 0, power: 0 };

  if (dim % 2 === 0) {
    const k = dim / 2;
    return { factor: 1 / factorial(k), power: k };
  }

  const k = (dim - 1) / 2;
  return {
    factor: Math.pow(2, 2 * k + 1) * factorial(k) / factorial(2 * k + 1),
    power: k
  };
}
