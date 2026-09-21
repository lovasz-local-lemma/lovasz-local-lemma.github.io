// Complex Plane Visualizations for Residue Theorem
// Draws: amplitude heatmap, phase heatmap, contour path with poles
console.log('[complex_plot.js] loaded');

function drawComplexPlots(containerId, poles, selectedPoles, contourType, exprString) {
    console.log('[drawComplexPlots] called with', poles.length, 'poles, container:', containerId);
    const container = document.getElementById(containerId);
    if (!container) { console.error('[drawComplexPlots] container not found:', containerId); return; }

    container.innerHTML = '';

    const isTreePanel = containerId === 'treeResidPlot';
    const size = isTreePanel ? 150 : 270;
    const fontSize = isTreePanel ? '0.6rem' : '0.72rem';

    if (isTreePanel) {
        container.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
    } else {
        container.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center;';
    }

    function makeCell(label) {
        const div = document.createElement('div');
        div.style.textAlign = 'center';
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        div.appendChild(canvas);
        const lbl = document.createElement('div');
        lbl.style.cssText = `color:#94a3b8;font-size:${fontSize};margin-top:4px;`;
        lbl.textContent = label;
        div.appendChild(lbl);
        container.appendChild(div);
        return canvas;
    }

    const ampCanvas  = makeCell('|f(z)| — Amplitude');
    const argCanvas  = makeCell('arg(f(z)) — Phase + Contour');
    const reCanvas   = makeCell('Re(f(z))');
    const imCanvas   = makeCell('Im(f(z))');

    const f = buildComplexFunction(exprString);
    drawAmplitudePlot(ampCanvas, f, poles, selectedPoles);
    drawContourPlot(argCanvas, f, poles, selectedPoles, contourType);
    drawRealPartPlot(reCanvas, poles, selectedPoles);
    drawImagPartPlot(imCanvas, poles, selectedPoles);
}

// Build a JS complex function evaluator from the expression string
function buildComplexFunction(exprString) {
    // For rational functions P(x)/Q(x), we evaluate at complex z = x + iy
    // This is a simplified evaluator for common forms
    return function(zr, zi) {
        // Evaluate using the polynomial structure
        // Parse simple rational: we'll use a numerical approach
        try {
            // Evaluate f(z) by plugging z into the real function
            // For P(x)/Q(x), evaluate P(z)/Q(z) in complex arithmetic
            const result = evalComplexExpr(exprString, zr, zi);
            return result;
        } catch(e) {
            return { re: 0, im: 0 };
        }
    };
}

// Simple complex expression evaluator for rational functions
function evalComplexExpr(expr, zr, zi) {
    // Tokenize and evaluate — handles x^n + ... / x^m + ...
    // For now, use a simple numerical approach: evaluate the real function
    // at nearby points and interpolate (this is a placeholder)

    // Actually, let's just evaluate |1/Q(z)| which is what matters for visualization
    // We'll extract the denominator polynomial coefficients and evaluate

    // Simplified: evaluate 1/|denominator(z)|^2 for visualization
    // This gives us the magnitude map showing where poles are

    // For general expressions, evaluate f(x+0i) along real axis
    // and estimate |f(z)| from the polynomial structure

    // Use the pole locations to create a proper visualization
    return { re: 1, im: 0 }; // placeholder, overridden by pole-based rendering
}

function drawAmplitudePlot(canvas, f, allPoles, selectedPoles) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    // Determine view bounds from poles
    let maxR = 2;
    allPoles.forEach(p => { maxR = Math.max(maxR, Math.abs(p.re) + 1, Math.abs(p.im) + 1); });
    const range = maxR * 1.3;

    const imageData = ctx.createImageData(W, H);

    for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
            const zr = (px / W - 0.5) * 2 * range;
            const zi = -(py / H - 0.5) * 2 * range; // Flip y

            // Compute |f(z)| = 1 / |product of (z - pole_k)^mult_k|
            let prodR = 1, prodI = 0;
            allPoles.forEach(pole => {
                const dr = zr - pole.re;
                const di = zi - pole.im;
                for (let m = 0; m < (pole.mult || 1); m++) {
                    const newR = prodR * dr - prodI * di;
                    const newI = prodR * di + prodI * dr;
                    prodR = newR; prodI = newI;
                }
            });

            const denomMag = Math.sqrt(prodR * prodR + prodI * prodI);
            const amplitude = denomMag > 1e-10 ? 1.0 / denomMag : 100;

            // Map amplitude to color using domain coloring
            const logAmp = Math.log(amplitude + 1);
            const t = Math.min(logAmp / 3, 1.0);

            // High-contrast: deep navy -> electric blue -> cyan -> yellow -> white
            let r, g, b;
            if (t < 0.25) {
                const s = t / 0.25;
                r = Math.floor(10 + 40 * s);
                g = Math.floor(15 + 80 * s);
                b = Math.floor(60 + 160 * s);
            } else if (t < 0.5) {
                const s = (t - 0.25) / 0.25;
                r = Math.floor(50 + 30 * s);
                g = Math.floor(95 + 140 * s);
                b = Math.floor(220 - 40 * s);
            } else if (t < 0.75) {
                const s = (t - 0.5) / 0.25;
                r = Math.floor(80 + 175 * s);
                g = Math.floor(235 + 10 * s);
                b = Math.floor(180 - 150 * s);
            } else {
                const s = (t - 0.75) / 0.25;
                r = Math.floor(255);
                g = Math.floor(245 + 10 * s);
                b = Math.floor(30 + 180 * s);
            }

            const idx = (py * W + px) * 4;
            imageData.data[idx] = r;
            imageData.data[idx+1] = g;
            imageData.data[idx+2] = b;
            imageData.data[idx+3] = 255;
        }
    }

    ctx.putImageData(imageData, 0, 0);

    // Draw axes
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); // Real axis
    ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); // Imaginary axis
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '10px monospace';
    ctx.fillText('Re', W - 18, H/2 - 4);
    ctx.fillText('Im', W/2 + 4, 12);

    // Draw poles
    allPoles.forEach(pole => {
        const px = (pole.re / range + 1) / 2 * W;
        const py = (-pole.im / range + 1) / 2 * H;
        const isSelected = selectedPoles.some(sp => Math.abs(sp.re - pole.re) < 0.01 && Math.abs(sp.im - pole.im) < 0.01);

        ctx.beginPath();
        ctx.arc(px, py, isSelected ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? '#4ade80' : '#f87171';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        ctx.fillStyle = 'white';
        ctx.font = 'bold 9px monospace';
        const label = pole.im === 0 ? pole.re.toFixed(1) :
            (pole.re === 0 ? `${pole.im.toFixed(1)}i` : `${pole.re.toFixed(1)}+${pole.im.toFixed(1)}i`);
        ctx.fillText(label, px + 8, py - 4);
    });

    // Tick marks
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '8px monospace';
    for (let v = -Math.floor(range); v <= Math.floor(range); v++) {
        if (v === 0) continue;
        const px = (v / range + 1) / 2 * W;
        ctx.fillText(v.toString(), px - 4, H/2 + 12);
        const py = (-v / range + 1) / 2 * H;
        ctx.fillText(`${v}i`, W/2 + 4, py + 3);
    }
}

function drawContourPlot(canvas, f, allPoles, selectedPoles, contourType) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    let maxR = 2;
    allPoles.forEach(p => { maxR = Math.max(maxR, Math.abs(p.re) + 1, Math.abs(p.im) + 1); });
    const range = maxR * 1.3;

    // Phase background (argument of f(z))
    const imageData = ctx.createImageData(W, H);
    for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
            const zr = (px / W - 0.5) * 2 * range;
            const zi = -(py / H - 0.5) * 2 * range;

            // Compute arg(1/Q(z)) = -arg(Q(z))
            let prodR = 1, prodI = 0;
            allPoles.forEach(pole => {
                const dr = zr - pole.re;
                const di = zi - pole.im;
                for (let m = 0; m < (pole.mult || 1); m++) {
                    const newR = prodR * dr - prodI * di;
                    const newI = prodR * di + prodI * dr;
                    prodR = newR; prodI = newI;
                }
            });

            let angle = -Math.atan2(prodI, prodR); // negative for 1/Q
            angle = (angle + Math.PI) / (2 * Math.PI); // Normalize to [0, 1]

            // HSL-like color wheel — full saturation
            const r = Math.floor(128 + 127 * Math.cos(angle * 2 * Math.PI));
            const g = Math.floor(128 + 127 * Math.cos(angle * 2 * Math.PI - 2.094));
            const b = Math.floor(128 + 127 * Math.cos(angle * 2 * Math.PI + 2.094));

            const idx = (py * W + px) * 4;
            imageData.data[idx] = Math.floor(r * 0.85);
            imageData.data[idx+1] = Math.floor(g * 0.85);
            imageData.data[idx+2] = Math.floor(b * 0.85);
            imageData.data[idx+3] = 255;
        }
    }
    ctx.putImageData(imageData, 0, 0);

    // Draw axes
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
    ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H);
    ctx.stroke();

    // Draw main contour: semicircle in upper/lower half-plane
    const isUpper = contourType === 'upper' || contourType === 'Upper half-plane semicircle';
    const contourR = range * 0.85; // Radius of the semicircle in math coordinates
    const cxPx = W / 2, cyPx = H / 2;
    const rPx = contourR / range * (W / 2);

    // Semicircle arc
    ctx.beginPath();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);

    if (isUpper) {
        ctx.arc(cxPx, cyPx, rPx, Math.PI, 0); // Upper semicircle
    } else {
        ctx.arc(cxPx, cyPx, rPx, 0, Math.PI); // Lower semicircle
    }
    ctx.stroke();

    // Real axis portion of contour
    ctx.beginPath();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.moveTo(cxPx - rPx, cyPx);
    ctx.lineTo(cxPx + rPx, cyPx);
    ctx.stroke();

    // Direction arrows on contour
    ctx.fillStyle = '#fbbf24';
    drawArrow(ctx, cxPx + rPx * 0.5, cyPx, 8, 0); // Right on real axis
    if (isUpper) {
        drawArrow(ctx, cxPx, cyPx - rPx, 8, Math.PI); // Left at top of arc
    }

    // Draw small circles around each selected pole (indentation paths)
    selectedPoles.forEach(pole => {
        const px = (pole.re / range + 1) / 2 * W;
        const py = (-pole.im / range + 1) / 2 * H;

        // Small dashed circle around pole
        ctx.beginPath();
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.arc(px, py, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow on small circle
        drawArrow(ctx, px + 12, py, 5, Math.PI / 2);
    });

    // Draw all poles
    allPoles.forEach(pole => {
        const px = (pole.re / range + 1) / 2 * W;
        const py = (-pole.im / range + 1) / 2 * H;
        const isSelected = selectedPoles.some(sp => Math.abs(sp.re - pole.re) < 0.01 && Math.abs(sp.im - pole.im) < 0.01);

        // Cross marker for poles
        ctx.strokeStyle = isSelected ? '#4ade80' : '#f87171';
        ctx.lineWidth = 2;
        const s = 5;
        ctx.beginPath();
        ctx.moveTo(px - s, py - s); ctx.lineTo(px + s, py + s);
        ctx.moveTo(px + s, py - s); ctx.lineTo(px - s, py + s);
        ctx.stroke();

        // Outer glow
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.strokeStyle = isSelected ? 'rgba(74,222,128,0.4)' : 'rgba(248,113,113,0.4)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Label with multiplicity
        ctx.fillStyle = 'white';
        ctx.font = 'bold 9px monospace';
        let label = pole.im === 0 ? pole.re.toFixed(1) :
            (Math.abs(pole.re) < 0.01 ? `${pole.im.toFixed(1)}i` : `${pole.re.toFixed(1)}${pole.im >= 0 ? '+' : ''}${pole.im.toFixed(1)}i`);
        if (pole.mult > 1) label += ` (×${pole.mult})`;
        ctx.fillText(label, px + 10, py - 6);
    });

    // Legend
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '9px sans-serif';
    ctx.fillText('Re', W - 18, H/2 - 4);
    ctx.fillText('Im', W/2 + 4, 12);

    // Contour label
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText('C', cxPx + rPx + 5, isUpper ? cyPx - rPx / 2 : cyPx + rPx / 2);
}

// Shared helper: axes + pole markers (no labels, keeps plots clean at small sizes)
function drawAxesAndPoleMarkers(ctx, W, H, range, allPoles, selectedPoles) {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
    ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H);
    ctx.stroke();

    allPoles.forEach(pole => {
        const px = (pole.re / range + 1) / 2 * W;
        const py = (-pole.im / range + 1) / 2 * H;
        const isSelected = selectedPoles.some(sp => Math.abs(sp.re - pole.re) < 0.01 && Math.abs(sp.im - pole.im) < 0.01);
        ctx.strokeStyle = isSelected ? '#4ade80' : '#f87171';
        ctx.lineWidth = 2;
        const s = 4;
        ctx.beginPath();
        ctx.moveTo(px - s, py - s); ctx.lineTo(px + s, py + s);
        ctx.moveTo(px + s, py - s); ctx.lineTo(px - s, py + s);
        ctx.stroke();
    });
}

// Shared: compute 1/Q(z) values across the canvas
function computeInverseQ(W, H, range, allPoles) {
    const reVals = new Float32Array(W * H);
    const imVals = new Float32Array(W * H);
    let maxRe = 1e-10, maxIm = 1e-10;
    for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
            const zr = (px / W - 0.5) * 2 * range;
            const zi = -(py / H - 0.5) * 2 * range;
            let prodR = 1, prodI = 0;
            allPoles.forEach(pole => {
                const dr = zr - pole.re, di = zi - pole.im;
                for (let m = 0; m < (pole.mult || 1); m++) {
                    const nr = prodR * dr - prodI * di;
                    const ni = prodR * di + prodI * dr;
                    prodR = nr; prodI = ni;
                }
            });
            const mag2 = prodR * prodR + prodI * prodI;
            const idx = py * W + px;
            reVals[idx] = mag2 > 1e-20 ? prodR / mag2 : 0;
            imVals[idx] = mag2 > 1e-20 ? -prodI / mag2 : 0;
            maxRe = Math.max(maxRe, Math.abs(reVals[idx]));
            maxIm = Math.max(maxIm, Math.abs(imVals[idx]));
        }
    }
    return { reVals, imVals, maxRe, maxIm };
}

// Dark-BG diverging colormap: dark at 0, bright saturated at extremes
function darkDivergingColor(t, negR, negG, negB, posR, posG, posB) {
    // t in [-1, 1], 0 = near-black, extremes = bright saturated
    const s = Math.abs(t);
    const base = 12; // subtle dark base so it's not pitch black
    const ramp = s * s * 0.4 + s * 0.6; // mix of linear + quadratic for brighter midtones
    if (t < 0) {
        return [Math.floor(base + negR * ramp), Math.floor(base + negG * ramp), Math.floor(base + negB * ramp)];
    } else {
        return [Math.floor(base + posR * ramp), Math.floor(base + posG * ramp), Math.floor(base + posB * ramp)];
    }
}

// Re(f(z)) — dark BG, cyan negative, orange/red positive
function drawRealPartPlot(canvas, allPoles, selectedPoles) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    let maxR = 2;
    allPoles.forEach(p => { maxR = Math.max(maxR, Math.abs(p.re) + 1, Math.abs(p.im) + 1); });
    const range = maxR * 1.3;
    const { reVals, maxRe } = computeInverseQ(W, H, range, allPoles);

    const imageData = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
        const t = Math.tanh(reVals[i] / (maxRe * 0.08)); // less compression = more saturation
        const [r, g, b] = darkDivergingColor(t, 60, 220, 255, 255, 160, 40); // cyan vs orange
        imageData.data[i*4] = r; imageData.data[i*4+1] = g; imageData.data[i*4+2] = b; imageData.data[i*4+3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    drawAxesAndPoleMarkers(ctx, W, H, range, allPoles, selectedPoles);
}

// Im(f(z)) — dark BG, magenta negative, green positive
function drawImagPartPlot(canvas, allPoles, selectedPoles) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    let maxR = 2;
    allPoles.forEach(p => { maxR = Math.max(maxR, Math.abs(p.re) + 1, Math.abs(p.im) + 1); });
    const range = maxR * 1.3;
    const { imVals, maxIm } = computeInverseQ(W, H, range, allPoles);

    const imageData = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
        const t = Math.tanh(imVals[i] / (maxIm * 0.08));
        const [r, g, b] = darkDivergingColor(t, 230, 60, 255, 60, 255, 120); // magenta vs green
        imageData.data[i*4] = r; imageData.data[i*4+1] = g; imageData.data[i*4+2] = b; imageData.data[i*4+3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    drawAxesAndPoleMarkers(ctx, W, H, range, allPoles, selectedPoles);
}

function drawArrow(ctx, x, y, size, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size / 2, -size / 2);
    ctx.lineTo(-size / 2, size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}
