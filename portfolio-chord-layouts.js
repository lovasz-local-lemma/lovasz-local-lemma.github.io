/* Deterministic geometry only: the explorer owns rendering and interaction. */
(() => {
  'use strict';

  const CENTER = { x: 320, y: 292 }, RADIUS = 210, TAU = Math.PI * 2;
  const pointText = point => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  const polar = (angle, radius = RADIUS, center = CENTER) => ({
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius
  });
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const arc = (center, radius, from, to, clockwise = true) => {
    const start = polar(from, radius, center), end = polar(to, radius, center);
    return `M ${pointText(start)} A ${radius} ${radius} 0 0 ${clockwise ? 1 : 0} ${pointText(end)}`;
  };

  function randomFor(text) {
    let hash = 2166136261;
    for (const character of String(text)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return () => {
      hash |= 0;
      hash = hash + 0x6D2B79F5 | 0;
      let value = Math.imul(hash ^ hash >>> 15, 1 | hash);
      value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(values, random) {
    for (let index = values.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [values[index], values[other]] = [values[other], values[index]];
    }
    return values;
  }

  function topology(count, random) {
    if (count < 2) return [];
    if (count === 2) return [[0, 1]];
    const order = shuffle(Array.from({ length: count }, (_, index) => index), random);
    const pairs = [], keys = new Set();
    const add = (a, b) => {
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      if (a === b || keys.has(key)) return false;
      pairs.push([a, b]);
      keys.add(key);
      return true;
    };
    order.forEach((value, index) => add(value, order[(index + 1) % count]));
    const extras = count < 4 ? 0 : Math.min(3, Math.floor((count - 1) / 2));
    const candidates = [];
    for (let a = 0; a < count; a++) {
      for (let b = a + 1; b < count; b++) candidates.push([a, b]);
    }
    let added = 0;
    for (const [a, b] of shuffle(candidates, random)) {
      if (added >= extras) break;
      if (add(a, b)) added++;
    }
    return pairs;
  }

  function ribbon(source, target, start, end, sourceControl, targetControl, reverseTarget = false) {
    const s0 = polar(start.from, start.radius, start.center), s1 = polar(start.to, start.radius, start.center);
    const t0 = polar(end.from, end.radius, end.center), t1 = polar(end.to, end.radius, end.center);
    const firstTarget = reverseTarget ? t1 : t0, secondTarget = reverseTarget ? t0 : t1;
    const a = sourceControl(s1), b = targetControl(firstTarget);
    const c = targetControl(secondTarget), d = sourceControl(s0);
    const sourceArc = arc(start.center, start.radius, start.from, start.to);
    const targetArc = arc(end.center, end.radius, reverseTarget ? end.to : end.from, reverseTarget ? end.from : end.to, !reverseTarget);
    const outline = `${sourceArc} C ${pointText(a)} ${pointText(b)} ${pointText(firstTarget)} ${targetArc.replace(/^M [\d.-]+ [\d.-]+ /, '')} C ${pointText(c)} ${pointText(d)} ${pointText(s0)} Z`;
    const startPoint = polar((start.from + start.to) / 2, start.radius, start.center);
    const endPoint = polar((end.from + end.to) / 2, end.radius, end.center);
    const control = [startPoint, sourceControl(startPoint), targetControl(endPoint), endPoint];
    return {
      source, target, d: outline,
      spine: `M ${pointText(control[0])} C ${control.slice(1).map(pointText).join(' ')}`,
      arcs: [sourceArc, targetArc], control
    };
  }

  function memberNetwork(count, random) {
    const nodes = Array.from({ length: count }, (_, index) => {
      const angle = -Math.PI / 2 + index * TAU / count;
      return { index, angle, ...polar(angle) };
    });
    const pairs = topology(count, random);
    const attachments = nodes.map(() => []);
    pairs.forEach(([source, target], edge) => {
      attachments[source].push({ edge, other: target });
      attachments[target].push({ edge, other: source });
    });
    const ports = pairs.map(() => ({}));
    attachments.forEach((incident, index) => {
      // Ordering ports by the opposite endpoint gives each member a tidy fan.
      incident.sort((a, b) => ((a.other - index + count) % count) - ((b.other - index + count) % count));
      const span = Math.min(.39 + incident.length * .05, TAU / Math.max(count, 1) * .69);
      const weights = incident.map(() => .72 + random() * .56);
      const total = weights.reduce((sum, value) => sum + value, 0);
      let position = nodes[index].angle - span / 2;
      incident.forEach(({ edge }, slot) => {
        const width = span * weights[slot] / total;
        ports[edge][index] = { center: CENTER, radius: RADIUS, from: position + width * .06, to: position + width * .94 };
        position += width;
      });
    });
    const edges = pairs.map(([source, target], index) => {
      const separation = Math.abs(Math.atan2(Math.sin(nodes[target].angle - nodes[source].angle), Math.cos(nodes[target].angle - nodes[source].angle)));
      const middle = (nodes[source].angle + nodes[target].angle) / 2;
      const offset = (random() - .5) * 36;
      const hub = { x: CENTER.x + Math.cos(middle) * offset, y: CENTER.y + Math.sin(middle) * offset };
      // These are independent chord sweeps; the center title is never a waypoint.
      const sourcePull = .19 + random() * .18 + .08 * (1 - separation / Math.PI);
      const targetPull = .17 + random() * .18 + .06 * (1 - separation / Math.PI);
      return ribbon(source, target, ports[index][source], ports[index][target],
        point => mix(hub, point, sourcePull), point => mix(hub, point, targetPull));
    });
    return { nodes, edges, focus: { ...CENTER } };
  }

  function categoryOnRim(count, random) {
    const focus = { x: 110, y: 292 }, sourceRadius = 28;
    const nodes = Array.from({ length: count }, (_, index) => {
      const angle = count === 1 ? -.16 : -Math.PI * .60 + index * Math.PI * 1.20 / (count - 1);
      return { index, angle, ...polar(angle) };
    });
    const edges = nodes.map(node => {
      const slot = 2.35 / Math.max(count, 1);
      const sourceAngle = count === 1 ? -.08 : -1.175 + slot * (node.index + .5);
      const sourceHalf = Math.min(.40, slot * (.37 + random() * .06));
      const targetHalf = .105 + random() * .046;
      const start = { center: focus, radius: sourceRadius, from: sourceAngle - sourceHalf, to: sourceAngle + sourceHalf };
      const end = { center: CENTER, radius: RADIUS, from: node.angle - targetHalf, to: node.angle + targetHalf };
      const reach = 1.95 + random() * .55;
      const pull = .28 + random() * .17;
      // Leave the real category circle outwards, then arrive at the member rim.
      // Reversing the target arc keeps the two ribbon boundaries on their own sides.
      return ribbon(-1, node.index, start, end,
        point => mix(focus, point, reach), point => mix(CENTER, point, pull), true);
    });
    return { nodes, edges, focus };
  }

  function arcAtlas(count, random) {
    const focus = { x: 110, y: 292 }, sourceRadius = 28;
    const nodes = Array.from({ length: count }, (_, index) => {
      const angle = count === 1 ? 0 : -1.62 + index * 3.24 / (count - 1);
      return { index, angle, ...polar(angle) };
    });
    const edges = nodes.map(node => {
      // Start on the far side of the actual avatar, underneath its image.
      // Both controls pull into the circle, like a chord diagram; there is
      // no outward source-circle fan or second, implied category sector.
      const slot = 2 / Math.max(count, 1);
      const sourceAngle = Math.PI + 1 - slot * (node.index + .5);
      const sourceHalf = Math.min(.26, slot * (.37 + random() * .04));
      const targetHalf = Math.min(.14, 3.24 / Math.max(count, 1) * .26);
      const start = { center: focus, radius: sourceRadius, from: sourceAngle - sourceHalf, to: sourceAngle + sourceHalf };
      const end = { center: CENTER, radius: RADIUS, from: node.angle - targetHalf, to: node.angle + targetHalf };
      const sourcePull = .18 + random() * .06, targetPull = .24 + random() * .08;
      return ribbon(-1, node.index, start, end,
        point => mix(CENTER, point, sourcePull), point => mix(CENTER, point, targetPull));
    });
    return { nodes, edges, focus };
  }

  window.PortfolioChordLayouts = Object.freeze({
    build(mode, count, seedText = '') {
      const size = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
      const random = randomFor(`${mode}:${size}:${seedText}`);
      if (mode === 'arc-atlas') return arcAtlas(size, random);
      return mode === 'category-rim' ? categoryOnRim(size, random) : memberNetwork(size, random);
    }
  });
})();
