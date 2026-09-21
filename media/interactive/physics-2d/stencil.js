/* Quadratic B-spline transfer basis used by Physics2D's MPM shaders.
   Educational single-particle study: no stress, time integration or boundary clipping. */
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MpmStencilStudy = api;
})(typeof window !== 'undefined' ? window : this, function() {
    'use strict';
    function weights(x) {
        if (!Number.isFinite(x) || x < 0.5 || x > 1.5) throw new RangeError('Local position must be in [0.5, 1.5].');
        return [0.5 * (1.5 - x) ** 2, 0.75 - (x - 1) ** 2, 0.5 * (x - 0.5) ** 2];
    }
    function evaluate(x, y, mass = 1) {
        if (!Number.isFinite(mass) || mass <= 0) throw new RangeError('Particle mass must be finite and positive.');
        const wx = weights(x), wy = weights(y), nodes = [];
        const v = [0.4, -0.15], C = [[0, 0.65], [-0.3, 0]];
        let sum = 0, totalMass = 0, px = 0, py = 0, xx = 0, xy = 0, yy = 0, vx = 0, vy = 0;
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
            const w = wx[i] * wy[j], m = mass * w, dx = i - x, dy = j - y;
            const u = [v[0] + C[0][0] * dx + C[0][1] * dy, v[1] + C[1][0] * dx + C[1][1] * dy];
            nodes.push({i, j, w, mass: m, u});
            sum += w; totalMass += m; px += w * i; py += w * j;
            xx += w * dx * dx; xy += w * dx * dy; yy += w * dy * dy;
            vx += w * u[0]; vy += w * u[1];
        }
        return {x, y, mass, wx, wy, nodes, sum, totalMass, position: [px, py], moment: [xx, xy, yy], velocity: [vx, vy], v, C};
    }
    function mount(doc) {
        const svg = doc.getElementById('stencil-view');
        if (!svg) return;
        const xInput = doc.getElementById('position-x'), yInput = doc.getElementById('position-y');
        const massInput = doc.getElementById('particle-mass'), affineInput = doc.getElementById('affine-view');
        const layer = doc.getElementById('stencil-layer');
        const esc = n => Number(n).toFixed(4);
        const point = n => 96 + n * 180;
        let drag = false;
        function render() {
            const q = evaluate(+xInput.value, +yInput.value, +massInput.value);
            const cx = point(q.x), cy = point(q.y), affine = affineInput.checked;
            doc.getElementById('value-x').textContent = q.x.toFixed(2);
            doc.getElementById('value-y').textContent = q.y.toFixed(2);
            doc.getElementById('value-mass').textContent = q.mass.toFixed(1);
            doc.getElementById('sum-weights').textContent = q.sum.toFixed(6);
            doc.getElementById('sum-mass').textContent = `${q.totalMass.toFixed(3)} / ${q.mass.toFixed(3)}`;
            doc.getElementById('position-result').textContent = `(${q.position[0].toFixed(3)}, ${q.position[1].toFixed(3)})`;
            doc.getElementById('moment-result').textContent = `${q.moment[0].toFixed(3)}, ${q.moment[2].toFixed(3)}; cross ${Math.abs(q.moment[1]).toFixed(3)}`;
            doc.getElementById('velocity-result').textContent = `(${q.velocity[0].toFixed(3)}, ${q.velocity[1].toFixed(3)})`;
            doc.getElementById('weights-x').textContent = q.wx.map(n => n.toFixed(3)).join(' · ');
            doc.getElementById('weights-y').textContent = q.wy.map(n => n.toFixed(3)).join(' · ');
            const paths = q.nodes.map(n => `<line x1="${cx}" y1="${cy}" x2="${point(n.i)}" y2="${point(n.j)}" stroke="#67ddc3" stroke-opacity="${0.08 + n.w * 0.7}"/>`).join('');
            const circles = q.nodes.map(n => {
                const nx = point(n.i), ny = point(n.j), radius = 66 * Math.sqrt(n.w);
                const arrow = affine ? `<line x1="${nx}" y1="${ny}" x2="${nx + n.u[0] * 60}" y2="${ny + n.u[1] * 60}" class="velocity" marker-end="url(#arrow)"/>` : '';
                return `<g><circle cx="${nx}" cy="${ny}" r="${radius}" fill="#37cba8" fill-opacity=".36" stroke="#6bf0cf" stroke-opacity=".7"/><circle cx="${nx}" cy="${ny}" r="3" fill="#c4fff0"/>${arrow}<text x="${nx}" y="${ny + 68}" class="weight-label">${n.w.toFixed(3)}</text></g>`;
            }).join('');
            layer.innerHTML = paths + circles + `<circle cx="${cx}" cy="${cy}" r="13" class="particle-halo"/><circle cx="${cx}" cy="${cy}" r="6" class="particle"/><text x="${cx + 17}" y="${cy - 17}" class="particle-label">particle</text>`;
            doc.getElementById('weight-table').innerHTML = q.nodes.map(n => `<span><b>(${n.i}, ${n.j})</b><output>${esc(n.w)}</output></span>`).join('');
            doc.getElementById('velocity-note').hidden = !affine;
            svg.setAttribute('aria-label', `Particle at ${q.x.toFixed(2)}, ${q.y.toFixed(2)} in grid cell units. The nine weights sum to ${q.sum.toFixed(3)}. Equivalent controls follow the diagram.`);
        }
        function move(event) {
            if (!drag) return;
            const matrix = svg.getScreenCTM();
            if (!matrix) return;
            const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
            const local = p.matrixTransform(matrix.inverse());
            xInput.value = Math.max(0.5, Math.min(1.5, (local.x - 96) / 180)).toFixed(2);
            yInput.value = Math.max(0.5, Math.min(1.5, (local.y - 96) / 180)).toFixed(2);
            render();
        }
        svg.addEventListener('pointerdown', event => {drag = true; svg.setPointerCapture(event.pointerId); move(event);});
        svg.addEventListener('pointermove', move);
        svg.addEventListener('pointerup', () => {drag = false;});
        svg.addEventListener('pointercancel', () => {drag = false;});
        svg.addEventListener('lostpointercapture', () => {drag = false;});
        [xInput, yInput, massInput, affineInput].forEach(input => input.addEventListener('input', render));
        doc.getElementById('reset-stencil').addEventListener('click', () => {xInput.value = '.8'; yInput.value = '.7'; massInput.value = '1'; affineInput.checked = false; render();});
        render();
    }
    return {weights, evaluate, mount};
});
if (typeof document !== 'undefined') MpmStencilStudy.mount(document);
