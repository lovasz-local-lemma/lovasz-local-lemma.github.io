// Camera-space, metre-valued geometry. No canvas scaling enters the lens equation.
export const add = (a, b) => a.map((x, i) => x + b[i]);
export const sub = (a, b) => a.map((x, i) => x - b[i]);
export const mul = (a, s) => a.map(x => x * s);
export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const unit = a => mul(a, 1 / Math.max(1e-12, Math.hypot(...a)));
const rad = x => (x || 0) * Math.PI / 180;

export function conjugate(point, center, normal, focalLength) {
    const relative = sub(point, center);
    const distance = dot(relative, normal);
    if (Math.abs(distance - focalLength) < 1e-9) return null;
    return add(center, mul(relative, -focalLength / (distance - focalLength)));
}

export function intersectPlane(origin, direction, point, normal) {
    const denom = dot(direction, normal);
    if (Math.abs(denom) < 1e-9) return null;
    const t = dot(sub(point, origin), normal) / denom;
    return t > 1e-6 && t < 10000 ? add(origin, mul(direction, t)) : null;
}

export function cameraFocusPlane(camera) {
    if (!camera.enableNewTiltShift) return { point: [0, 0, camera.focusDistance], normal: [0, 0, 1] };
    const forward = unit(sub(camera.lookAt, camera.position));
    const right = unit(cross(forward, camera.up));
    const up = cross(right, forward);
    const local = p => {
        const d = sub([p.x, p.y, p.z], camera.position);
        return [dot(d, right), dot(d, up), dot(d, forward)];
    };
    const points = [camera.focusPointA, camera.focusPointB, camera.focusPointC].map(local);
    const normal = unit(cross(sub(points[1], points[0]), sub(points[2], points[0])));
    return { point: points[0], normal };
}

export function tiltNormal(plane, focalLength) {
    const d = dot(plane.normal, plane.point);
    if (Math.abs(d) < 1e-9) return null;
    const x = focalLength * plane.normal[0] / d;
    const y = focalLength * plane.normal[1] / d;
    const z2 = 1 - x*x - y*y;
    return z2 > 1e-10 ? [x, y, Math.sqrt(z2)] : null;
}

function rotateTarget(p, camera) {
    const x = rad(camera.filmTiltX), y = rad(camera.filmTiltY);
    const q = [p[0], p[1]*Math.cos(x)-p[2]*Math.sin(x), p[1]*Math.sin(x)+p[2]*Math.cos(x)];
    return [q[0]*Math.cos(y)-q[2]*Math.sin(y), q[1], q[0]*Math.sin(y)+q[2]*Math.cos(y)];
}

export function buildOpticsDiagram(camera, axis = 'y', lesson = false) {
    const f = camera.focalLength / 1000;
    const filmHeight = camera.filmSize / 1000 / Math.sqrt(1 + camera.aspectRatio**2);
    const filmWidth = filmHeight * camera.aspectRatio;
    const center = [camera.apertureShiftX, camera.apertureShiftY, camera.apertureShiftZ];
    const plane = cameraFocusPlane(camera);
    const normal = camera.enableNewTiltShift ? tiltNormal(plane, f) : [0, 0, 1];
    const lensNormal = normal || [0, 0, 1];
    const coordinate = axis === 'x' ? 0 : 1;
    const meridian = coordinate === 0 ? [1, 0, 0] : [0, 1, 0];
    const tangent = unit(sub(meridian, mul(lensNormal, dot(meridian, lensNormal))));
    const radius = camera.type === 'pinhole' ? 0 : camera.getApertureRadius();
    const samples = [-0.8, 0, 0.8].map((v, index) => {
        let sensor, focus;
        if (lesson) {
            const h = coordinate === 0 ? filmWidth : filmHeight;
            const offset = [0, 0, 0]; offset[coordinate] = v * h * 0.5;
            sensor = add([camera.filmShiftX, camera.filmShiftY, camera.getFilmPosition()], rotateTarget(offset, camera));
            // Reverse lens equation: the object-side normal faces the sensor for this mapping.
            focus = conjugate(sensor, center, mul(lensNormal, -1), f);
        } else {
            const coords = [camera.sensorOffsetX || 0, camera.sensorOffsetY || 0];
            coords[coordinate] += v;
            const offset = [coords[0]*filmWidth/(2*f)+camera.filmShiftX/f,
                coords[1]*filmHeight/(2*f)+camera.filmShiftY/f, 0];
            const direction = add([0, 0, 1], rotateTarget(offset, camera));
            direction[2] += camera.filmCurvature * (coords[0]**2+coords[1]**2) * 0.1;
            focus = intersectPlane([0, 0, 0], direction, plane.point, plane.normal);
            sensor = focus ? conjugate(focus, center, lensNormal, f) : null;
        }
        const lensPoints = [-1, 0, 1].map(v => add(center, mul(tangent, radius*v)));
        return { index, sensor, focus, lensPoints };
    });
    return { f, radius, center, normal: lensNormal, tangent, plane, samples, coordinate,
        validTilt: !!normal, filmWidth, filmHeight, lesson };
}
