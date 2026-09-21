/* Orthonormal Haar analysis/synthesis. A local, exactly invertible supporting study. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.WaveletMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const SQRT2 = Math.SQRT2;
    function analysis(values) {
        const n = values.length;
        if (n < 2 || (n & (n - 1))) throw new RangeError('Haar analysis needs a power-of-two sample count.');
        let current = Array.from(values, Number);
        if (current.some(v => !Number.isFinite(v))) throw new TypeError('Samples must be finite.');
        const details = [];
        while (current.length > 1) {
            const next = [], detail = [];
            for (let i = 0; i < current.length; i += 2) {
                next.push((current[i] + current[i + 1]) / SQRT2);
                detail.push((current[i] - current[i + 1]) / SQRT2);
            }
            details.unshift(detail);
            current = next;
        }
        return { size: n, mean: current[0], details };
    }
    function synthesis(coefficients, retainedLevels = coefficients.details.length, edit = null) {
        let current = [coefficients.mean];
        const levels = Math.max(0, Math.min(coefficients.details.length, Math.floor(retainedLevels)));
        coefficients.details.forEach((row, level) => {
            const next = [];
            row.forEach((value, index) => {
                let detail = level < levels ? value : 0;
                if (edit && level === edit.level && index === edit.index) detail *= edit.gain;
                next.push((current[index] + detail) / SQRT2, (current[index] - detail) / SQRT2);
            });
            current = next;
        });
        return current;
    }
    function energy(values) { return values.reduce((sum, value) => sum + value * value, 0); }
    function coefficientEnergy(c) { return c.mean * c.mean + c.details.reduce((sum, row) => sum + energy(row), 0); }
    function support(level, index, size) {
        const width = size / 2 ** level;
        return { start: index * width, middle: (index + .5) * width, end: (index + 1) * width };
    }
    function trefoil(count = 256) {
        // Uniform TIME samples; a monotone phase warp changes speed without changing the closed curve.
        return Array.from({ length: count }, (_, i) => {
            const t = i / count, phase = 2 * Math.PI * t + .68 * Math.sin(2 * Math.PI * t);
            return { x: (2 + Math.cos(3 * phase)) * Math.cos(2 * phase) / 3, y: (2 + Math.cos(3 * phase)) * Math.sin(2 * phase) / 3 };
        });
    }
    function timedResample(points, timestamps, count = 256) {
        const valid = points.map((p, i) => ({ x: Number(p.x), y: Number(p.y), t: Number(timestamps?.[i]) }));
        if (valid.length < 2 || valid.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new TypeError('A path needs two or more finite points.');
        const timed = valid.every((p, i) => Number.isFinite(p.t) && (!i || p.t >= valid[i - 1].t)) && valid.at(-1).t > valid[0].t;
        if (!timed) valid.forEach((p, i) => { p.t = i; });
        const first = valid[0].t, span = valid.at(-1).t - first;
        let k = 0;
        const result = Array.from({ length: count }, (_, i) => {
            const t = first + span * i / (count - 1);
            while (k + 1 < valid.length - 1 && valid[k + 1].t <= t) k++;
            const a = valid[k], b = valid[k + 1], f = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 0;
            return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) };
        });
        const center = result.reduce((a, p) => ({ x: a.x + p.x / count, y: a.y + p.y / count }), { x: 0, y: 0 });
        const radius = Math.max(...result.map(p => Math.hypot(p.x - center.x, p.y - center.y)), 1e-12);
        return result.map(p => ({ x: (p.x - center.x) / radius, y: (p.y - center.y) / radius }));
    }
    return { analysis, synthesis, energy, coefficientEnergy, support, trefoil, timedResample };
});
