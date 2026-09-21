/* Uniform time samples are essential: mouse-event index is not elapsed time. */
const FrequencyMath = {
    motionPhase(phase, profile = 'expressive') {
        if (profile !== 'expressive') return phase;
        // The derivative is (1 + .85 cos θ)^2 / (1 + .85²/2): strictly
        // positive, periodic, and about 152 times faster at its peak than trough.
        const a = .85, theta = 2 * Math.PI * phase - Math.PI / 2;
        return phase + (a / Math.PI * (Math.sin(theta) + 1) + a * a / (8 * Math.PI) * Math.sin(2 * theta)) / (1 + a * a / 2);
    },
    indexSamples(points, count = 256, periodic = true) {
        if (!points.length) return [];
        return Array.from({ length: count }, (_, i) => {
            const u = periodic ? i * points.length / count : i * (points.length - 1) / (count - 1);
            const j = Math.floor(u), t = u - j, a = points[j], b = points[periodic ? (j + 1) % points.length : Math.min(j + 1, points.length - 1)];
            return { x: a.x * (1 - t) + b.x * t, y: a.y * (1 - t) + b.y * t };
        });
    },
    pathCoefficients(points) {
        const n = points.length;
        if (!n) return [];
        const re = Float64Array.from(points, p => p.x), im = Float64Array.from(points, p => p.y);
        this.fft(re, im);
        return Array.from({ length: n }, (_, k) => {
            const r = re[k] / n, j = im[k] / n;
            return { freq: k <= n / 2 ? k : k - n, re: r, im: j, amp: Math.hypot(r, j), phase: Math.atan2(j, r) };
        });
    },
    selectPathCoefficients(coefficients, budget, strategy = 'contiguous') {
        if (!coefficients.length) return [];
        const dc = coefficients.find(c => c.freq === 0), candidates = coefficients.filter(c => c.freq !== 0);
        candidates.sort(strategy === 'largest'
            ? (a, b) => b.amp - a.amp || Math.abs(a.freq) - Math.abs(b.freq) || a.freq - b.freq
            : (a, b) => Math.abs(a.freq) - Math.abs(b.freq) || a.freq - b.freq);
        // Keep the mean under both policies so a fair comparison retains translation.
        return [dc, ...candidates.slice(0, Math.max(0, budget - 1))].filter(Boolean);
    },
    spectralRms(coefficients, retained) {
        const selected = new Set(retained.map(c => c.freq));
        return Math.sqrt(coefficients.reduce((sum, c) => sum + (selected.has(c.freq) ? 0 : c.amp * c.amp), 0));
    },
    sineAnalysis(points) {
        // 257 samples give 255 interior degrees of freedom and a 512-sample
        // odd extension, allowing an exact DST-I through the cached radix-2 FFT.
        const samples = this.indexSamples(points, 257, false);
        if (!samples.length) return { samples: [], coefficients: [], first: { x: 0, y: 0 }, last: { x: 0, y: 0 } };
        const first = samples[0], last = samples.at(-1), re = new Float64Array(512), im = new Float64Array(512);
        for (let j = 1; j < 256; j++) {
            const x = samples[j].x - first.x * (1 - j / 256) - last.x * j / 256;
            const y = samples[j].y - first.y * (1 - j / 256) - last.y * j / 256;
            re[j] = x; im[j] = y; re[512 - j] = -x; im[512 - j] = -y;
        }
        this.fft(re, im);
        const coefficients = Array.from({ length: 255 }, (_, j) => {
            const k = j + 1, x = -im[k] / 256, y = re[k] / 256;
            return { freq: k, re: x, im: y, amp: Math.hypot(x, y) };
        });
        return { samples, coefficients, first, last };
    },
    reconstructSine(analysis, budget, count = 257) {
        const retained = analysis.coefficients.slice(0, budget);
        return Array.from({ length: count }, (_, i) => {
            const t = i / (count - 1), p = { x: analysis.first.x * (1 - t) + analysis.last.x * t, y: analysis.first.y * (1 - t) + analysis.last.y * t };
            for (const c of retained) { const s = Math.sin(Math.PI * c.freq * t); p.x += c.re * s; p.y += c.im * s; }
            return p;
        });
    },
    resample(points, timestamps, end, duration, count = 128, output) {
        if (!points.length || !timestamps.length) return [];
        let j = 0;
        const result = output && output.length === count ? output : Array.from({ length: count }, () => ({ x: 0, y: 0 }));
        for (let i = 0; i < count; i++) {
            const t = end - duration + duration * i / count;
            while (j + 1 < timestamps.length && timestamps[j + 1] <= t) j++;
            if (t <= timestamps[0] || j === points.length - 1) {
                const p = t <= timestamps[0] ? points[0] : points[j];
                result[i].x = p.x; result[i].y = p.y; continue;
            }
            const span = timestamps[j + 1] - timestamps[j];
            const u = span > 0 ? Math.max(0, Math.min(1, (t - timestamps[j]) / span)) : 0;
            result[i].x = points[j].x * (1 - u) + points[j + 1].x * u;
            result[i].y = points[j].y * (1 - u) + points[j + 1].y * u;
        }
        return result;
    },
    motionWorkspace(n = 128) {
        return { re: new Float64Array(n), im: new Float64Array(n),
            windowed: Array.from({ length: n }, () => ({ x: 0, y: 0 })),
            hann: Float64Array.from({ length: n }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / n)),
            coefficients: Array.from({ length: n }, () => ({ freq: 0, re: 0, im: 0, amp: 0, phase: 0 })) };
    },
    motionCoefficients(points, limit, workspace) {
        const n = points.length;
        if (!n) return [];
        const w = workspace && workspace.re.length === n ? workspace : this.motionWorkspace(n);
        let mx = 0, my = 0;
        for (const p of points) { mx += p.x / n; my += p.y / n; }
        for (let i = 0; i < n; i++) {
            w.re[i] = (points[i].x - mx) * w.hann[i];
            w.im[i] = (points[i].y - my) * w.hann[i];
            w.windowed[i].x = mx + w.re[i]; w.windowed[i].y = my + w.im[i];
        }
        this.fft(w.re, w.im);
        const maxK = Math.min(limit, Math.floor((n - 1) / 2));
        const result = [];
        for (let k = -maxK; k <= maxK; k++) {
            const j = (k + n) % n, coefficient = w.coefficients[j];
            const re = w.re[j] / n + (k === 0 ? mx : 0), im = w.im[j] / n + (k === 0 ? my : 0);
            Object.assign(coefficient, { freq: k, re, im, amp: Math.hypot(re, im), phase: Math.atan2(im, re) });
            result.push(coefficient);
        }
        return result.sort((a, b) => b.amp - a.amp);
    },
    // Invert overlapping Hann-windowed complex x+iy frames, retaining EVERY
    // bin. Analysis and synthesis each apply Hann; divide by summed Hann².
    // Zero extension gives complete coverage at both finite-buffer endpoints.
    // This recovers sampled data, not unknown motion between pointer events.
    recoverMotion(points, size = 128, hop = size / 2) {
        if (size < 2 || (size & (size - 1)) || !Number.isInteger(hop) || hop < 1 || hop >= size)
            throw new Error('Use power-of-two frames and an overlapping integer hop.');
        const n = points.length, sums = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
        const weights = new Float64Array(n), hann = this.motionWorkspace(size).hann;
        for (let start = -size + hop; start < n; start += hop) {
            const frame = Array.from({ length: size }, (_, j) => {
                const p = points[start + j]; return { x: (p?.x || 0) * hann[j], y: (p?.y || 0) * hann[j] };
            });
            const decoded = this.reconstruct(this.pathCoefficients(frame), size);
            for (let j = 0; j < size; j++) {
                const i = start + j; if (i < 0 || i >= n) continue;
                sums[i].x += decoded[j].x * hann[j]; sums[i].y += decoded[j].y * hann[j];
                weights[i] += hann[j] * hann[j];
            }
        }
        return sums.map((p, i) => {
            if (!(weights[i] > 0)) throw new Error('Reconstruction window leaves an uncovered sample.');
            return { x: p.x / weights[i], y: p.y / weights[i] };
        });
    },
    // Inverse FFT builds the entire retained reconstruction once per analysis update.
    reconstruct(coefficients, count = 128) {
        const re = new Float64Array(count), im = new Float64Array(count);
        for (const c of coefficients) {
            const k = (c.freq + count) % count;
            re[k] += c.re; im[k] -= c.im;
        }
        this.fft(re, im);
        return Array.from({ length: count }, (_, i) => ({ x: re[i], y: -im[i] }));
    },
    fftPlans: new Map(),
    // Radix-2 FFT. Spectrogram windows are power-of-two lengths at 64 samples/s.
    fft(re, im) {
        const n = re.length;
        if (n < 1 || (n & (n - 1))) throw new Error('FFT length must be a power of two.');
        let plan = this.fftPlans.get(n);
        if (!plan) {
            plan = { c: Float64Array.from({ length: n / 2 }, (_, i) => Math.cos(-2 * Math.PI * i / n)),
                s: Float64Array.from({ length: n / 2 }, (_, i) => Math.sin(-2 * Math.PI * i / n)) };
            this.fftPlans.set(n, plan);
        }
        for (let i = 1, j = 0; i < n; i++) {
            let bit = n >> 1;
            for (; j & bit; bit >>= 1) j ^= bit;
            j ^= bit;
            if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
        }
        for (let len = 2; len <= n; len *= 2) {
            for (let start = 0; start < n; start += len) {
                for (let j = 0; j < len / 2; j++) {
                    const c = plan.c[j * n / len], s = plan.s[j * n / len];
                    const a = start + j, b = a + len / 2;
                    const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c;
                    re[b] = re[a] - tr; im[b] = im[a] - ti;
                    re[a] += tr; im[a] += ti;
                }
            }
        }
    },
    signal(kind, t) {
        if (kind === 'tones') return .5 * Math.sin(2 * Math.PI * 5 * t) + .5 * Math.sin(2 * Math.PI * 6 * t);
        if (kind === 'burst') return t >= 3.75 && t < 4.25 ? Math.sin(2 * Math.PI * 9 * t) : 0;
        // Phase integral: instantaneous frequency increases from 3 to 15 Hz over 8 s.
        return Math.sin(2 * Math.PI * (3 * t + .75 * t * t));
    },
    spectrum(kind, center, seconds, sampleRate = 64) {
        const n = Math.round(seconds * sampleRate);
        if (n < 2 || (n & (n - 1))) throw new Error('Use a power-of-two window length.');
        const re = new Float64Array(n), im = new Float64Array(n);
        let gain = 0;
        for (let i = 0; i < n; i++) {
            const w = .5 - .5 * Math.cos(2 * Math.PI * i / n);
            gain += w;
            re[i] = w * this.signal(kind, center - seconds / 2 + i / sampleRate);
        }
        this.fft(re, im);
        return Array.from({ length: n / 2 + 1 }, (_, k) => ({
            hz: k / seconds, amplitude: Math.hypot(re[k], im[k]) * (k === 0 || k === n / 2 ? 1 : 2) / gain
        }));
    }
};
if (typeof module !== 'undefined') module.exports = FrequencyMath;
