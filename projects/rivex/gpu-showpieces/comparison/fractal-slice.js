// A time path through the four real coordinates (z.re, z.im, c.re, c.im).
// W moves that path sideways; it is a parameter, not a recovered hidden object.
export const TAU = Math.PI * 2;
export function sectionParameter(v, phase, w = 0, amount = 1) {
  return [v.cX + amount * (.085 * Math.cos(phase) + .026 * w),
          v.cY + amount * (.060 * Math.sin(phase) + .045 * w)];
}
export function updateSectionDiagram(v, phase, w, amount, put) {
  const map = ([x, y]) => [1140 + (x + 1.15) / 1.5 * 224, 248 + (y + .55) / 1.1 * 100];
  for (let i = 0; i <= 64; i++) {
    const p = map(sectionParameter(v, i / 64 * TAU, w, amount));
    put('sectionX' + i, p[0]); put('sectionY' + i, p[1]);
  }
  const p = map(sectionParameter(v, phase, w, amount));
  for (let i = 0; i <= 24; i++) {
    const a = i / 24 * TAU;
    put('sectionDotX' + i, p[0] + Math.cos(a) * 3.2);
    put('sectionDotY' + i, p[1] + Math.sin(a) * 3.2);
  }
}
