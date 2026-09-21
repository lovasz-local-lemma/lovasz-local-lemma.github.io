/* A supporting transform lab: static while idle, recomputed only after a control changes. */
(() => {
    'use strict';
    const root = document.getElementById('wavelet-lab');
    if (!root || !window.WaveletMath) return;
    const M = window.WaveletMath, N = 256;
    root.innerHTML = `
      <p class="wl-kicker">Supporting perspective · multiresolution curve editing</p>
      <h2>A frequency changes the whole curve. A wavelet can change one moment.</h2>
      <p class="wl-intro">STFT reveals how frequency content moves through time. Here, an exactly invertible Haar transform takes another route: retain broad motion, then add corrections on successively shorter time intervals. Select a tile and change its gain to see where that correction lives.</p>
      <div class="wl-controls">
        <label for="wl-levels">Retained detail scales <output id="wl-levels-label">8 / 8</output><input id="wl-levels" type="range" min="0" max="8" step="1" value="8"></label>
        <label for="wl-gain">Selected coefficient gain <output id="wl-gain-label">1.00 ×</output><input id="wl-gain" type="range" min="-2" max="3" step="0.05" value="1"></label>
        <div class="wl-actions"><button type="button" id="wl-mute">Mute selected</button><button type="button" id="wl-reset">Reset study</button><button type="button" id="wl-use-path" disabled>Use current drawing</button></div>
      </div>
      <div class="wl-views">
        <figure><canvas id="wl-curve" role="img" aria-label="Original timed path and its inverse Haar reconstruction"></canvas><figcaption id="wl-source">A trefoil traversed at changing speed · 256 uniform time samples.</figcaption></figure>
        <figure><canvas id="wl-traces" role="img" aria-label="Original and reconstructed x and y coordinates over time, with the selected coefficient interval highlighted"></canvas><figcaption>Keep the timing: x(t) and y(t), including slow turns and fast passages. The violet band is the selected coefficient’s entire support.</figcaption></figure>
      </div>
      <div class="wl-legend"><span style="--legend-color:#8f819f">Original samples</span><span style="--legend-color:#f0c657">Reconstructed curve / x(t)</span><span style="--legend-color:#7ee1c3">Reconstructed y(t)</span><span style="--legend-color:#ad91f4">Selected time interval</span></div>
      <figure class="wl-coefficients"><canvas id="wl-map" class="wl-scale-map" role="img" aria-label="Eight dyadic scales of Haar detail coefficients; click a tile to select its time interval"></canvas><figcaption>Each row halves the time support. Brightness encodes the vector coefficient magnitude √(dₓ² + dᵧ²), with a logarithmic display scale. Grey rows are omitted from reconstruction. Click a tile or use the controls below.</figcaption></figure>
      <div class="wl-controls"><div class="wl-actions"><button type="button" data-wl-step="broad">Broader interval</button><button type="button" data-wl-step="fine">Finer interval</button><button type="button" data-wl-step="previous">Earlier interval</button><button type="button" data-wl-step="next">Later interval</button></div></div>
      <p class="wl-selection" id="wl-selection" aria-live="polite"></p>
      <div class="wl-metrics"><div class="wl-metric"><output id="wl-count"></output><small>Retained coefficients per coordinate</small></div><div class="wl-metric"><output id="wl-error"></output><small>RMS position error · normalized path units</small></div><div class="wl-metric"><output id="wl-energy"></output><small>Reconstructed / original sample energy</small></div></div>
      <details><summary>Why this reconstructs exactly — and why the coarse curve has corners</summary>
        <p>At every scale, pairs become one average and one difference. Dividing by √2 makes this an orthonormal change of basis: the sum of squared coefficients equals the sum of squared samples. Keep every coefficient at gain 1 and the inverse recovers every sampled position, up to floating-point error.</p>
        <p class="wl-formula">a = (x₀ + x₁) / √2 &nbsp; d = (x₀ − x₁) / √2<br>x₀ = (a + d) / √2 &nbsp; x₁ = (a − d) / √2</p>
        <p>A Haar detail is positive on the first half of its interval and negative on the second, and zero elsewhere. Its compact support makes the locality visible, but the basis is piecewise constant. Removing fine scales creates repeated positions and sharp transitions; joining those samples on screen does not turn it into a smooth spline. A smooth wavelet basis would make a different tradeoff.</p>
        <p>This is a fixed wavelet basis, with no frequency-tracking claim. STFT remains the main tool here for seeing the changing frequency content of a drawn gesture. This companion asks what changes when the representation is organized by scale and local time instead.</p>
        <a href="https://grail.cs.washington.edu/projects/wavelets/article/" target="_blank" rel="noopener">Wavelets for Computer Graphics · Stollnitz, DeRose &amp; Salesin ↗</a>
      </details>`;
    const $ = selector => root.querySelector(selector);
    const state = { points: M.trefoil(N), levels: 8, selected: { level: 3, index: 2 }, gain: 1, source: 'A trefoil traversed at changing speed · 256 uniform time samples.' };
    let coeffX, coeffY, originalX, originalY, x, y, lastPath = null, frame = 0, visible = false;
    const colors = { background: '#111020', grid: '#343044', text: '#c4b8d0', gold: '#f0c657', mint: '#7ee1c3', violet: '#ad91f4', original: '#8f819f' };
    const line = (ctx, values, map, color, width = 1.5) => {
        ctx.beginPath(); values.forEach((value, i) => { const p = map(value, i); i ? ctx.lineTo(...p) : ctx.moveTo(...p); });
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    };
    function prepare(canvas) {
        const width = canvas.clientWidth, height = canvas.clientHeight, ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        if (!width || !height) return null;
        const pw = Math.round(width * ratio), ph = Math.round(height * ratio);
        if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
        const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.fillStyle = colors.background; ctx.fillRect(0, 0, width, height); ctx.font = '11px ui-monospace,monospace';
        return { ctx, width, height };
    }
    function rebuild() {
        originalX = state.points.map(p => p.x); originalY = state.points.map(p => p.y);
        coeffX = M.analysis(originalX); coeffY = M.analysis(originalY); update();
    }
    function update() {
        const edit = { ...state.selected, gain: state.gain };
        x = M.synthesis(coeffX, state.levels, edit); y = M.synthesis(coeffY, state.levels, edit);
        const error = Math.sqrt(x.reduce((sum, v, i) => sum + (v - originalX[i]) ** 2 + (y[i] - originalY[i]) ** 2, 0) / N);
        const energy = (M.energy(x) + M.energy(y)) / Math.max(1e-16, M.energy(originalX) + M.energy(originalY));
        $('#wl-levels-label').textContent = `${state.levels} / 8`;
        $('#wl-gain-label').textContent = `${state.gain.toFixed(2)} ×`;
        $('#wl-count').textContent = `${2 ** state.levels} / ${N}`;
        $('#wl-error').textContent = error < 1e-12 ? '< 10⁻¹²' : error.toFixed(4);
        $('#wl-energy').textContent = `${(100 * energy).toFixed(2)}%`;
        $('#wl-source').textContent = state.source;
        const { level, index } = state.selected, intervals = 2 ** level;
        $('#wl-selection').textContent = `Scale ${level + 1} · interval ${index + 1}/${intervals} · ${(100 * index / intervals).toFixed(1)}–${(100 * (index + 1) / intervals).toFixed(1)}% of the gesture. ${level >= state.levels ? 'This scale is currently omitted; retain more scales to see the effect of its gain.' : 'Only these time samples can move when this coefficient changes.'}`;
        schedule();
    }
    function drawCurve() {
        const c = prepare($('#wl-curve')); if (!c) return;
        const { ctx, width: w, height: h } = c, radius = Math.min(w - 36, h - 34) / 2;
        const extent = Math.max(1.05, ...x.map((v, i) => Math.hypot(v, y[i]))) * 1.06;
        const point = (px, py) => [w / 2 + px * radius / extent, h / 2 - py * radius / extent];
        ctx.strokeStyle = colors.grid; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(w / 2, 15); ctx.lineTo(w / 2, h - 15); ctx.moveTo(15, h / 2); ctx.lineTo(w - 15, h / 2); ctx.stroke();
        line(ctx, originalX, (v, i) => point(v, originalY[i]), colors.original, 1.3);
        line(ctx, x, (v, i) => point(v, y[i]), colors.gold, 2);
        const support = M.support(state.selected.level, state.selected.index, N);
        line(ctx, x.slice(support.start, support.end), (v, i) => point(v, y[support.start + i]), colors.violet, 3);
        ctx.fillStyle = colors.gold;
        x.forEach((v, i) => { if (i % 8) return; const p = point(v, y[i]); ctx.beginPath(); ctx.arc(...p, 2.1, 0, 2 * Math.PI); ctx.fill(); });
        ctx.fillStyle = colors.text; ctx.fillText('Dots: equal time steps', 12, 19);
    }
    function drawTraces() {
        const c = prepare($('#wl-traces')); if (!c) return;
        const { ctx, width: w, height: h } = c, left = 35, right = w - 14, plotW = right - left, half = (h - 34) / 2;
        const s = M.support(state.selected.level, state.selected.index, N);
        ctx.fillStyle = '#a98be921'; ctx.fillRect(left + s.start / N * plotW, 12, (s.end - s.start) / N * plotW, h - 36);
        [[originalX, x, colors.gold, 'x(t)'], [originalY, y, colors.mint, 'y(t)']].forEach(([old, current, color, label], row) => {
            const center = 12 + half * (row + .5), scale = half * .36 / Math.max(1.1, ...old.map(Math.abs), ...current.map(Math.abs));
            ctx.strokeStyle = colors.grid; ctx.beginPath(); ctx.moveTo(left, center); ctx.lineTo(right, center); ctx.stroke();
            const map = (v, i) => [left + i / (N - 1) * plotW, center - v * scale];
            line(ctx, old, map, colors.original, 1.2); line(ctx, current, map, color, 1.8);
            ctx.fillStyle = color; ctx.fillText(label, 9, 18 + row * half);
        });
        ctx.fillStyle = colors.text; ctx.textAlign = 'center';
        [0, .25, .5, .75, 1].forEach(t => ctx.fillText(`${100 * t}%`, left + t * plotW, h - 10)); ctx.textAlign = 'left';
    }
    function mapGeometry(canvas) { return { left: 68, top: 14, width: Math.max(1, canvas.clientWidth - 82), rowHeight: (canvas.clientHeight - 39) / 8 }; }
    function drawMap() {
        const canvas = $('#wl-map'), c = prepare(canvas); if (!c) return;
        const { ctx, height: h } = c, g = mapGeometry(canvas);
        const largest = Math.max(...coeffX.details.flatMap((row, l) => row.map((v, i) => Math.hypot(v, coeffY.details[l][i]))), 1e-12);
        coeffX.details.forEach((row, level) => {
            const cellW = g.width / row.length, top = g.top + level * g.rowHeight;
            ctx.fillStyle = level < state.levels ? colors.text : '#726b81'; ctx.fillText(`2${['⁰','¹','²','³','⁴','⁵','⁶','⁷'][level]} bins`, 7, top + g.rowHeight * .6);
            row.forEach((v, i) => {
                const strength = Math.log1p(25 * Math.hypot(v, coeffY.details[level][i]) / largest) / Math.log(26), active = level < state.levels;
                const rgb = active ? [39 + 193 * strength, 29 + 149 * strength, 65 + 29 * strength] : [31 + 35 * strength, 29 + 32 * strength, 43 + 39 * strength];
                ctx.fillStyle = `rgb(${rgb.map(Math.round).join(',')})`;
                ctx.fillRect(g.left + i * cellW, top, Math.max(.5, cellW - (cellW > 4 ? 1 : .2)), g.rowHeight - 2);
                if (level === state.selected.level && i === state.selected.index) {
                    ctx.strokeStyle = colors.violet; ctx.lineWidth = 2; ctx.strokeRect(g.left + i * cellW + 1, top + 1, Math.max(1, cellW - 2), g.rowHeight - 4);
                }
            });
        });
        ctx.fillStyle = colors.text; ctx.textAlign = 'center';
        [0, .25, .5, .75, 1].forEach(t => ctx.fillText(`${100 * t}%`, g.left + t * g.width, h - 8)); ctx.textAlign = 'left';
    }
    function draw() { frame = 0; if (!visible || document.hidden) return; drawCurve(); drawTraces(); drawMap(); }
    function schedule() { if (visible && !document.hidden && !frame) frame = requestAnimationFrame(draw); }
    function select(level, index) {
        state.selected = { level: Math.max(0, Math.min(7, level)), index: 0 };
        state.selected.index = Math.max(0, Math.min(2 ** state.selected.level - 1, index));
        state.gain = 1; $('#wl-gain').value = '1'; update();
    }
    $('#wl-levels').addEventListener('input', e => { state.levels = Number(e.target.value); update(); });
    $('#wl-gain').addEventListener('input', e => { state.gain = Number(e.target.value); update(); });
    $('#wl-mute').addEventListener('click', () => { state.gain = state.gain === 0 ? 1 : 0; $('#wl-gain').value = String(state.gain); update(); });
    $('#wl-reset').addEventListener('click', () => {
        state.points = M.trefoil(N); state.levels = 8; state.gain = 1; state.selected = { level: 3, index: 2 };
        state.source = 'A trefoil traversed at changing speed · 256 uniform time samples.';
        $('#wl-levels').value = '8'; $('#wl-gain').value = '1'; rebuild();
    });
    $('#wl-use-path').addEventListener('click', () => {
        if (!lastPath) return;
        state.points = M.timedResample(lastPath.points, lastPath.timestamps, N);
        state.source = 'Your current gesture · normalized position · 256 uniform time samples, with endpoint samples retained.'; rebuild();
    });
    $('#wl-map').addEventListener('pointerdown', e => {
        const rect = e.currentTarget.getBoundingClientRect(), g = mapGeometry(e.currentTarget);
        const px = e.clientX - rect.left - g.left, py = e.clientY - rect.top - g.top, level = Math.floor(py / g.rowHeight);
        if (level < 0 || level > 7 || px < 0 || px > g.width) return;
        select(level, Math.floor(px / g.width * 2 ** level));
    });
    root.querySelectorAll('[data-wl-step]').forEach(button => button.addEventListener('click', () => {
        const { level, index } = state.selected;
        switch (button.dataset.wlStep) {
            case 'broad': if (level > 0) select(level - 1, Math.floor(index / 2)); break;
            case 'fine': if (level < 7) select(level + 1, index * 2); break;
            case 'previous': select(level, index - 1); break;
            case 'next': select(level, index + 1); break;
        }
    }));
    document.addEventListener('harmonics:path', e => {
        const points = e.detail?.points;
        if (!Array.isArray(points) || points.length < 2 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return;
        lastPath = { points: points.map(p => ({ x: p.x, y: p.y })), timestamps: e.detail.timestamps?.slice() };
        $('#wl-use-path').disabled = false;
    });
    new ResizeObserver(schedule).observe(root);
    new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        if (!visible && frame) { cancelAnimationFrame(frame); frame = 0; }
        schedule();
    }, { rootMargin: '100px' }).observe(root);
    document.addEventListener('visibilitychange', schedule);
    rebuild();
})();
