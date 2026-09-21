/* AMCW modulation + slow scan selection. This is not optical-field interference. */
(function (root) {
  'use strict';
  const C = 299792458, TAU = 2 * Math.PI;
  const defaults = { source: 'line', shutter: 'column', code: 'sensor', frequency: 25,
    cycles: 3, tilt: 25, relief: 3, width: 1.15, offset: 0, indirect: .6, selected: 15, scan: .45, n: 28, rows: 12 };
  const length = (a, b = [0, 0, 0]) => Math.hypot(...a.map((v, i) => v - b[i]));
  const scanned = p => p.source === 'point' || p.source === 'line';
  function location(x, y, p) {
    const u = x / (p.n - 1), v = y / (p.rows - 1);
    const z = 8 + p.relief * (.38 * Math.sin(TAU * u) + .16 * Math.cos(TAU * v));
    return [(u - .5) * 1.15 * z, (v - .5) * .8 * z, z];
  }
  function sourcePhase(q, x, p) {
    if (p.code !== 'source') return 0;
    return TAU * p.cycles * (scanned(p) ? x / (p.n - 1) : .5 + q[0] / 10);
  }
  function sensorPhase(x, p) { return p.code === 'sensor' ? TAU * p.cycles * x / (p.n - 1) : 0; }
  function sourceDistance(q, p) {
    if (scanned(p)) return length(q);
    const a = p.source === 'tilt' ? p.tilt * Math.PI / 180 : 0;
    return q[2] * Math.cos(a) + q[0] * Math.sin(a);
  }
  function acceptance(receiver, source, p) {
    if (p.shutter === 'global' || !scanned(p)) return 1;
    const dx = source[0] - receiver[0] - p.offset;
    const dy = p.shutter === 'pixel' && p.source === 'point' ? source[1] - receiver[1] : 0;
    return Math.exp(-.5 * (dx * dx + dy * dy) / (p.width * p.width));
  }
  function paths(receiver, p) {
    const [x, y] = receiver, target = location(x, y, p), k = TAU * p.frequency * 1e6 / C;
    const offsets = [[0, 0, 0, 1, 'direct'], [-6, 0, 0, p.indirect / 3, 'across columns'], [0, 4, 0, p.indirect / 3, 'same column'], [0, 0, 3, p.indirect / 3, 'same pixel, extra path']];
    return offsets.map(([dx, dy, extra, amplitude, label]) => {
      const from = [Math.max(0, Math.min(p.n - 1, x + dx)), Math.max(0, Math.min(p.rows - 1, y + dy))];
      const sourcePoint = location(...from, p);
      const pathLength = sourceDistance(sourcePoint, p) + length(sourcePoint, target) + length(target) + extra;
      return { from, sourcePoint, target, label, amplitude, gate: acceptance(receiver, from, p),
        pathLength, phase: k * pathLength + sourcePhase(sourcePoint, from[0], p) };
    });
  }
  function sumPaths(list) {
    return list.reduce((sum, path) => ({ re: sum.re + path.amplitude * path.gate * Math.cos(path.phase),
      im: sum.im + path.amplitude * path.gate * Math.sin(path.phase) }), { re: 0, im: 0 });
  }
  function measure(options = {}) {
    const p = { ...defaults, ...options }, receiver = [p.selected, Math.floor(p.rows / 2)], list = paths(receiver, p);
    const phasor = sumPaths(list), referencePhase = sensorPhase(receiver[0], p);
    const correlation = .5 * (phasor.re * Math.cos(referencePhase) - phasor.im * Math.sin(referencePhase));
    const trace = Array.from({ length: 257 }, (_, i) => {
      const theta = TAU * 2 * i / 256;
      const received = list.reduce((sum, v) => sum + v.amplitude * v.gate * Math.cos(theta - v.phase), 0);
      const reference = Math.cos(theta + referencePhase);
      return { theta, received, reference, product: received * reference };
    });
    const fringes = Array.from({ length: p.n }, (_, x) => {
      const v = sumPaths(paths([x, receiver[1]], p)), a = sensorPhase(x, p);
      return .5 * (v.re * Math.cos(a) - v.im * Math.sin(a));
    });
    const indirect = list.slice(1).reduce((sum, v) => sum + v.amplitude * v.gate, 0);
    const phase = Math.atan2(phasor.im, phasor.re), directPhase = list[0].phase;
    const phaseBias = Math.atan2(Math.sin(phase - directPhase), Math.cos(phase - directPhase));
    const temporalSteps = p.source === 'point' ? p.n * p.rows : p.source === 'line' ? p.n : 1;
    const address = Math.min(temporalSteps - 1, Math.floor(p.scan * temporalSteps));
    const active = p.source === 'point' ? [Math.floor(address / p.rows), address % p.rows] : [address, receiver[1]];
    return { p, receiver, paths: list, phasor, referencePhase, correlation, trace, fringes,
      phaseBias, indirectAcceptance: p.indirect ? indirect / p.indirect : 0, temporalSteps, active };
  }
  const api = { C, TAU, defaults, length, scanned, location, sourcePhase, sensorPhase, sourceDistance, acceptance, paths, sumPaths, measure };
  if (typeof module !== 'undefined') module.exports = api;
  else root.HolographySetup = api;
})(globalThis);
