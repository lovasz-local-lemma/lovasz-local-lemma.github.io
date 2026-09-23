/* Two physical white-light sources, sampled before and spatially resolved after a prism. */
(() => {
    'use strict';
    const M = window.SpectrumModel, T = window.SpectrumTransport;
    const root = document.getElementById('spectrum-lesson');
    if (!root || !M || !T) return;
    const byId = id => document.getElementById(id);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sources = [M.presets.find(p => p.id === 'broad'), M.presets.find(p => p.id === 'bands')];
    const state = {angle: 0, ior: 1.5, energyShading: true, running: !reducedMotion.matches, visible: true, time: 0};
    let frame = null, lastTime = null, scenes = [];
    const detectorGrid = {yMin: T.geometry.screenYMin, yMax: T.geometry.screenHeight, bins: 264};
    const detectorExposure = 10;

    function displayedColor(xyz) {
        return M.toneMappedRGB(xyz, detectorExposure).map(v => Math.round(v * 255));
    }

    function unshadedColor(rgb) {
        const peak = Math.max(...rgb);
        if (!(peak > 0)) return [0, 0, 0];
        return rgb.map(value => Math.round(255 * Math.max(0, Math.min(1, value / peak))));
    }

    function wavelengthPackets(packets) {
        const peak = Math.max(...packets.map(packet => packet.power));
        // An explicitly illustrative view: keep source bands separate instead
        // of amplifying their near-zero Gaussian tails into a continuous source.
        return packets.filter(packet => packet.power >= peak * 0.01).map(packet => {
            const rgb = M.labelSpectrumColor(packet.wavelength);
            // Display labels are kept separate from the physical XYZ responses.
            return {...packet, labelRGB: rgb.map(value => value * packet.power)};
        });
    }

    // Cache the outgoing light field when a control changes. Every cross-section
    // integrates the same finite-width ray packets as the detector. In particular,
    // the final image column and the wall use the very same profile and colors.
    function outgoingField(packets) {
        const canvas = document.createElement('canvas');
        canvas.width = 600; canvas.height = 300;
        const ctx = canvas.getContext('2d'), image = ctx.createImageData(600, 300);
        const firstX = Math.floor(Math.min(...packets.flatMap(packet => packet.edges.map(edge => edge.points[2][0]))));
        const visualPackets = state.energyShading ? packets : wavelengthPackets(packets);
        const grid = {...detectorGrid, contributionField: state.energyShading ? 'xyz' : 'labelRGB'};
        let wall = null;
        for (let x = firstX; x < T.geometry.screenX; x++) {
            const profile = T.projectPackets(visualPackets, x + 1, grid);
            for (const bin of profile.bins) {
                const rgb = state.energyShading ? displayedColor(bin.xyz) : unshadedColor(bin.labelRGB);
                const brightness = Math.max(...rgb);
                if (!brightness) continue;
                const row = Math.floor(bin.y), index = (row * 600 + x) * 4;
                image.data[index] = rgb[0];
                image.data[index + 1] = rgb[1];
                image.data[index + 2] = rgb[2];
                image.data[index + 3] = 255;
            }
            if (x + 1 === T.geometry.screenX) wall = state.energyShading ? profile : T.projectPackets(packets, T.geometry.screenX, detectorGrid);
        }
        // The wall is a literal continuation of the fan's last column. This
        // also gives both sides of the junction identical raster sampling.
        for (let y = detectorGrid.yMin; y < detectorGrid.yMax; y++) {
            const index = (y * 600 + T.geometry.screenX - 1) * 4;
            const pixel = image.data.slice(index, index + 4);
            for (let x = T.geometry.screenX; x < T.geometry.screenX + 15; x++) {
                image.data.set(pixel, (y * 600 + x) * 4);
            }
        }
        ctx.putImageData(image, 0, 0);
        return {canvas, pixels: image.data, wall};
    }

    function line(ctx, points, color, width = 1, alpha = 1) {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = alpha;
        ctx.beginPath();
        points.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
        ctx.stroke(); ctx.globalAlpha = 1;
    }
    function pathPoint(points, fraction) {
        const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
        let left = lengths.reduce((a, b) => a + b, 0) * fraction;
        for (let i = 0; i < lengths.length; i++) {
            if (left <= lengths[i]) return [
                points[i][0] + (points[i + 1][0] - points[i][0]) * left / lengths[i],
                points[i][1] + (points[i + 1][1] - points[i][1]) * left / lengths[i], i];
            left -= lengths[i];
        }
        return [...points.at(-1), lengths.length - 1];
    }
    function buildScene(source) {
        const rays = M.wavelengths.map((w, i) => ({w, power: source.power[i],
            points: T.trace(w, state.angle, 0, state.ior).points}));
        const total = source.power.reduce((a, b) => a + b, 0);
        let sum = 0;
        const cdf = source.power.map(p => sum += p / total);
        const particles = Array.from({length: 38}, (_, i) => {
            const index = cdf.findIndex(v => v >= ((i + 0.5) * 0.61803398875) % 1);
            return {ray: rays[Math.max(0, index)], offset: i / 38};
        });
        const packets = T.spectralPackets(source.power, state.angle,
            {beamHalfWidth: 0.6, wavelengthSamples: 10, referenceIOR: state.ior});
        const field = outgoingField(packets);
        const detector = field.wall;
        detector.lostXYZ = M.xyz(source.power).map((v, i) => Math.max(0, v - detector.collectedXYZ[i]));
        return {source, rays, particles, detector, field};
    }
    function inputDetector(ctx, scene) {
        const color = M.color(scene.source.power);
        const [origin, entrance] = scene.rays[0].points;
        const sampleX = 110;
        const sampleY = origin[1] + (entrance[1] - origin[1]) * (sampleX - origin[0]) / (entrance[0] - origin[0]);
        // A sampling callout to the incoming beam, rather than an opaque stop in its path.
        ctx.setLineDash([3, 4]);
        line(ctx, [[sampleX, sampleY - 7], [sampleX, 101]], '#c7d5cc', 1, 0.5);
        ctx.setLineDash([]);
        ctx.fillStyle = '#101b20'; ctx.fillRect(22, 36, 167, 65);
        ctx.strokeStyle = '#8aaba96b'; ctx.lineWidth = 1; ctx.strokeRect(22.5, 36.5, 167, 65);
        ctx.fillStyle = '#b9c7c7'; ctx.font = '11px system-ui'; ctx.fillText('INPUT DETECTOR', 33, 52);
        ctx.shadowBlur = 11; ctx.shadowColor = color; ctx.fillStyle = color; ctx.fillRect(34, 61, 29, 28); ctx.shadowBlur = 0;
        ctx.fillStyle = '#edf0e8'; ctx.font = '13px system-ui'; ctx.fillText('White', 76, 71);
        ctx.font = '9px system-ui'; ctx.fillStyle = '#a9c0b8'; ctx.fillText('same color + brightness', 76, 88);
    }
    function sourceSpectrum(ctx, scene) {
        const peak = Math.max(...scene.source.power), left = 31, top = 222, width = 150, height = 43;
        const baseline = top + height, yAt = value => baseline - value / peak * height * 0.83;
        ctx.fillStyle = '#afc3bd'; ctx.font = '10px system-ui'; ctx.fillText('RELATIVE SPECTRAL POWER', left - 7, top - 10);
        const spectralFill = ctx.createLinearGradient(left, 0, left + width, 0);
        M.wavelengths.forEach(w => spectralFill.addColorStop((w - 380) / 400, M.wavelengthColor(w)));
        ctx.fillStyle = spectralFill; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(left, baseline);
        scene.source.power.forEach((p, i) => ctx.lineTo(left + i * width / (M.wavelengths.length - 1), yAt(p)));
        ctx.lineTo(left + width, baseline); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
        line(ctx, [[left, top - 1], [left, baseline], [left + width, baseline]], '#b0c5bd', 1, 0.65);
        ctx.fillStyle = '#a9bbb4'; ctx.font = '9px system-ui'; ctx.fillText('0', left - 10, baseline + 3);
        ctx.fillText('1', left - 10, yAt(peak) + 3);
        for (let i = 0; i < M.wavelengths.length - 1; i++) {
            const x = left + i * width / (M.wavelengths.length - 1);
            const y = yAt(scene.source.power[i]);
            const nextY = yAt(scene.source.power[i + 1]);
            line(ctx, [[x, y], [x + width / (M.wavelengths.length - 1), nextY]], M.wavelengthColor(M.wavelengths[i]), 2);
        }
        ctx.fillStyle = '#a0b3ac'; ctx.font = '9px system-ui'; ctx.fillText('380 nm', left, baseline + 14);
        ctx.textAlign = 'right'; ctx.fillText('780 nm', left + width, baseline + 14); ctx.textAlign = 'left';
    }
    function drawScene(id, scene) {
        const canvas = byId(id), ctx = canvas.getContext('2d');
        const backingWidth = Math.round(Math.max(600, canvas.clientWidth) * Math.min(window.devicePixelRatio || 1, 2));
        if (canvas.width !== backingWidth) {
            canvas.width = backingWidth;
            canvas.height = Math.round(backingWidth / 2);
        }
        ctx.setTransform(canvas.width / 600, 0, 0, canvas.height / 300, 0, 0);
        ctx.clearRect(0, 0, 600, 300);
        const field = ctx.createRadialGradient(330, 154, 15, 330, 154, 350);
        field.addColorStop(0, '#172930'); field.addColorStop(1, '#070d12');
        ctx.fillStyle = field; ctx.fillRect(0, 0, 600, 300);
        for (let x = 20; x < 600; x += 40) line(ctx, [[x, 0], [x, 300]], '#7eaba0', 1, 0.035);
        for (let y = 20; y < 300; y += 40) line(ctx, [[0, y], [600, y]], '#7eaba0', 1, 0.035);

        const polygon = T.vertices(state.angle), sourceColor = M.color(scene.source.power);
        ctx.beginPath(); polygon.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath();
        const glass = ctx.createLinearGradient(
            Math.min(...polygon.map(p => p[0])), Math.min(...polygon.map(p => p[1])),
            Math.max(...polygon.map(p => p[0])), Math.max(...polygon.map(p => p[1])));
        glass.addColorStop(0, '#a3d3e42d'); glass.addColorStop(0.5, '#527a8515'); glass.addColorStop(1, '#b3e0dd38');
        ctx.fillStyle = glass; ctx.fill(); ctx.strokeStyle = '#a8d9da9e'; ctx.lineWidth = 1.6; ctx.stroke();

        const peak = Math.max(...scene.source.power);
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, T.geometry.screenX, 300); ctx.clip();
        // Fill the intervals between traced wavelengths, instead of stacking
        // thick strokes whose draw order hides the colors between red/green/blue.
        // The same power-dependent opacity leaves gaps between the narrow bands.
        for (let i = 0; i < scene.rays.length - 1; i++) {
            const first = scene.rays[i], next = scene.rays[i + 1];
            const strength = Math.sqrt((first.power + next.power) / (2 * peak));
            if (strength < 0.025 || first.points.length !== 4 || next.points.length !== 4) continue;
            const color = M.wavelengthColor((first.w + next.w) / 2);
            ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 0.4;
            ctx.globalAlpha = 0.8 * strength;
            ctx.beginPath(); ctx.moveTo(...first.points[1]);
            ctx.lineTo(...first.points[2]); ctx.lineTo(...next.points[2]);
            ctx.lineTo(...next.points[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const incoming = scene.rays[0].points.slice(0, 2);
        line(ctx, incoming, sourceColor, 16, 0.035);
        line(ctx, incoming, sourceColor, 8, 0.12);
        line(ctx, incoming, sourceColor, 1.4, 0.95);
        for (const particle of scene.particles) {
            const point = pathPoint(particle.ray.points, (particle.offset + state.time * 0.105) % 1);
            if (point[2] === 2) {
                if (point[0] >= T.geometry.screenX - 8) continue;
                const index = (Math.floor(point[1]) * 600 + Math.floor(point[0])) * 4;
                const pixels = scene.field.pixels, alpha = pixels[index + 3] / 255;
                if (!(alpha > 0.1)) continue;
                ctx.fillStyle = `rgb(${[0, 1, 2].map(c => Math.round(pixels[index + c] * alpha)).join(',')})`;
            } else ctx.fillStyle = point[2] ? M.wavelengthColor(particle.ray.w) : sourceColor;
            ctx.globalAlpha = 0.85;
            ctx.beginPath(); ctx.arc(point[0], point[1], 1.65, 0, 2 * Math.PI); ctx.fill();
        }
        ctx.globalAlpha = 1; ctx.restore();

        // Light adds to the dark diagram background; faint spectral tails must
        // not paint opaque black shadows. Use this same blend for fan AND wall.
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        ctx.drawImage(scene.field.canvas, 0, 0); ctx.restore();
        const wallX = T.geometry.screenX;
        // Leave the entrance edge open: a frame here would visually sever the
        // beam from its readout or hide its actual point of arrival.
        line(ctx, [[wallX, 36], [581, 36], [581, 300], [wallX, 300]], '#94b5b866', 1);
        for (let y = 55; y < 300; y += 20) line(ctx, [[582, y], [586, y]], '#a4bbb0', 1, 0.6);
        ctx.fillStyle = '#c6d4cf'; ctx.font = '11px system-ui';
        ctx.textAlign = 'right'; ctx.fillText('WALL DETECTOR', 585, 23); ctx.textAlign = 'left';
        ctx.fillText('WHITE BEAM', T.geometry.source[0], T.geometry.source[1] - 22);
        const angleLabel = `${state.angle > 0 ? '+' : ''}${state.angle}°`;
        ctx.fillStyle = '#c4d6d3'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
        const center = T.geometry.center;
        ctx.fillText('PRISM', center[0], center[1] + 20); ctx.font = '11px system-ui';
        ctx.fillText(`${angleLabel} · n ${state.ior.toFixed(2)}`, center[0], center[1] + 37); ctx.textAlign = 'left';
        inputDetector(ctx, scene); sourceSpectrum(ctx, scene);
    }
    function paint() {
        if (scenes.length) {
            drawScene('source-a-path', scenes[0]); drawScene('source-b-path', scenes[1]);
        }
    }
    function update() {
        scenes = sources.map(buildScene);
        byId('prism-angle-value').textContent = `${state.angle}°`;
        byId('prism-ior-value').textContent = state.ior.toFixed(2);
        byId('energy-shading').checked = state.energyShading;
        byId('energy-shading-hint').textContent = state.energyShading
            ? 'On: brightness includes energy and eye sensitivity.'
            : 'Off: bright wavelength colors; brightness is illustrative.';
        byId('spectrum-color-note').textContent = state.energyShading
            ? 'Outgoing light and wall share one color model; faint spectral ends fade in both.'
            : 'Outgoing light and wall use bright wavelength colors, with energy shading removed.';
        byId('lesson-pause').textContent = state.running ? 'Pause motion' : 'Animate light';
        byId('lesson-pause').setAttribute('aria-pressed', String(!state.running));
        for (let i = 0; i < 2; i++) {
            const letter = i ? 'b' : 'a';
            byId(`source-${letter}-swatch`).style.background = M.color(sources[i].power);
            byId(`source-${letter}-path`).setAttribute('aria-label',
                `${i ? 'RGB white: three narrow bands' : 'Full-spectrum white'}. The input detector reads white. Equilateral prism tilted ${state.angle} degrees, refractive index ${state.ior.toFixed(2)} at 550 nm. The right wall detector resolves the arriving wavelengths. Energy shading ${state.energyShading ? 'on; brightness includes eye sensitivity' : 'off; bright illustrative wavelength colors'}.`);
        }
        const missesWall = scenes.some(scene => scene.detector.lostXYZ[1] > 0.01);
        byId('response-status').textContent = missesWall
            ? 'Both inputs are still white. At this setting, some wavelengths miss the right wall or reflect internally; the main bench follows those reflected paths.'
            : 'Both input detectors see white. Tilt or change IOR to move the continuous spectrum and the three bands along the right walls.';
        paint(); schedule();
    }
    function tick(timestamp) {
        frame = null;
        if (!state.running || !state.visible || document.hidden) { lastTime = null; return; }
        if (lastTime !== null) state.time += Math.min(0.05, (timestamp - lastTime) / 1000);
        lastTime = timestamp; paint(); schedule();
    }
    function schedule() {
        const active = state.running && state.visible && !document.hidden;
        if (active && frame === null) frame = requestAnimationFrame(tick);
        if (!active) { if (frame !== null) cancelAnimationFrame(frame); frame = null; lastTime = null; }
    }
    byId('prism-angle').addEventListener('input', event => { state.angle = Number(event.target.value); update(); });
    byId('prism-ior').addEventListener('input', event => { state.ior = Number(event.target.value); update(); });
    byId('energy-shading').addEventListener('change', event => { state.energyShading = event.target.checked; update(); });
    byId('lesson-pause').addEventListener('click', () => { state.running = !state.running; update(); });
    byId('lesson-reset').addEventListener('click', () => {
        state.angle = 0; state.ior = 1.5; state.time = 0; state.energyShading = true;
        byId('prism-angle').value = 0; byId('prism-ior').value = 1.5; update();
    });
    root.querySelectorAll('[data-bench-source]').forEach(button => button.addEventListener('click', () => {
        const simulation = window.simulation || window.initializeOpticsSimulation?.();
        simulation?.setSpectrumMode(button.dataset.benchSource);
        byId('optics-sandbox').scrollIntoView({behavior: reducedMotion.matches ? 'instant' : 'smooth', block: 'start'});
        byId('spectrumMode').focus({preventScroll: true});
    }));
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('resize', paint);
    reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { state.running = false; update(); } });
    new IntersectionObserver(entries => { state.visible = entries[0].isIntersecting; schedule(); }, {threshold: 0.05}).observe(root);
    update();
})();
