/* Small, deterministic SVG studies for the connection explorer. */
(() => {
  'use strict';

  const palettes = {
    woven: ['#e5c77d', '#85bcbc', '#c59ca9', '#9cabcf', '#a7be91', '#c99f7c', '#b3a0c7', '#b9c9ac'],
    ernst: ['#c6b075', '#9cab85', '#b38572', '#749f9b', '#c9b69a', '#8c9dba', '#ba9b68', '#a18cab'],
    klee: ['#e4bd65', '#bd736b', '#80b5ae', '#949ec8', '#c29f71', '#a6b67b', '#b690ad', '#80a3bf'],
    chirico: ['#d0b477', '#a87966', '#849c99', '#c6bd98', '#8192b3', '#b79e8a', '#9ca984', '#ac8eaa'],
    dali: ['#e4ca84', '#8cbfbc', '#c698af', '#9ba6d2', '#c79872', '#9cbea8', '#b2a0c6', '#c1b194'],
    orrery: ['#e8c56c', '#96bcb8', '#c68c5e', '#c7b877', '#a9bacf', '#cb9e80', '#d8cf9a', '#99ada0'],
    interference: ['#85e5dc', '#c4a8ff', '#edabd1', '#a2cafa', '#e6d7a2', '#96d4b8', '#d3abeb', '#8cd8e8'],
    opaline: ['#66bdb2', '#ad88bf', '#d79374', '#7598ca', '#b6bc75', '#c587a5', '#70b5cb', '#c8ae83']
  };

  function palette(style) {
    return [...(palettes[style] || palettes.woven)];
  }

  function ribbonStops(style, color, index) {
    if (style === 'orrery') return [[0, '#75522c', .95], [19, color, .8], [44, '#fff0b8', .9], [49, '#ad7940', .72], [72, color, .9], [100, '#fff1bd', .88]];
    if (style === 'interference') return [[0, color, .85], [24, '#bd9ff0', .56], [45, '#a5f2e7', .64], [55, '#f5bedf', .76], [72, palette(style)[(index + 3) % 8], .62], [100, '#f8f5da', .9]];
    return [[0, color, .88], [33, color, .38], [56, '#f2d6a0', .66], [73, color, .6], [100, '#c3dddc', .85]];
  }

  const pointText = point => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  function sample(control, t, offset = 0) {
    const [a, b, c, d] = control, s = 1 - t;
    const dx = 3 * s * s * (b.x - a.x) + 6 * s * t * (c.x - b.x) + 3 * t * t * (d.x - c.x);
    const dy = 3 * s * s * (b.y - a.y) + 6 * s * t * (c.y - b.y) + 3 * t * t * (d.y - c.y);
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: s ** 3 * a.x + 3 * s * s * t * b.x + 3 * s * t * t * c.x + t ** 3 * d.x - dy / length * offset,
      y: s ** 3 * a.y + 3 * s * s * t * b.y + 3 * s * t * t * c.y + t ** 3 * d.y + dx / length * offset
    };
  }

  // Surface detail is clipped to an existing member-to-member ribbon. The
  // decorative marks cannot create extra endpoints or change the graph data.
  function decorateRibbon(branch, definitions, edge, style, index, svgElement) {
    const clipId = `pc-ribbon-surface-${index}`;
    const clip = svgElement('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
    clip.append(svgElement('path', { d: edge.d }));
    definitions.append(clip);
    const marks = svgElement('g', { class: `pc-surface pc-surface-${style}`, 'clip-path': `url(#${clipId})`, 'pointer-events': 'none' });
    const path = (d, attributes = {}) => marks.append(svgElement('path', { d, ...attributes }));
    if (style === 'orrery') {
      for (const offset of [-11, -7, 7, 11]) {
        const points = Array.from({ length: 41 }, (_, step) => pointText(sample(edge.control, step / 40, offset)));
        path(`M ${points.join(' L ')}`, { class: 'pc-metal-rail' });
      }
      for (let tick = 2; tick < 23; tick++) {
        const t = tick / 24, extent = tick % 4 === 0 ? 7 : 3;
        path(`M ${pointText(sample(edge.control, t, -extent))} L ${pointText(sample(edge.control, t, extent))}`, { class: 'pc-metal-engraving' });
      }
    } else if (style === 'interference') {
      for (let band = -3; band <= 3; band++) {
        const points = Array.from({ length: 57 }, (_, step) => {
          const t = step / 56;
          const offset = Math.sin(Math.PI * t) * (band * 6 + Math.sin(t * Math.PI * 3 + band * .65 + index) * 5);
          return pointText(sample(edge.control, t, offset));
        });
        path(`M ${points.join(' L ')}`, { class: `pc-wave-contour${band % 2 === 0 ? ' pc-wave-contour-bright' : ''}`, stroke: band < 0 ? '#ccafff' : band > 0 ? '#b2fff0' : '#fff0d7', style: `--wave-delay:${-index * .8 - band * .5}s`, pathLength: 100 });
      }
    } else if (style === 'opaline') {
      const colors = palette(style);
      for (let facet = 0; facet < 11; facet++) {
        const t = facet / 11, next = (facet + 1) / 11;
        const width = 17 + 13 * Math.sin((t + next) / 2 * Math.PI);
        const a = sample(edge.control, t, -width), b = sample(edge.control, t, width);
        const c = sample(edge.control, next, -width), d = sample(edge.control, next, width);
        const pane = (vertices, shade, opacity) => path(`M ${vertices.map(pointText).join(' L ')} Z`, { class: 'pc-glass-pane', fill: shade, 'fill-opacity': opacity });
        pane([a, b, facet % 2 ? c : d], colors[(index + facet) % colors.length], .18 + facet % 3 * .09);
        pane(facet % 2 ? [b, c, d] : [a, c, d], facet % 3 ? '#edf0ca' : '#17151d', facet % 3 ? .11 : .2);
      }
      path(edge.spine, { class: 'pc-glass-glint', pathLength: 100 });
    }
    branch.append(marks);
  }

  // Every half has a real node at one end and the selected category at the
  // other. Longitudinal progress stays positive, so these small flourishes do
  // not turn the ribbons back on themselves or introduce cusps.
  function control(style, start, end, index = 0) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const distance = Math.hypot(dx, dy);
    const nx = distance ? -dy / distance : 0;
    const ny = distance ? dx / distance : 0;
    const sign = index % 2 ? -1 : 1;
    const rhythm = Math.sin(index * 2.39996323 + Math.atan2(dy, dx));
    let first = .31, second = .76, bend1 = sign * 23, bend2 = -sign * 12;

    if (style === 'ernst') {
      first = .25; second = .77;
      bend1 = 31 * sign + rhythm * 15;
      bend2 = -18 * sign + rhythm * 7;
    } else if (style === 'klee') {
      first = .13; second = .84;
      bend1 = (26 + index % 3 * 7) * sign;
      bend2 = bend1 * .82;
    } else if (style === 'chirico') {
      first = .38; second = .82;
      bend1 = sign * (16 + index % 3 * 5);
      bend2 = sign * 9;
    } else if (style === 'dali') {
      first = .21; second = .79;
      bend1 = sign * (45 + rhythm * 12);
      bend2 = -sign * 24;
    }

    const scale = Math.min(distance / 210, 1);
    const point = (t, bend) => ({
      x: start.x + dx * t + nx * bend * scale,
      y: start.y + dy * t + ny * bend * scale
    });
    return [{ ...start }, point(first, bend1), point(second, bend2), { ...end }];
  }

  function draw(svg, style, svgElement) {
    const art = svgElement('g', {
      class: `pc-artwork pc-artwork-${style}`,
      'aria-hidden': 'true', 'pointer-events': 'none',
      fill: 'none', stroke: '#d3b978', 'stroke-width': 1,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    });
    const add = (tag, attributes, parent = art) => {
      const node = svgElement(tag, attributes);
      parent.append(node);
      return node;
    };
    const path = (d, attributes = {}, parent = art) => add('path', { d, ...attributes }, parent);

    if (style === 'arc-atlas') {
      // An open instrument scale follows the actual member arc. Ornament is
      // confined to the rim; the center stays open for the chord sweeps.
      const dial = add('g', { opacity: .55 });
      const polar = (angle, radius) => ({ x: 320 + Math.cos(angle) * radius, y: 292 + Math.sin(angle) * radius });
      for (const radius of [192, 201, 224, 234]) {
        path(`M ${pointText(polar(-1.70, radius))} A ${radius} ${radius} 0 1 1 ${pointText(polar(1.70, radius))}`, {
          'stroke-width': radius === 234 ? 1.15 : .65,
          opacity: radius < 210 ? .25 : .7
        }, dial);
      }
      for (let tick = 0; tick <= 64; tick++) {
        const angle = -1.65 + tick / 64 * 3.3, major = tick % 8 === 0;
        path(`M ${pointText(polar(angle, major ? 224 : 230))} L ${pointText(polar(angle, 236))}`, {
          'stroke-width': major ? 1.15 : .7, opacity: major ? .84 : .39
        }, dial);
      }
      // The focus avatar's two rings live in CSS, where they follow its
      // screen-pixel size rather than this independently scaled SVG viewBox.
      for (const angle of [-1.7, 1.7]) {
        const point = polar(angle, 234);
        add('circle', { cx: point.x, cy: point.y, r: 2.1, fill: '#ead6a0', 'fill-opacity': .7, 'stroke-width': .5 });
      }
    } else if (style === 'orrery') {
      const dial = add('g', { opacity: .56 });
      for (const r of [178, 190, 201, 231, 238]) add('circle', { cx: 320, cy: 292, r, 'stroke-width': r === 238 ? 1.5 : .65, opacity: r < 210 ? .35 : .74 }, dial);
      for (let tick = 0; tick < 120; tick++) {
        const angle = tick / 120 * Math.PI * 2, major = tick % 10 === 0, radius = 238;
        const inner = radius - (major ? 12 : tick % 5 === 0 ? 8 : 4);
        path(`M ${pointText({ x: 320 + Math.cos(angle) * inner, y: 292 + Math.sin(angle) * inner })} L ${pointText({ x: 320 + Math.cos(angle) * radius, y: 292 + Math.sin(angle) * radius })}`, { opacity: major ? .85 : .46, 'stroke-width': major ? 1.2 : .7 }, dial);
      }
      // Offset ellipses evoke an armillary sphere without pretending to be
      // additional project nodes. Only the HTML thumbnail buttons are nodes.
      const celestial = add('g', { class: 'pc-art-precess', opacity: .37 });
      for (const angle of [-42, 23, 81]) {
        add('ellipse', { cx: 320, cy: 292, rx: 176, ry: 63, transform: `rotate(${angle} 320 292)`, 'stroke-width': .8 }, celestial);
        add('ellipse', { cx: 320, cy: 292, rx: 173, ry: 60, transform: `rotate(${angle} 320 292)`, 'stroke-width': .45, opacity: .38 }, celestial);
      }
      path('M 320 104 L 320 143 M 301 123 L 339 123 M 317 120 L 323 126 M 323 120 L 317 126', { opacity: .65 });
      for (const [x, y, r] of [[177, 179, 3], [448, 415, 4], [202, 411, 2], [445, 171, 2]]) {
        path(`M ${x - r * 2} ${y} L ${x + r * 2} ${y} M ${x} ${y - r * 2} L ${x} ${y + r * 2}`, { opacity: .42 });
        add('circle', { cx: x, cy: y, r: .9, fill: '#fff4ca', stroke: 'none' });
      }
      const bearing = add('g', { transform: 'translate(320 537)', opacity: .55 });
      path('M -42 0 L 42 0 M -28 5 L 28 5 M 0 -10 L 0 10', {}, bearing);
      add('circle', { cx: 0, cy: 0, r: 5, fill: '#1b1a12', 'stroke-width': 1.2 }, bearing);
    } else if (style === 'interference') {
      const waves = add('g', { class: 'pc-art-breathe', opacity: .43 });
      for (let contour = 0; contour < 13; contour++) {
        const radius = 106 + contour * 8;
        const points = Array.from({ length: 101 }, (_, step) => {
          const angle = step / 100 * Math.PI * 2;
          const r = radius + Math.sin(angle * 3 + contour * .27) * 13 + Math.cos(angle * 2 - contour * .17) * 8;
          return pointText({ x: 320 + Math.cos(angle) * r, y: 292 + Math.sin(angle) * r * .91 });
        });
        path(`M ${points.join(' L ')} Z`, { stroke: contour % 3 ? '#92d8d1' : '#c5a2e3', opacity: contour % 3 ? .28 : .52, 'stroke-width': contour % 3 ? .6 : 1 });
      }
      const caustic = add('g', { class: 'pc-art-drift', opacity: .43 });
      path('M 157 225 C 189 164 290 179 343 217 C 396 255 459 221 471 179 M 174 414 C 207 453 291 407 322 372 C 363 326 436 364 455 405', { stroke: '#c1e9e4', 'stroke-width': 1.2 }, caustic);
      path('M 161 228 C 195 170 287 184 340 221 C 396 261 459 226 476 181 M 170 418 C 206 461 295 413 326 377 C 362 335 432 368 453 410', { stroke: '#d2b3e6', 'stroke-width': .7, opacity: .57 }, caustic);
    } else if (style === 'opaline') {
      const tracery = add('g', { opacity: .46, stroke: '#b9936f' });
      const polar = (angle, radius) => ({ x: 320 + Math.cos(angle) * radius, y: 292 + Math.sin(angle) * radius });
      for (const radius of [181, 226, 236]) {
        const points = Array.from({ length: 12 }, (_, i) => pointText(polar(i / 12 * Math.PI * 2 - Math.PI / 2, radius)));
        path(`M ${points.join(' L ')} Z`, { 'stroke-width': radius === 236 ? 1.3 : .7 }, tracery);
      }
      const panes = add('g', { class: 'pc-art-breathe' }, tracery);
      for (let petal = 0; petal < 12; petal++) {
        const angle = petal / 12 * Math.PI * 2 - Math.PI / 2;
        const a = polar(angle - .24, 180), b = polar(angle, 225), c = polar(angle + .24, 180), inner = polar(angle, 121);
        path(`M ${pointText(a)} L ${pointText(b)} L ${pointText(c)} L ${pointText(inner)} Z`, { fill: palette(style)[petal % 8], 'fill-opacity': .11, 'stroke-width': .9 }, panes);
        path(`M ${pointText(b)} L ${pointText(inner)} M ${pointText(a)} L ${pointText(c)}`, { opacity: .57, 'stroke-width': .6 }, panes);
      }
      path('M 272 525 L 320 548 L 368 525 M 284 526 L 320 542 L 356 526 M 320 530 L 320 549', { opacity: .47 });
    } else if (style === 'ernst') {
      // Engraved fronds, a fossil spiral, and drifting seed forms: a quiet
      // imaginary herbarium beneath the wider, organic ribbons.
      const fronds = add('g', { class: 'pc-art-breathe', opacity: .46 });
      for (let side = 0; side < 2; side++) {
        const frond = add('g', { transform: side ? 'translate(640 606) rotate(180)' : 'translate(0 0)' }, fronds);
        path('M 183 396 C 165 351 171 292 207 234 C 219 214 228 201 230 185', { opacity: .7 }, frond);
        for (let i = 0; i < 11; i++) {
          const t = i / 10;
          const y = 373 - t * 166;
          const x = 178 + t * t * 43;
          const spread = 20 + Math.sin(t * Math.PI) * 23;
          path(`M ${x} ${y} Q ${x - spread} ${y - 6} ${x - spread - 9} ${y - 33} Q ${x - 9} ${y - 20} ${x} ${y}`, { fill: '#829581', 'fill-opacity': .055, opacity: .62 }, frond);
          path(`M ${x + 1} ${y - 5} Q ${x + spread * .65} ${y - 21} ${x + spread * .52} ${y - 38}`, { opacity: .46 }, frond);
        }
      }
      const spiral = [];
      for (let i = 0; i <= 56; i++) {
        const a = i / 56 * Math.PI * 4.6, r = 4 + i * .56;
        spiral.push(`${i ? 'L' : 'M'} ${(425 + Math.cos(a) * r).toFixed(2)} ${(382 + Math.sin(a) * r).toFixed(2)}`);
      }
      path(spiral.join(' '), { opacity: .26, stroke: '#aab89b' });
      const seeds = add('g', { class: 'pc-art-drift', opacity: .4 });
      path('M 301 142 Q 312 119 332 133 Q 323 154 301 142 Z M 313 140 L 328 134', { fill: '#c1ab7b', 'fill-opacity': .12 }, seeds);
      path('M 306 449 Q 326 428 340 446 Q 325 461 306 449 Z M 312 448 L 335 445', { fill: '#b08c74', 'fill-opacity': .12 }, seeds);
    } else if (style === 'klee') {
      // Translucent color fields, musical notation, and an off-axis little sun.
      const blocks = [
        [181, 202, 42, 70, '#9e7770', -8], [225, 184, 43, 35, '#c3a064', -8],
        [368, 158, 48, 45, '#829da7', 8], [420, 211, 32, 61, '#b69b71', 8],
        [390, 364, 43, 60, '#ab7881', -5], [335, 420, 48, 26, '#bba269', -5],
        [195, 366, 34, 38, '#85a297', 4], [224, 407, 49, 24, '#8a92aa', 4]
      ];
      const fields = add('g', { class: 'pc-art-breathe' });
      for (const [x, y, width, height, color, angle] of blocks) {
        add('rect', { x, y, width, height, fill: color, 'fill-opacity': .105, stroke: color, 'stroke-opacity': .25, transform: `rotate(${angle} ${x + width / 2} ${y + height / 2})` }, fields);
      }
      const score = add('g', { opacity: .34 });
      for (let i = 0; i < 4; i++) {
        path(`M 210 ${157 + i * 9} Q 270 ${163 + i * 8} 324 ${155 + i * 9}`, { 'stroke-width': .7 }, score);
        path(`M 314 ${426 + i * 8} Q 374 ${435 + i * 8} 419 ${423 + i * 8}`, { 'stroke-width': .7 }, score);
      }
      path('M 238 152 L 238 178 M 281 155 L 281 181 M 349 420 L 349 444 M 392 427 L 392 449', {}, score);
      for (const [cx, cy] of [[235, 178], [278, 181], [346, 444], [389, 449]]) {
        add('ellipse', { cx, cy, rx: 4, ry: 2.6, fill: '#d3b978', stroke: 'none' }, score);
      }
      add('circle', { cx: 426, cy: 179, r: 17, opacity: .48, fill: '#c4a067', 'fill-opacity': .06 });
      path('M 426 152 L 426 141 M 444 162 L 452 154 M 452 181 L 463 182 M 407 163 L 399 155', { opacity: .38 });
      path('M 153 321 L 173 311 L 192 326 L 213 303 M 439 337 L 454 351 L 468 339', { opacity: .35, stroke: '#96ada6' });
    } else if (style === 'chirico') {
      // Arcades recede toward one vanishing point; the shadows have the same
      // direction, so the architectural feeling survives the abstract setting.
      const architecture = add('g', { opacity: .43 });
      path('M 166 377 L 282 313 L 453 371 L 397 435 L 279 358 L 207 435 Z', { fill: '#a68151', 'fill-opacity': .07, stroke: 'none' }, architecture);
      path('M 162 354 L 278 292 L 461 355 M 179 406 L 278 292 L 424 411 M 221 447 L 278 292 L 377 441', { opacity: .35, 'stroke-width': .8 }, architecture);
      const arcades = [
        { x: 160, y: 284, width: 42, height: 102 },
        { x: 209, y: 286, width: 30, height: 78 },
        { x: 245, y: 287, width: 20, height: 54 }
      ];
      for (const { x, y, width, height } of arcades) {
        path(`M ${x} ${y + height} L ${x} ${y + width / 2} A ${width / 2} ${width / 2} 0 0 1 ${x + width} ${y + width / 2} L ${x + width} ${y + height - width * .43}`, { fill: '#be9c70', 'fill-opacity': .085, 'stroke-width': 1.5 }, architecture);
        path(`M ${x + 6} ${y + height - 4} L ${x + 6} ${y + width / 2 + 4} A ${Math.max(width / 2 - 6, 3)} ${Math.max(width / 2 - 6, 3)} 0 0 1 ${x + width - 6} ${y + width / 2 + 4} L ${x + width - 6} ${y + height - width * .43}`, { opacity: .32 }, architecture);
        path(`M ${x} ${y + height} L ${x + 74} ${y + height + 44} L ${x + width + 48} ${y + height + 26} L ${x + width} ${y + height - width * .43} Z`, { fill: '#b49c62', 'fill-opacity': .10, stroke: 'none' }, architecture);
      }
      path('M 397 353 L 397 251 L 425 241 L 437 248 L 437 367 Z M 425 241 L 425 360 M 397 251 L 425 259 L 437 248', { opacity: .5, fill: '#999980', 'fill-opacity': .06 }, architecture);
      path('M 404 328 L 404 275 Q 410 259 416 275 L 416 331 M 397 353 L 343 406 L 381 421 L 437 367', { opacity: .54 }, architecture);
      add('ellipse', { cx: 351, cy: 177, rx: 41, ry: 12, opacity: .21 });
      add('circle', { cx: 363, cy: 165, r: 18, fill: '#d5bd7e', 'fill-opacity': .12, opacity: .57, class: 'pc-art-drift' });
      path('M 310 210 L 457 210 M 332 216 L 440 216', { opacity: .17 });
    } else if (style === 'dali') {
      // A soft horizon and a drooping elliptical orbit; the lower silhouette is
      // suspended rather than grounded, with just a hairline shadow beneath it.
      const elastic = add('g', { class: 'pc-art-breathe', opacity: .38 });
      path('M 169 271 C 158 196 245 158 327 165 C 408 170 462 206 469 256 C 474 282 447 289 443 329 C 439 367 436 417 413 405 C 394 395 419 347 386 346 C 357 345 369 422 343 431 C 312 441 316 385 294 390 C 267 396 280 455 253 449 C 232 444 247 400 222 391 C 187 378 169 326 169 271 Z', { stroke: '#bea987', 'stroke-width': 1.1 }, elastic);
      path('M 207 373 C 248 342 268 376 294 369 C 320 360 349 356 364 373 C 381 390 347 394 351 415 C 355 447 337 451 331 427 C 325 407 307 407 310 432 C 313 453 292 451 295 423 C 296 400 275 415 270 435 C 265 454 249 442 257 418 C 262 402 228 405 207 373 Z', { fill: '#c4a879', 'fill-opacity': .10, stroke: '#d3bb87', opacity: .86 }, elastic);
      path('M 218 377 C 251 365 264 388 292 380 C 319 372 338 369 354 379', { opacity: .53 }, elastic);
      add('ellipse', { cx: 294, cy: 465, rx: 68, ry: 4, opacity: .16, fill: '#ba956c', 'fill-opacity': .07 });
      path('M 172 234 C 225 237 246 217 266 227 C 275 232 271 254 282 253 C 293 252 286 222 311 218 C 343 212 373 236 423 229', { opacity: .24 });
      const moons = add('g', { class: 'pc-art-drift', opacity: .52 });
      add('ellipse', { cx: 390, cy: 185, rx: 27, ry: 11, transform: 'rotate(-21 390 185)', stroke: '#9bbbbb' }, moons);
      path('M 377 193 C 380 207 375 218 382 221 C 391 224 387 205 390 196', { stroke: '#9bbbbb' }, moons);
      add('circle', { cx: 206, cy: 193, r: 6, fill: '#dbc687', 'fill-opacity': .36, stroke: 'none' }, moons);
    } else {
      // The unadorned new layout remains an elegant baseline for comparison.
      const weave = add('g', { opacity: .18 });
      path('M 192 190 Q 320 161 448 190 M 192 398 Q 320 428 448 398', { 'stroke-width': .8 }, weave);
      path('M 188 194 Q 320 174 452 194 M 188 394 Q 320 415 452 394', { opacity: .55, 'stroke-width': .6 }, weave);
    }
    svg.append(art);
    return art;
  }

  const appearanceCache = new WeakMap();
  let appearanceSequence = 0;
  const finishPalettes = {
    brass: [[0, '#352715'], [20, '#a47638'], [39, '#d9b868'], [47, '#f8e7ba'], [49, '#fffbed'], [51, '#80552a'], [67, '#3a3020'], [82, '#b78b4e'], [100, '#e7cb8c']],
    glass: [[0, '#214740'], [22, '#76b4aa'], [41, '#214d53'], [49, '#e0fff3'], [51, '#b5cdeb'], [54, '#3a566a'], [77, '#756284'], [100, '#bdccb9']],
    nixie: [[0, '#2f2119'], [27, '#713b1b'], [45, '#c6772e'], [49, '#ffd197'], [51, '#fff0c6'], [54, '#aa4d1d'], [76, '#57331d'], [100, '#dc9651']]
  };
  // Alter the pigment in cached gradient stops, not a filtered bitmap of the
  // whole graph. Text, thumbnails and sharp metallic highlights stay clear.
  function saturateColor(color, factor) {
    if (!/^#[0-9a-f]{6}$/i.test(color) || factor === 1) return color;
    const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
    const gray = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    return '#' + rgb.map(value => Math.round(Math.max(0, Math.min(255, gray + (value - gray) * factor))).toString(16).padStart(2, '0')).join('');
  }
  const appearanceNode = (tag, attributes = {}) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  };

  function createAppearance(svg) {
    const definitions = svg.querySelector('defs');
    if (!definitions) return null;
    const prefix = `pc-finish-${++appearanceSequence}`;
    const light = appearanceNode('linearGradient', { id: `${prefix}-light`, x1: '0%', y1: '100%', x2: '100%', y2: '0%' });
    for (const [offset, opacity] of [[0, 0], [28, 0], [42, .08], [47, .8], [49, 1], [51, .05], [63, 0], [79, .2], [81, 0], [100, 0]]) {
      light.append(appearanceNode('stop', { offset: `${offset}%`, 'stop-color': '#fffbe6', 'stop-opacity': opacity }));
    }
    const blur = appearanceNode('filter', { id: `${prefix}-bloom`, x: '-20%', y: '-20%', width: '140%', height: '140%' });
    blur.append(appearanceNode('feGaussianBlur', { stdDeviation: 2.4 }));
    definitions.append(light, blur);
    const gradients = [], pigmentStops = new Map();

    // The decorations follow the existing ribbons. Each branch owns its marks,
    // so relationship hover, rotation and click handling stay unchanged.
    for (const [index, ribbon] of [...svg.querySelectorAll('.pc-ribbon')].entries()) {
      const branch = ribbon.parentElement;
      const spine = branch.querySelector(':scope > .pc-ribbon-spine');
      const outline = ribbon.getAttribute('d');
      if (!outline || !spine) continue;
      const gradient = appearanceNode('linearGradient', { id: `${prefix}-metal-${index}` });
      const fillId = ribbon.getAttribute('fill')?.match(/^url\(#([^)]*)\)$/)?.[1];
      const originalGradient = fillId ? [...definitions.children].find(child => child.id === fillId) : null;
      for (const stop of originalGradient?.querySelectorAll('stop') || []) {
        if (!pigmentStops.has(stop)) pigmentStops.set(stop, stop.getAttribute('stop-color'));
      }
      for (const attribute of ['gradientUnits', 'x1', 'y1', 'x2', 'y2']) {
        const value = originalGradient?.getAttribute(attribute);
        if (value !== null && value !== undefined) gradient.setAttribute(attribute, value);
      }
      const clip = appearanceNode('clipPath', { id: `${prefix}-clip-${index}`, clipPathUnits: 'userSpaceOnUse' });
      clip.append(appearanceNode('path', { d: outline }));
      definitions.append(gradient, clip);
      gradients.push(gradient);
      const marks = appearanceNode('g', { class: 'pc-finish', 'aria-hidden': 'true', 'pointer-events': 'none' });
      marks.append(
        appearanceNode('path', { d: outline, class: 'pc-finish-body', fill: `url(#${gradient.id})` }),
        appearanceNode('path', { d: outline, class: 'pc-finish-specular', fill: `url(#${light.id})` }),
        appearanceNode('path', { d: spine.getAttribute('d'), class: 'pc-finish-bloom', filter: `url(#${blur.id})` })
      );
      const engraving = appearanceNode('g', { 'clip-path': `url(#${clip.id})` });
      // Every generated spine is a cubic. Sampling its normal directly avoids
      // layout-dependent SVG geometry queries during slider interaction.
      const coordinates = spine.getAttribute('d').match(/-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi)?.map(Number);
      if (coordinates?.length === 8) {
        const curve = Array.from({ length: 4 }, (_, i) => ({ x: coordinates[i * 2], y: coordinates[i * 2 + 1] }));
        const rails = [-6, 6].map(offset => `M ${Array.from({ length: 33 }, (_, step) => pointText(sample(curve, step / 32, offset))).join(' L ')}`).join(' ');
        const ticks = Array.from({ length: 19 }, (_, tick) => {
          const t = (tick + 1) / 20, width = tick % 4 === 0 ? 5 : 2.4;
          return `M ${pointText(sample(curve, t, -width))} L ${pointText(sample(curve, t, width))}`;
        }).join(' ');
        engraving.append(
          appearanceNode('path', { d: rails, class: 'pc-finish-rails' }),
          appearanceNode('path', { d: ticks, class: 'pc-finish-ticks' }),
          appearanceNode('path', { d: rails, class: 'pc-finish-filament' })
        );
      }
      marks.append(engraving, appearanceNode('path', { d: spine.getAttribute('d'), class: 'pc-finish-hot-wire' }));
      // Keep the original moving light above the finish without duplicating it.
      branch.insertBefore(marks, branch.querySelector(':scope > .pc-ribbon-light'));
    }
    return { gradients, pigmentStops, material: null, saturation: null };
  }

  function applyAppearance(diagram, settings = {}) {
    if (!diagram) return;
    const material = Object.hasOwn(finishPalettes, settings.material) ? settings.material : 'original';
    const amount = value => Math.max(0, Math.min(100, Number(value) || 0)) / 100;
    const specular = amount(settings.specular), glow = amount(settings.glow);
    const brassMix = amount(settings.brassMix);
    const saturation = Math.max(.65, Math.min(2, Number(settings.saturation) / 100 || 1));
    diagram.dataset.finish = material;
    diagram.classList.toggle('pc-finish-etched', Boolean(settings.etching));
    diagram.classList.toggle('pc-finish-rimmed', Boolean(settings.rim));
    diagram.classList.toggle('pc-finish-lit', glow > 0);
    diagram.style.setProperty('--pc-finish-specular', specular);
    diagram.style.setProperty('--pc-finish-glow', glow);
    diagram.style.setProperty('--pc-brass-mix', brassMix);
    const svg = diagram.querySelector(':scope > svg');
    if (!svg) return;
    let appearance = appearanceCache.get(svg);
    if (!appearance && (material !== 'original' || specular || glow || settings.etching || brassMix || saturation !== 1)) {
      appearance = createAppearance(svg);
      if (appearance) appearanceCache.set(svg, appearance);
    }
    if (appearance && (appearance.material !== material || appearance.saturation !== saturation)) {
      const stops = finishPalettes[material] || finishPalettes.brass;
      for (const [stop, originalColor] of appearance.pigmentStops) stop.setAttribute('stop-color', saturateColor(originalColor, saturation));
      for (const gradient of appearance.gradients) {
        gradient.replaceChildren(...stops.map(([offset, color]) => appearanceNode('stop', { offset: `${offset}%`, 'stop-color': saturateColor(color, saturation) })));
      }
      appearance.material = material;
      appearance.saturation = saturation;
    }
  }

  window.PortfolioConnectionArt = { draw, palette, control, ribbonStops, decorateRibbon, applyAppearance };
})();
