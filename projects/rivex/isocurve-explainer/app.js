import { isoLoops } from '../iso-studio/field.js';

const $ = id => document.getElementById(id);
const width = 25, height = 17;
const scalar = new Float32Array(width * height);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const u = (x / (width - 1) - .5) * 2.8, v = (y / (height - 1) - .5) * 1.9;
  const ring = Math.exp(-((Math.hypot((u + .28) * .93, v) - .53) ** 2) / .038);
  const spot = .86 * Math.exp(-((u - .73) ** 2 + (v + .11) ** 2) / .10);
  scalar[y * width + x] = Math.min(1, ring + spot);
}
const xy = (x, y) => [18 + x * 10, 16 + y * 10];
const point = (x, y) => `${x.toFixed(3)},${y.toFixed(3)}`;
const pathData = (loops, transform = xy) => loops.map(loop => 'M' + loop.map(([x, y]) => point(...transform(x, y))).join('L') + 'Z').join('');
const color = value => `rgb(${Math.round(22 + value * 217)},${Math.round(34 + value * 169)},${Math.round(35 + value * 87)})`;
const circle = (x, y, radius, fill, stroke = 'none') => `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" stroke="${stroke}"/>`;
const label = (x, y, text, fill = '#aec4c0', anchor = 'middle', size = 11) => `<text x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" font-size="${size}" font-family="ui-monospace,monospace">${text}</text>`;

// Pick an ordinary two-crossing cell so the enlarged example remains legible.
// The full field still uses native Iso's separated pairing for saddle cells.
function crossingCell(level) {
  let selected = null, best = -Infinity;
  for (let y = 0; y < height - 1; y++) for (let x = 0; x < width - 1; x++) {
    const values = [scalar[y * width + x], scalar[y * width + x + 1], scalar[(y + 1) * width + x + 1], scalar[(y + 1) * width + x]];
    const corners = [[0, 0], [1, 0], [1, 1], [0, 1]], edges = [[0, 1], [1, 2], [3, 2], [0, 3]], crosses = [];
    for (const [a, b] of edges) if ((values[a] >= level) !== (values[b] >= level)) {
      const t = (level - values[a]) / (values[b] - values[a]);
      crosses.push({ a, b, t, position: corners[a].map((n, k) => n + t * (corners[b][k] - n)) });
    }
    const range = Math.max(...values) - Math.min(...values);
    const score = range * (crosses.length === 2 ? .1 + Math.min(...crosses.map(c => Math.min(c.t, 1 - c.t))) : 0);
    if (crosses.length === 2 && score > best) { selected = { x, y, values, corners, crosses }; best = score; }
  }
  return selected;
}

function render() {
  const level = Number($('threshold').value), bands = Number($('bands').value), smooth = $('smooth').checked ? 1 : 0;
  $('threshold-value').value = level.toFixed(2);
  $('bands-value').value = String(bands);
  const loops = isoLoops(scalar, width, height, level, 0), selected = crossingCell(level);
  let field = '';
  for (let y = 0; y < height - 1; y++) for (let x = 0; x < width - 1; x++) {
    const avg = (scalar[y * width + x] + scalar[y * width + x + 1] + scalar[(y + 1) * width + x] + scalar[(y + 1) * width + x + 1]) / 4;
    const [px, py] = xy(x, y);
    field += `<rect x="${px}" y="${py}" width="10" height="10" fill="${color(avg * .72)}" stroke="#aec7bd12" stroke-width=".6"/>`;
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) field += circle(...xy(x, y), scalar[y * width + x] >= level ? 1.5 : .9, scalar[y * width + x] >= level ? '#f3dfa7' : '#617a75');
  field += `<path d="${pathData(loops)}" fill="none" stroke="#9ee5d2" stroke-width="1.5"/>`;
  if (selected) {
    const [x, y] = xy(selected.x, selected.y);
    field += `<rect x="${x - 2}" y="${y - 2}" width="14" height="14" fill="none" stroke="#ffe7a1" stroke-width="2"/>`;
  }
  $('field').innerHTML = field;

  if (selected) {
    const { values, corners, crosses } = selected, local = ([x, y]) => [80 + x * 116, 37 + y * 116];
    const edge = crosses[0], a = values[edge.a], b = values[edge.b];
    let cell = `<rect x="80" y="37" width="116" height="116" fill="#172a2b" stroke="#6d847a" stroke-width="1.5"/>`;
    cell += `<path d="M${point(...local(corners[edge.a]))}L${point(...local(corners[edge.b]))}" fill="none" stroke="#ddc689" stroke-width="3"/>`;
    cell += `<path d="M${point(...local(crosses[0].position))}L${point(...local(crosses[1].position))}" fill="none" stroke="#9ee5d2" stroke-width="2.5"/>`;
    corners.forEach((corner, i) => {
      const [x, y] = local(corner), inside = values[i] >= level;
      cell += circle(x, y, 5, inside ? '#f1d695' : '#334a48', '#b8c9b9');
      const name = i === edge.a ? 'a = ' : i === edge.b ? 'b = ' : '';
      cell += label(x, y + (corner[1] ? 24 : -15), name + values[i].toFixed(3), inside ? '#f1d695' : '#a7bcb8', 'middle', 10);
    });
    for (const cross of crosses) cell += circle(...local(cross.position), 4, '#a9f0dc', '#142923');
    $('cell').innerHTML = cell;
    $('calculation').textContent = `(${level.toFixed(2)} − ${a.toFixed(3)}) / (${b.toFixed(3)} − ${a.toFixed(3)}) ≈ ${edge.t.toFixed(2)}`;
  }

  let fills = '', pathCount = 0;
  for (let k = 0; k < bands; k++) {
    const threshold = .03 + k * .91 / bands, contours = isoLoops(scalar, width, height, threshold, smooth);
    if (!contours.length) continue;
    pathCount++;
    fills += `<path d="${pathData(contours)}" fill="${color((k + .5) / bands)}" fill-rule="evenodd" stroke="none"/>`;
  }
  fills += `<path d="${pathData(isoLoops(scalar, width, height, level, smooth))}" fill="none" stroke="#9ee5d2" stroke-width="1.4"/>`;
  $('paths').innerHTML = fills;
  $('status').textContent = `${width * height} samples → ${pathCount} compound filled paths · ${loops.length} loop${loops.length === 1 ? '' : 's'} at τ`;
  document.body.dataset.ready = 'true';
}

for (const id of ['threshold', 'bands', 'smooth']) $(id).addEventListener('input', render);
render();
// Everything is event-driven: no animation loop, GPU work, or hidden-tab polling.
if (parent !== window) parent.postMessage({ type: 'portfolio-lab-preview-ready' }, location.origin);
