/* An on-demand instrument: no idle animation, no hidden simulation loop. */
(() => {
    const root = document.getElementById('window-microscope');
    const kind = root.querySelector('#frequency-signal');
    const duration = root.querySelector('#frequency-window');
    const cache = new Map();
    const palettes = [ [74, 158, 255], [244, 208, 63] ];
    function draw() {
        const long = Number(duration.value), durations = [long / 4, long];
        root.querySelector('#frequency-readout').textContent = `Same signal · 64 samples/s · Hann windows · bin spacing 1/T (not a guarantee of resolving two peaks)`;
        root.querySelectorAll('canvas').forEach((canvas, index) => {
            const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
            const T = durations[index], key = `${kind.value}:${T}`;
            if (!cache.has(key)) cache.set(key, Array.from({length: 160}, (_, c) => FrequencyMath.spectrum(kind.value, c * 8 / 159, T)));
            const spectra = cache.get(key), left = 40, top = 14, plotW = w - 53, plotH = h - 44;
            ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, w, h);
            for (let c = 0; c < spectra.length; c++) {
                for (let row = 0; row < 100; row++) {
                    const hz = row * 20 / 99, k = Math.round(hz * T);
                    const amp = spectra[c][k]?.amplitude || 0;
                    const intensity = Math.max(0, Math.min(1, (20 * Math.log10(Math.max(amp, .001)) + 50) / 50));
                    const color = palettes[index].map(v => Math.round(11 + (v - 11) * intensity));
                    ctx.fillStyle = `rgb(${color.join(',')})`;
                    ctx.fillRect(left + c * plotW / 160, top + plotH - (row + 1) * plotH / 100, plotW / 160 + .4, plotH / 100 + .4);
                }
            }
            ctx.font = '12px system-ui'; ctx.fillStyle = '#c2cedc';
            ctx.textAlign = 'right';
            [0, 5, 10, 15, 20].forEach(hz => ctx.fillText(`${hz}`, left - 8, top + plotH - hz * plotH / 20 + 4));
            ctx.textAlign = 'center';
            [0, 2, 4, 6, 8].forEach(t => ctx.fillText(`${t}s`, left + t * plotW / 8, h - 11));
            ctx.textAlign = 'left'; ctx.fillText('Hz', 6, 13);
            canvas.parentElement.querySelector('figcaption').textContent = `${index ? 'Long' : 'Short'} window · ${T}s · ${T * 64} samples · Δf = ${(1 / T).toFixed(2)} Hz`;
        });
        root.querySelector('#frequency-insight').textContent = {
            tones: 'Two nearby tones, 5 and 6 Hz. A longer window separates their peaks more clearly. With the short window their Hann lobes overlap; adding display pixels cannot recover the missing frequency resolution.',
            burst: 'A 9 Hz tone lasts only half a second. The short window localizes its start and stop; the long window spreads its energy across neighboring times. A narrow frequency band does not imply a precisely timed event.',
            chirp: 'The tone sweeps from 3 to 15 Hz. A long window contains more of the changing pitch at once: its frequency trace broadens even though the FFT bins are finer. Resolution depends on the signal as well as the window.'
        }[kind.value];
    }
    kind.addEventListener('change', draw);
    duration.addEventListener('change', draw);
    // The microscope is below the main instrument: compute its two spectra on arrival.
    const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { draw(); observer.disconnect(); }
    }, { rootMargin: '120px' });
    observer.observe(root);
})();
