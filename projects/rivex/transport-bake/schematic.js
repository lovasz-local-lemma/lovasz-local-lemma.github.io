import {gateWeight, binWeights} from './model.js';

const NS = 'http://www.w3.org/2000/svg';
const prepared = new WeakMap();
let mounted;

function node(tag, attributes = {}, text = '') {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text) element.textContent = text;
  return element;
}

function label(parent, x, y, text, options = {}) {
  const element = node('text', {x, y, fill: '#a9c1c2', 'font-size': 12, ...options}, text);
  parent.append(element);
  return element;
}

// Recover ray legs from the retained sheet vertices. The Rive guide pool only
// samples one polar ring, which cannot illustrate the whole arrival domain.
// Collinear vertices with the same direction/stage retain their optical clock;
// drawing a bounded selection requires no additional transport solve.
function geometry(model) {
  if (prepared.has(model)) return prepared.get(model);
  const sheet = model.sheet, legs = new Map();
  for (let i = 0; i < sheet.optical.length; i++) {
    const offset = i * 3, stage = sheet.stage[i];
    const key = stage + ':' + [...sheet.direction.subarray(offset, offset + 3)].join(',');
    let leg = legs.get(key);
    if (!leg) {leg = {L0: Infinity, L1: -Infinity, stage, glass: false};legs.set(key, leg);}
    const length = sheet.optical[i];
    if (length < leg.L0) {leg.L0 = length;leg.a = [...sheet.position.subarray(offset, offset + 3)];}
    if (length > leg.L1) {leg.L1 = length;leg.b = [...sheet.position.subarray(offset, offset + 3)];}
  }
  const segments = [];
  for (const stage of new Set([...legs.values()].map(leg => leg.stage))) {
    const family = [...legs.values()].filter(leg => leg.stage === stage && leg.L1 > leg.L0).sort((a, b) => a.L1 - b.L1);
    const count = Math.min(24, family.length);
    for (let i = 0; i < count; i++) segments.push(family[Math.round(i * (family.length - 1) / Math.max(1, count - 1))]);
  }
  for (const sample of model.rays.slice(0, 8)) {
    for (const segment of sample.path.glassSegments) segments.push({...segment, glass: true});
  }
  const horizontal = p => .85 * p[0] + .5267827 * p[2];
  const points = segments.flatMap(segment => [segment.a, segment.b]);
  let xmin = Infinity, xmax = -Infinity, ymax = 0;
  for (const p of points) {
    xmin = Math.min(xmin, horizontal(p));
    xmax = Math.max(xmax, horizontal(p));
    ymax = Math.max(ymax, p[1]);
  }
  for (const sphere of model.scene.spheres) {
    xmin = Math.min(xmin, horizontal(sphere.c) - sphere.r);
    xmax = Math.max(xmax, horizontal(sphere.c) + sphere.r);
  }
  const scale = Math.min(320 / Math.max(.1, xmax - xmin), 228 / Math.max(1, ymax));
  const project = p => [242 + (horizontal(p) - (xmin + xmax) / 2) * scale, 310 - p[1] * scale];
  const line = (a, b) => {
    const p = project(a), q = project(b);
    return `M${p[0].toFixed(2)},${p[1].toFixed(2)}L${q[0].toFixed(2)},${q[1].toFixed(2)}`;
  };
  const data = {segments, project, line, scale};
  prepared.set(model, data);
  return data;
}

const intervals = [-3, -2, -1.5, -1, -.5, 0, .5, 1, 1.5, 2, 3];
const interpolate = (segment, length) => {
  const t = (length - segment.L0) / (segment.L1 - segment.L0);
  return segment.a.map((value, i) => value + (segment.b[i] - value) * t);
};

function mount(svg, model) {
  const data = geometry(model);
  svg.replaceChildren();
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', 'Retained hourglass with a moving optical gate, beside the weights of the stored receiver slices. Drag the receiver time plot or use arrow keys to scrub.');
  const left = node('g'), right = node('g');
  svg.append(left, right);
  for (const group of [left, right]) {
    group.append(node('rect', {x: 8, y: 8, width: 484, height: 358, rx: 16, fill: '#0a191f', stroke: '#38555b'}));
  }
  label(left, 28, 35, 'VOLUME · KEEP THE RAY FAMILY', {fill: '#83cfca', 'font-size': 11, 'letter-spacing': 1.2});
  label(left, 28, 61, 'Filter its optical length at playback.', {fill: '#e9e4cf', 'font-size': 17, 'font-family': 'Georgia, serif'});
  const receiver = node('path', {d: 'M60,311H424', stroke: '#b49a67', 'stroke-width': 2});
  left.append(receiver);
  const pulse = [];
  for (const segment of data.segments) {
    left.append(node('path', {d: data.line(segment.a, segment.b), fill: 'none', stroke: segment.glass ? '#bfa56e' : '#406167', 'stroke-width': .85, opacity: .6, ...(segment.glass ? {'stroke-dasharray': '3 3'} : {})}));
    const bands = intervals.slice(1).map(() => node('path', {fill: 'none', stroke: segment.glass ? '#e6c57b' : '#a5fff2', 'stroke-width': segment.glass ? 1.6 : 2.4, 'stroke-linecap': 'round'}));
    left.append(...bands);
    pulse.push({segment, bands});
  }
  for (const sphere of model.scene.spheres) {
    const [cx, cy] = data.project(sphere.c);
    left.append(node('circle', {cx, cy, r: sphere.r * data.scale, fill: '#a9dfee08', stroke: '#78bcbfaa', 'stroke-width': 1.2}));
  }
  const source = data.project(model.scene.lights[0].p);
  left.append(node('circle', {cx: source[0], cy: source[1], r: 3.8, fill: '#e6c57b'}));
  label(left, 30, 345, 'Glass adds n × distance; sheets remain in the medium.', {'font-size': 11});

  label(right, 28, 35, 'RECEIVER · STORE ARRIVAL LAYERS', {fill: '#e6c57b', 'font-size': 11, 'letter-spacing': 1.1});
  label(right, 28, 61, 'Sample the same window at each layer.', {fill: '#e9e4cf', 'font-size': 17, 'font-family': 'Georgia, serif'});
  const plot = node('g', {tabindex: 0, role: 'slider', 'aria-label': 'Receiver arrival time', 'aria-valuemin': model.timeMin.toFixed(4), 'aria-valuemax': model.timeMax.toFixed(4), style: 'cursor:ew-resize;touch-action:none'});
  // A transparent hit region also makes the empty part of the plot draggable.
  plot.append(node('rect', {x: 30, y: 82, width: 436, height: 218, fill: '#0a191f'}));
  for (const y of [106, 159, 212]) plot.append(node('path', {d: `M42,${y}H458`, stroke: '#34505b', 'stroke-width': .5}));
  label(plot, 32, 104, '1', {'text-anchor': 'end', 'font-size': 10});
  label(plot, 32, 215, '0', {'text-anchor': 'end', 'font-size': 10});
  const curve = node('path', {fill: '#83cfca15', stroke: '#83cfca', 'stroke-width': 1.7});
  const cursor = node('path', {stroke: '#d9b8e2', 'stroke-width': 1, 'stroke-dasharray': '3 4'});
  plot.append(curve, cursor);
  const bars = [], dots = [];
  for (let i = 0; i < model.bins; i++) {
    const x = 42 + 416 * i / (model.bins - 1);
    plot.append(node('path', {d: `M${x},262V278`, stroke: '#456065', 'stroke-width': Math.min(9, 250 / model.bins)}));
    const bar = node('path', {d: `M${x},278V278`, stroke: '#e6c57b', 'stroke-width': Math.min(9, 250 / model.bins)});
    const dot = node('circle', {cx: x, cy: 212, r: model.bins > 32 ? 1.6 : 2.6, fill: '#e6c57b'});
    plot.append(bar, dot);
    bars.push(bar);dots.push(dot);
  }
  const ends = [model.timeMin, model.timeMax];
  label(plot, 42, 296, `${ends[0].toFixed(2)} m`, {'font-size': 10});
  label(plot, 458, 296, `${ends[1].toFixed(2)} m`, {'font-size': 10, 'text-anchor': 'end'});
  right.append(plot);
  label(right, 30, 328, 'TEAL  continuous gate     GOLD  stored layer weights', {'font-size': 10});
  label(right, 30, 347, `${model.bins} arrival layers · drag the chart to scrub`, {'font-size': 11});

  const clamp = value => Math.max(model.timeMin, Math.min(model.timeMax, value));
  const scrub = time => svg.dispatchEvent(new CustomEvent('transport-time-scrub', {bubbles: true, detail: {time: clamp(time)}}));
  let dragging = false;
  const pointerTime = event => {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(plot.getScreenCTM().inverse());
    scrub(model.timeMin + (point.x - 42) / 416 * (model.timeMax - model.timeMin));
  };
  plot.addEventListener('pointerdown', event => {dragging = true;plot.setPointerCapture(event.pointerId);plot.focus({preventScroll: true});pointerTime(event);});
  plot.addEventListener('pointermove', event => {if (dragging) pointerTime(event);});
  plot.addEventListener('pointerup', () => {dragging = false;});
  plot.addEventListener('pointercancel', () => {dragging = false;});
  plot.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const value = Number(plot.getAttribute('aria-valuenow'));
    scrub(event.key === 'Home' ? model.timeMin : event.key === 'End' ? model.timeMax : value + (event.key === 'ArrowRight' ? 1 : -1) * model.timeStep / 4);
  });
  return {svg, model, data, left, right, pulse, curve, cursor, bars, dots, plot};
}

export function drawTemporalSchematic(model, state) {
  const svg = document.getElementById('temporal-schematic');
  if (!svg) return;
  if (!mounted || mounted.model !== model || mounted.svg !== svg) mounted = mount(svg, model);
  const m = mounted, stacked = svg.clientWidth < 680;
  svg.setAttribute('viewBox', stacked ? '0 0 500 752' : '0 0 1000 376');
  m.right.setAttribute('transform', stacked ? 'translate(0,376)' : 'translate(500,0)');
  svg.style.display = 'block';svg.style.width = '100%';svg.style.height = 'auto';
  const sigma = Math.max(.004, state.width * .5);
  for (const {segment, bands} of m.pulse) {
    for (let i = 0; i < bands.length; i++) {
      const lo = state.gate ? Math.max(segment.L0, state.time + intervals[i] * sigma) : segment.L0;
      const hi = state.gate ? Math.min(segment.L1, state.time + intervals[i + 1] * sigma) : segment.L1;
      const visible = hi > lo && (state.gate || i === 0);
      bands[i].setAttribute('d', visible ? m.data.line(interpolate(segment, lo), interpolate(segment, hi)) : '');
      bands[i].setAttribute('opacity', visible ? gateWeight((lo + hi) / 2, state.time, state.width, state.gate).toFixed(4) : '0');
    }
  }
  const span = model.timeMax - model.timeMin, weights = binWeights(model, state.time, state.width, state.gate);
  const samples = Array.from({length: 160}, (_, i) => {
    const t = model.timeMin + span * i / 159;
    return `${(42 + 416 * i / 159).toFixed(2)},${(212 - 106 * gateWeight(t, state.time, state.width, state.gate)).toFixed(2)}`;
  });
  m.curve.setAttribute('d', `M42,212L${samples.join('L')}L458,212Z`);
  const x = 42 + 416 * (state.time - model.timeMin) / span;
  m.cursor.setAttribute('d', state.gate && x >= 42 && x <= 458 ? `M${x},88V280` : '');
  let contributing = 0;
  for (let i = 0; i < weights.length; i++) {
    m.dots[i].setAttribute('cy', 212 - 106 * weights[i]);
    const at = 42 + 416 * i / (weights.length - 1);
    m.bars[i].setAttribute('d', `M${at},278V${278 - 50 * weights[i]}`);
    if (weights[i] > 1e-5) contributing++;
  }
  m.plot.setAttribute('aria-valuenow', Math.max(model.timeMin, Math.min(model.timeMax, state.time)).toFixed(4));
  m.plot.setAttribute('aria-valuetext', `${state.time.toFixed(3)} optical metres${state.gate ? '' : ', gate off'}`);
  const status = document.getElementById('temporal-schematic-status');
  if (status) status.textContent = state.gate
    ? `Gate ${state.time.toFixed(3)} optical m · σ ${sigma.toFixed(3)} m · ${contributing} of ${model.bins} receiver layers contribute. No retracing or rebaking.`
    : `Gate off: the entire retained volume and all ${model.bins} receiver layers are visible. No retracing or rebaking.`;
  // Expose derived values for inspection; they never participate in rendering.
  svg.dataset.activeBins = contributing;
  svg.dataset.time = state.time;
  svg.dataset.gate = String(state.gate);
}
