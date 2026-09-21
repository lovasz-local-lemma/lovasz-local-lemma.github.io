// BalanceForge — minimal PCA via deflated power iteration.
// Used to project genome weight vectors into 2D so we can scatter-plot the
// solution space the GA is exploring.

(function (BF) {
  'use strict';

  // samples: array of Float64Array(d). Returns { mean: Float64Array(d),
  // components: [Float64Array(d), Float64Array(d)], projected: Float64Array(n*2),
  // explained: [variance ratio per PC] }.
  function pca2(samples) {
    const n = samples.length;
    if (n === 0) return { mean: new Float64Array(0), components: [], projected: new Float64Array(0), explained: [0, 0] };
    const d = samples[0].length;
    if (d === 0) return { mean: new Float64Array(0), components: [], projected: new Float64Array(0), explained: [0, 0] };

    // Center.
    const mean = new Float64Array(d);
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      for (let j = 0; j < d; j++) mean[j] += s[j];
    }
    for (let j = 0; j < d; j++) mean[j] /= n;
    // X copy (mutable).
    const X = new Array(n);
    for (let i = 0; i < n; i++) {
      const row = new Float64Array(d);
      const s = samples[i];
      for (let j = 0; j < d; j++) row[j] = s[j] - mean[j];
      X[i] = row;
    }

    // Total variance (for explained ratio).
    let totalVar = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) totalVar += X[i][j] * X[i][j];
    totalVar = totalVar / Math.max(1, n - 1);
    if (totalVar < 1e-12) {
      return { mean, components: [new Float64Array(d), new Float64Array(d)], projected: new Float64Array(n * 2), explained: [0, 0] };
    }

    function powerIter() {
      let v = new Float64Array(d);
      // Deterministic init so two consecutive runs are stable visually.
      for (let j = 0; j < d; j++) v[j] = Math.cos(j * 1.234) + 0.001 * Math.sin(j * 2.345);
      normalize(v);
      const tmp = new Float64Array(n);
      const next = new Float64Array(d);
      for (let iter = 0; iter < 40; iter++) {
        // tmp = X v
        for (let i = 0; i < n; i++) {
          const row = X[i];
          let s = 0;
          for (let j = 0; j < d; j++) s += row[j] * v[j];
          tmp[i] = s;
        }
        // next = X^T tmp
        for (let j = 0; j < d; j++) next[j] = 0;
        for (let i = 0; i < n; i++) {
          const row = X[i];
          const t = tmp[i];
          for (let j = 0; j < d; j++) next[j] += row[j] * t;
        }
        normalize(next);
        // converge check
        let dot = 0;
        for (let j = 0; j < d; j++) dot += next[j] * v[j];
        v = new Float64Array(next);
        if (dot > 0.999999) break;
      }
      return v;
    }

    function deflate(v, eigval) {
      // X = X - (X v) v^T  (since v is unit, this removes the component along v)
      for (let i = 0; i < n; i++) {
        const row = X[i];
        let s = 0;
        for (let j = 0; j < d; j++) s += row[j] * v[j];
        for (let j = 0; j < d; j++) row[j] -= s * v[j];
      }
    }

    function eigvalOf(v) {
      // ||X v||² / (n-1) approximates the eigenvalue of X^T X / (n-1) along v.
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const row = X[i];
        let s = 0;
        for (let j = 0; j < d; j++) s += row[j] * v[j];
        sum += s * s;
      }
      return sum / Math.max(1, n - 1);
    }

    const pc1 = powerIter();
    const ev1 = eigvalOf(pc1);
    deflate(pc1);
    const pc2 = powerIter();
    const ev2 = eigvalOf(pc2);

    // Project original (centered) samples onto pc1, pc2.
    const projected = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      let p1 = 0, p2 = 0;
      for (let j = 0; j < d; j++) {
        const v = s[j] - mean[j];
        p1 += v * pc1[j];
        p2 += v * pc2[j];
      }
      projected[i * 2] = p1;
      projected[i * 2 + 1] = p2;
    }

    return {
      mean, components: [pc1, pc2], projected,
      explained: [ev1 / totalVar, ev2 / totalVar],
    };
  }

  function normalize(v) {
    let n = 0;
    for (let j = 0; j < v.length; j++) n += v[j] * v[j];
    n = Math.sqrt(n);
    if (n < 1e-12) {
      v[0] = 1;
      return;
    }
    for (let j = 0; j < v.length; j++) v[j] /= n;
  }

  // Build per-genome feature vectors. Two strategies:
  //
  // 1. Fixed-topology mode (CMA-ES/DE/SA/PT/PSO): every individual has an
  //    aligned `params` flat array of the same length. We use that directly,
  //    which gives a meaningful PCA basis where dimension i = parameter i
  //    across the whole population. Crucially, this stays *consistent across
  //    generations* (different runs of cmaes.genomeFromParams generate fresh
  //    innovation IDs each gen, so the genome-keyed feature matrix below
  //    rebuilds a different basis every gen — useless for trails).
  //
  // 2. NEAT mode: genomes have heterogeneous topologies. We index features
  //    by innovation ID (the stable identifier across mutations) so the
  //    feature vectors line up where individuals share connections. Sparse
  //    where they don't.
  function buildFeatureMatrix(population) {
    let allHaveParams = true;
    let paramLen = -1;
    for (const ind of population) {
      if (!ind.params) { allHaveParams = false; break; }
      if (paramLen === -1) paramLen = ind.params.length;
      else if (ind.params.length !== paramLen) { allHaveParams = false; break; }
    }
    if (allHaveParams && paramLen > 0) {
      const samples = new Array(population.length);
      for (let i = 0; i < population.length; i++) {
        samples[i] = population[i].params;
      }
      return { samples, innovIndex: null, byParams: true, dim: paramLen };
    }
    // NEAT-style innovation-id-keyed features.
    const innovIndex = new Map();
    for (const ind of population) {
      for (const c of ind.genome.conns) {
        if (!c.enabled) continue;
        if (!innovIndex.has(c.innov)) innovIndex.set(c.innov, innovIndex.size);
      }
    }
    const d = innovIndex.size;
    const samples = new Array(population.length);
    for (let i = 0; i < population.length; i++) {
      const v = new Float64Array(d);
      for (const c of population[i].genome.conns) {
        if (!c.enabled) continue;
        const idx = innovIndex.get(c.innov);
        if (idx != null) v[idx] = c.weight;
      }
      samples[i] = v;
    }
    return { samples, innovIndex, byParams: false, dim: d };
  }

  // Behavior-space feature matrix. Each individual carries a fixed-length
  // `behavior` Float64Array populated during evaluation (avg cart-x, std
  // cart-x, mean control, std control, mean tip height, upTime fraction).
  // Two policies with very different params but similar BEHAVIOR end up
  // nearby — distinct semantics from param-space PCA.
  function buildBehaviorMatrix(population) {
    const samples = [];
    let dim = -1;
    let labels = null;
    for (const ind of population) {
      if (!ind.behavior) continue;
      if (dim === -1) dim = ind.behavior.length;
      else if (ind.behavior.length !== dim) continue;
      samples.push(ind.behavior);
      if (!labels && ind.behavior.labels) labels = ind.behavior.labels;
    }
    return {
      samples, innovIndex: null, byParams: false, byBehavior: true,
      dim: dim > 0 ? dim : 0, labels,
    };
  }

  BF.pca = { pca2, buildFeatureMatrix, buildBehaviorMatrix };
})(window.BF);
