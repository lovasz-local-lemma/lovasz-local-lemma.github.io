// A first-transmission geometric construction for the guided lesson.
// The original optical bench handles stochastic reflection and multiple bounces.
(function (root, factory) {
    const model = typeof module === 'object' && module.exports
        ? require('./spectrum-model.js') : root.SpectrumModel;
    const api = factory(model);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.SpectrumTransport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (model) {
    const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
    const scale = (a, s) => [a[0] * s, a[1] * s];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
    const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
    const unit = a => scale(a, 1 / Math.hypot(...a));
    // Oblique incidence keeps the equilateral prism below the TIR threshold
    // throughout the UI range, while its position leaves room for the full fan.
    const incidentAngle = -20 * Math.PI / 180;
    const incidentDirection = [Math.cos(incidentAngle), Math.sin(incidentAngle)];
    const geometry = {
        center: [360, 140], height: 180, baseAngle: 10,
        source: [24, 205], incidentDirection,
        beamNormal: [-incidentDirection[1], incidentDirection[0]],
        screenX: 566, screenYMin: 36, screenHeight: 300
    };
    function vertices(angle = 0) {
        const a = (angle + geometry.baseAngle) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        const halfSide = geometry.height / Math.sqrt(3);
        return [[0, -2 * geometry.height / 3], [halfSide, geometry.height / 3], [-halfSide, geometry.height / 3]]
            .map(([x, y]) => [geometry.center[0] + x * c - y * s, geometry.center[1] + x * s + y * c]);
    }
    function intersection(origin, direction, polygon) {
        let nearest = null;
        polygon.forEach((a, i) => {
            const edge = sub(polygon[(i + 1) % polygon.length], a);
            const denominator = cross(direction, edge);
            if (Math.abs(denominator) < 1e-10) return;
            const offset = sub(a, origin);
            const t = cross(offset, edge) / denominator;
            const u = cross(offset, direction) / denominator;
            if (t < 1e-5 || u < 0 || u > 1 || (nearest && t >= nearest.t)) return;
            let normal = unit([edge[1], -edge[0]]);
            if (dot(normal, direction) > 0) normal = scale(normal, -1);
            nearest = {point: add(origin, scale(direction, t)), normal, t};
        });
        return nearest;
    }
    function refract(direction, normal, n1, n2) {
        const eta = n1 / n2, cosine = -dot(direction, normal);
        const k = 1 - eta * eta * (1 - cosine * cosine);
        if (k < 0) return null;
        return unit(add(scale(direction, eta), scale(normal, eta * cosine - Math.sqrt(k))));
    }
    function ior(wavelength, referenceIOR = 1.5) {
        return referenceIOR + 0.03 * (1 / (wavelength / 1000) ** 2 - 1 / 0.55 ** 2);
    }
    function trace(wavelength, angle = 0, beamOffset = 0, referenceIOR = 1.5) {
        const polygon = vertices(angle), points = [add(geometry.source, scale(geometry.beamNormal, beamOffset))];
        let direction = geometry.incidentDirection.slice(), origin = points[0];
        for (let face = 0; face < 2; ++face) {
            const hit = intersection(origin, direction, polygon);
            if (!hit) return {points, status: 'miss'};
            points.push(hit.point);
            direction = refract(direction, hit.normal, face ? ior(wavelength, referenceIOR) : 1, face ? 1 : ior(wavelength, referenceIOR));
            if (!direction) return {points, status: 'internal-reflection'};
            origin = add(hit.point, scale(direction, 1e-4));
        }
        if (direction[0] <= 0) return {points, status: 'away'};
        const screen = add(origin, scale(direction, (geometry.screenX - origin[0]) / direction[0]));
        points.push(screen);
        return {points, status: screen[1] >= geometry.screenYMin && screen[1] <= geometry.screenHeight ? 'screen' : 'outside'};
    }

    // Trace each represented spectral mass once. Fan and wall projections then
    // reuse these exact finite-beam edges and the original observer quadrature.
    function spectralPackets(power, angle = 0, options = {}) {
        if (!model) throw new Error('SpectrumModel must load before spectral projection.');
        const {beamHalfWidth = 3, referenceIOR = 1.5, wavelengthSamples = 1} = options;
        if (power.length !== model.wavelengths.length) throw new RangeError('Expected 81 spectral samples.');
        if (!Number.isInteger(wavelengthSamples) || wavelengthSamples < 1
            || !Number.isFinite(beamHalfWidth) || beamHalfWidth < 0) {
            throw new RangeError('Expected a positive sample count and nonnegative finite beam half-width.');
        }
        const packets = [];
        model.wavelengths.forEach((wave, i) => {
            // Optional spatial refinement of each represented 5 nm band. Retain
            // the node's original XYZ mass and divide it between subwavelengths;
            // do not resample the source/observer or change its calibrated color.
            const halfStep = model.calibration.step / 2;
            const bandLow = Math.max(model.wavelengths[0], wave - halfStep);
            const bandHigh = Math.min(model.wavelengths[model.wavelengths.length - 1], wave + halfStep);
            const contribution = model.observerXYZ(wave).map(v => v * power[i] * model.calibration.step / wavelengthSamples);
            const packetPower = power[i] * model.calibration.step / wavelengthSamples;
            for (let sample = 0; sample < wavelengthSamples; sample++) {
                const sampleWave = wavelengthSamples === 1 ? wave : bandLow + (sample + 0.5) * (bandHigh - bandLow) / wavelengthSamples;
                const edges = [-beamHalfWidth, beamHalfWidth].map(offset => trace(sampleWave, angle, offset, referenceIOR));
                if (edges.some(ray => ray.points.length !== 4 || !['screen', 'outside'].includes(ray.status))) continue;
                packets.push({edges, xyz: contribution, wavelength: sampleWave, power: packetPower});
            }
        });
        return packets;
    }

    // Project an outgoing beam onto a vertical cross-section without retracing.
    // Only complete beam intervals beyond both exit points belong to the fan.
    // Bin XYZ is power density per scene y-unit, never a normalized display color.
    // The optional labelRGB channel applies the same geometry to illustrative
    // color keys while retaining their distinct names and leaving XYZ untouched.
    function projectPackets(packets, screenX, options = {}) {
        const {yMin = geometry.screenYMin, yMax = geometry.screenHeight, bins: count = 300,
            contributionField = 'xyz'} = options;
        if (!Number.isFinite(screenX) || !Number.isFinite(yMin) || !Number.isFinite(yMax)
            || yMax <= yMin || !Number.isInteger(count) || count < 1) {
            throw new RangeError('Expected a finite cross-section, finite detector interval, and positive bin count.');
        }
        if (!['xyz', 'labelRGB'].includes(contributionField)) {
            throw new RangeError('Expected xyz physical contributions or labelRGB illustrative contributions.');
        }
        const binWidth = (yMax - yMin) / count;
        const bins = Array.from({length: count}, (_, i) => ({y: yMin + (i + 0.5) * binWidth, [contributionField]: [0, 0, 0]}));
        const collected = [0, 0, 0];
        for (const packet of packets) {
            const first = packet.edges[0].points, second = packet.edges[1].points;
            if (screenX < first[2][0] || screenX < second[2][0]) continue;
            const firstY = screenX === geometry.screenX ? first[3][1]
                : first[2][1] + (screenX - first[2][0]) * (first[3][1] - first[2][1]) / (first[3][0] - first[2][0]);
            const secondY = screenX === geometry.screenX ? second[3][1]
                : second[2][1] + (screenX - second[2][0]) * (second[3][1] - second[2][1]) / (second[3][0] - second[2][0]);
            const low = Math.min(firstY, secondY), high = Math.max(firstY, secondY);
            const deposit = (index, fraction) => {
                for (let channel = 0; channel < 3; channel++) {
                    const value = packet[contributionField][channel] * fraction;
                    bins[index][contributionField][channel] += value / binWidth;
                    collected[channel] += value;
                }
            };
            if (high - low < 1e-10) {
                if (low >= yMin && low <= yMax) deposit(Math.min(count - 1, Math.floor((low - yMin) / binWidth)), 1);
                continue;
            }
            const start = Math.max(0, Math.floor((low - yMin) / binWidth));
            const end = Math.min(count - 1, Math.floor((high - yMin) / binWidth));
            for (let index = start; index <= end; index++) {
                const overlap = Math.max(0, Math.min(high, yMin + (index + 1) * binWidth) - Math.max(low, yMin + index * binWidth));
                if (overlap > 0) deposit(index, overlap / (high - low));
            }
        }
        return {bins, binWidth, [contributionField === 'xyz' ? 'collectedXYZ' : 'collectedRGB']: collected};
    }

    // Public detector API retains its original output and quadrature defaults.
    function projectSpectrum(power, angle = 0, options = {}) {
        if (!model) throw new Error('SpectrumModel must load before spectral projection.');
        const inputXYZ = model.xyz(power);
        const packets = spectralPackets(power, angle, options);
        const projection = projectPackets(packets, geometry.screenX, {...options, contributionField: 'xyz'});
        return {...projection, inputXYZ,
            lostXYZ: inputXYZ.map((v, i) => Math.max(0, v - projection.collectedXYZ[i]))};
    }
    return {geometry, vertices, trace, refract, ior, spectralPackets, projectPackets, projectSpectrum};
});
