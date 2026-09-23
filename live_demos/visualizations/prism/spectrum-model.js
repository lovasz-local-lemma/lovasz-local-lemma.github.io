/* Small spectral teaching model. All matching happens before display conversion. */
(function (root, factory) {
    const model = factory();
    if (typeof module === 'object' && module.exports) module.exports = model;
    else root.SpectrumModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const step = 5;
    const wavelengths = Array.from({ length: 81 }, (_, i) => 380 + step * i);
    const gaussian = (x, center, sigma) => Math.exp(-0.5 * ((x - center) / sigma) ** 2);

    // CIE 1931 2-degree approximation: Wyman, Sloan & Shirley (2013), Eq. 4.
    // https://jcgt.org/published/0002/02/01/paper.pdf
    // These are XYZ matching functions, not the three cone sensitivities.
    function observer(wave) {
        const lobe = (center, left, right) => {
            const t = (wave - center) * (wave < center ? left : right);
            return Math.exp(-0.5 * t * t);
        };
        return [
            0.362 * lobe(442, 0.0624, 0.0374) + 1.056 * lobe(599.8, 0.0264, 0.0323)
                - 0.065 * lobe(501.1, 0.0490, 0.0382),
            0.821 * lobe(568.8, 0.0213, 0.0247) + 0.286 * lobe(530.9, 0.0613, 0.0322),
            1.217 * lobe(437, 0.0845, 0.0278) + 0.681 * lobe(459, 0.0385, 0.0725)
        ];
    }
    const matchingFunctions = wavelengths.map(observer);

    // Power is a spectral density on the common grid, with a shared absolute scale.
    function xyz(power) {
        if (power.length !== wavelengths.length) throw new RangeError('Expected 81 spectral samples.');
        const result = [0, 0, 0];
        power.forEach((p, i) => matchingFunctions[i].forEach((c, j) => { result[j] += p * c * step; }));
        return result;
    }

    const multiply = (matrix, vector) => matrix.map(row => row.reduce((sum, x, i) => sum + x * vector[i], 0));
    function solve3(matrix, target) {
        const rows = matrix.map((row, i) => [...row, target[i]]);
        for (let col = 0; col < 3; col++) {
            let pivot = col;
            for (let row = col + 1; row < 3; row++) {
                if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
            }
            [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
            const divisor = rows[col][col];
            if (Math.abs(divisor) < 1e-12) throw new Error('Degenerate spectral basis.');
            for (let j = col; j < 4; j++) rows[col][j] /= divisor;
            for (let row = 0; row < 3; row++) {
                if (row === col) continue;
                const factor = rows[row][col];
                for (let j = col; j < 4; j++) rows[row][j] -= factor * rows[col][j];
            }
        }
        return rows.map(row => row[3]);
    }

    const flat = wavelengths.map(() => 1);
    const flatY = xyz(flat)[1];
    const broad = flat.map(p => p / flatY);
    const XYZwhite = xyz(broad);

    function matchedBands(id, label, centers, sigma) {
        const basis = centers.map(center => wavelengths.map(w => gaussian(w, center, sigma)));
        const columns = basis.map(xyz);
        const matrix = XYZwhite.map((_, row) => columns.map(column => column[row]));
        const weights = solve3(matrix, XYZwhite);
        if (weights.some(w => w < 0)) throw new Error('Band primaries do not enclose the white point.');
        // No independent normalization: the solution matches brightness as well as chromaticity.
        const power = wavelengths.map((_, i) => weights.reduce((sum, weight, j) => sum + weight * basis[j][i], 0));
        return { id, label, power, centers, sigma, weights };
    }
    const presets = [
        { id: 'broad', label: 'Broadband white', power: broad },
        matchedBands('bands', 'Three-band white', [450, 535, 610], 7),
        matchedBands('bands2', 'Another three-band white', [465, 550, 630], 7)
    ];

    // Gaussian transmission, peak 1. Width is its standard deviation in nm.
    // Filtering never restores lost power or changes the exposure/white balance.
    function filter(power, center, width) {
        if (!Number.isFinite(center) || !Number.isFinite(width) || width <= 0) {
            throw new RangeError('Filter center must be finite and width must be positive.');
        }
        return power.map((p, i) => p * gaussian(wavelengths[i], center, width));
    }

    // Shared Bradford adaptation from the model's sampled equal-energy white to D65.
    // ICC chromatic adaptation: https://www.color.org/specifications/ICC.1-2001-04.pdf
    const bradford = [[0.8951, 0.2664, -0.1614], [-0.7502, 1.7135, 0.0367], [0.0389, -0.0685, 1.0296]];
    const D65 = [0.3127 / 0.3290, 1, (1 - 0.3127 - 0.3290) / 0.3290];
    const sourceResponse = multiply(bradford, XYZwhite);
    const destinationResponse = multiply(bradford, D65);
    const responseScale = destinationResponse.map((v, i) => v / sourceResponse[i]);
    const inverseColumns = [0, 1, 2].map(i => solve3(bradford, [0, 1, 2].map(j => +(i === j))));
    const inverseBradford = [0, 1, 2].map(i => inverseColumns.map(column => column[i]));

    // D65 XYZ to linear sRGB, followed by the standard sRGB transfer function.
    // https://www.w3.org/TR/css-color-4/#color-conversion-code
    const toLinearRGB = [
        [12831 / 3959, -329 / 214, -1974 / 3959],
        [-851781 / 878810, 1648619 / 878810, 36519 / 878810],
        [705 / 12673, -2585 / 12673, 705 / 667]
    ];
    const clamp = x => Math.max(0, Math.min(1, x));
    const encode = x => x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    function linearRGB(tristimulus) {
        const adapted = multiply(inverseBradford, multiply(bradford, tristimulus).map((v, i) => v * responseScale[i]));
        return multiply(toLinearRGB, adapted);
    }
    function displayRGB(tristimulus, exposure = 0.75) {
        return linearRGB(tristimulus).map(v => encode(clamp(v * exposure)));
    }
    // Accumulating detectors can exceed display white by orders of magnitude.
    // Compress their peak with one common gain, preserving RGB ratios after
    // clipping negative out-of-gamut components. Independent channel clipping
    // would turn bright red/green bands yellow as weaker channels caught up.
    function toneMappedRGB(tristimulus, exposure = 1, response = 'linear') {
        const rgb = linearRGB(tristimulus).map(v => Math.max(0, v));
        const peak = Math.max(...rgb);
        if (!(peak > 0) || !(exposure > 0)) return [0, 0, 0];
        const signal = response === 'logarithmic' ? Math.log1p(peak * exposure) : peak * exposure;
        const gain = (1 - 1 / (1 + signal)) / peak;
        return rgb.map(v => encode(v * gain));
    }
    const css = rgb => `rgb(${rgb.map(v => Math.round(clamp(v) * 255)).join(', ')})`;
    const color = (power, exposure = 0.75) => css(displayRGB(xyz(power), exposure));

    // Illustrative ray/graph key only, deliberately bright across the full range.
    // Normalizing the tiny tails of an analytic observer fit can turn far-red
    // labels green. Use a continuous violet-to-red palette for path identity;
    // physical detector colors still integrate observer XYZ before conversion.
    function labelSpectrumColor(wave) {
        const anchors = [
            [380, [0.5, 0, 1]], [440, [0.12, 0, 1]], [460, [0, 0.25, 1]],
            [490, [0, 1, 1]], [510, [0, 1, 0]], [555, [0.6, 1, 0]],
            [580, [1, 1, 0]], [610, [1, 0.18, 0]], [645, [1, 0, 0]], [780, [1, 0, 0]]
        ];
        const wavelength = Math.max(380, Math.min(780, wave));
        const upper = Math.max(1, anchors.findIndex(([w]) => w >= wavelength));
        const [lowWave, low] = anchors[upper - 1], [highWave, high] = anchors[upper];
        const t = (wavelength - lowWave) / (highWave - lowWave);
        return low.map((value, i) => value + (high[i] - value) * t);
    }
    const wavelengthColor = wave => css(labelSpectrumColor(wave));

    return {
        wavelengths, presets, xyz, filter, displayRGB, toneMappedRGB, color, wavelengthColor, labelSpectrumColor,
        observerXYZ: observer, linearRGB,
        calibration: {
            observer: 'Wyman et al. approximation to CIE 1931 2-degree XYZ',
            method: 'Nonnegative Gaussian band powers solved to match all three sampled XYZ values',
            step, XYZwhite, D65,
            whiteBalance: 'Shared Bradford adaptation from sampled equal-energy white to D65',
            filterWidth: 'Gaussian standard deviation in nanometers'
        }
    };
});
