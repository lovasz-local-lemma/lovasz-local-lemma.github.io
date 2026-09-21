// BalanceForge — utilities and shared namespace
// All modules attach to window.BF.

window.BF = window.BF || {};

(function (BF) {
  'use strict';

  // ---- RNG with optional seed ----
  // A seed of 0 is a VALID SEED, not an absent one. This used to read
  // `(seed >>> 0) || ((Math.random() * 0xffffffff) >>> 0)`, where 0 is falsy —
  // so anything seeded 0 silently reseeded itself from Math.random() and became
  // unreproducible. trainer.makeTrainer deliberately preserves a 0 seed
  // (`opts.seed != null`, with a comment saying so) and then handed it here to
  // be thrown away. It also struck by ACCIDENT: app.js, diffsim_mode.js and
  // dodge_patterns.js all DERIVE their seed by XOR and can land on 0 by chance,
  // and setups.js carried a bare `|| 1` at its own call site to dodge it.
  // Only null/undefined mean "no seed" now; every other value goes through
  // `>>> 0` exactly as before, so no existing seeded stream changes.
  function makeRng(seed) {
    let s = (seed == null) ? ((Math.random() * 0xffffffff) >>> 0) : (seed >>> 0);
    return {
      // Mulberry32 — fast, decent quality
      next() {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      range(min, max) { return min + (max - min) * this.next(); },
      int(maxExclusive) { return Math.floor(this.next() * maxExclusive); },
      gauss(mean, stddev) {
        // Box-Muller
        const u1 = Math.max(this.next(), 1e-12);
        const u2 = this.next();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + stddev * z;
      },
      pick(arr) { return arr[Math.floor(this.next() * arr.length)]; },
      proba(p) { return this.next() < p; },
      seed(value) { s = (value >>> 0) || 1; },
    };
  }

  // ---- HiDPI canvas sizing ----
  function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { dpr, cssW: rect.width, cssH: rect.height };
  }

  // ---- math helpers ----
  const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const sign = v => v < 0 ? -1 : v > 0 ? 1 : 0;
  // O(1) angle wrap to [-π, π]. The old while-subtract loop hung FOREVER on
  // an Infinity input (Infinity - 2π === Infinity) — a diverged simulation
  // could freeze the main thread. The modulo form costs one round() and maps
  // Infinity/NaN to NaN, which propagates visibly instead of hanging.
  const wrapAngle = a => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

  // ---- color helpers ----
  function lerpColor(a, b, t) {
    return [
      Math.round(lerp(a[0], b[0], t)),
      Math.round(lerp(a[1], b[1], t)),
      Math.round(lerp(a[2], b[2], t)),
    ];
  }
  function rgba(c, alpha) {
    return `rgba(${c[0]},${c[1]},${c[2]},${alpha == null ? 1 : alpha})`;
  }
  // Map a value in [-1, 1] to a red→gray→green color.
  function signedColor(v) {
    const t = clamp(v, -1, 1);
    const grey = [110, 116, 138];
    const pos = [108, 226, 138];
    const neg = [255, 102, 128];
    if (t >= 0) return lerpColor(grey, pos, t);
    return lerpColor(grey, neg, -t);
  }

  // Smooth/exponential moving average helper.
  function ema(prev, next, alpha) {
    if (prev == null || !isFinite(prev)) return next;
    return prev + alpha * (next - prev);
  }

  // ---- Telemetry ring buffer ----
  function ringBuffer(capacity) {
    const data = new Float32Array(capacity);
    let length = 0, head = 0;
    return {
      push(v) {
        data[head] = v;
        head = (head + 1) % capacity;
        if (length < capacity) length++;
      },
      get length() { return length; },
      get capacity() { return capacity; },
      // Iterate oldest → newest.
      forEach(fn) {
        const start = length < capacity ? 0 : head;
        for (let i = 0; i < length; i++) {
          const idx = (start + i) % capacity;
          fn(data[idx], i);
        }
      },
      last() {
        if (length === 0) return 0;
        const idx = (head - 1 + capacity) % capacity;
        return data[idx];
      },
      reset() { length = 0; head = 0; },
    };
  }

  function fmt(v, digits) {
    if (digits == null) digits = 2;
    if (!isFinite(v)) return '—';
    return v.toFixed(digits);
  }

  function nowMs() { return performance.now(); }

  function clampStartAngle(angle, direction) {
    if (direction === 'left') angle = Math.min(0, angle);
    if (direction === 'right') angle = Math.max(0, angle);
    return Math.max(-Math.PI, Math.min(Math.PI, angle));
  }

  // Accumulate fractional simulation time across display frames. Discard an
  // excessive backlog after a stalled tab; never invent a step at high refresh.
  function fixedStepCount(clock, elapsedSeconds, dt, maxSteps) {
    if (!(dt > 0) || !Number.isFinite(elapsedSeconds)) return 0;
    const budget = Math.min(Math.max(0, elapsedSeconds) + (clock.remainder || 0), dt * maxSteps);
    const steps = Math.min(maxSteps, Math.floor((budget + dt * 1e-9) / dt));
    clock.remainder = Math.max(0, budget - steps * dt);
    return steps;
  }

  BF.util = {
    makeRng, fitCanvas, clamp, lerp, sign, wrapAngle,
    lerpColor, rgba, signedColor, ema, ringBuffer, fmt, nowMs, fixedStepCount, clampStartAngle,
  };
})(window.BF);
