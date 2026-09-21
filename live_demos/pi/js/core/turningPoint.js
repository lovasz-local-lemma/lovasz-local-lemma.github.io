import { getSim } from './registry.js';

const cases = [
  { label: 'Elastic seed', id: 'two-blocks', params: { n: 2 }, title: 'One energy circle; two fixed mirrors.', text: 'The mass ratio sets the angle between the reflection lines. Count the impacts until both blocks can escape. This is the reference for every change below.' },
  { label: 'Double the speed', id: 'two-blocks', params: { n: 2, velocity: 2 }, title: 'A bigger energy circle, the same angles.', text: 'Doubling the launch speed quadruples the energy. After normalizing by the initial radius, the trace lies exactly on the old circle. The blocks finish sooner; the number of collisions is unchanged.' },
  { label: 'Make it roll', id: 'rolling-sliding', params: { n: 2, inertia: 1 }, title: 'Rotation counts as effective mass.', text: 'A no-slip constraint ties spin to translation: m_eff = m + I/r². Here the heavy mass is adjusted with it, keeping M/m_eff = 10,000. It is that preserved ratio—not rolling by itself—that preserves the count.' },
  { label: 'Lose 1% at contact', id: 'restitution-galperin', params: { n: 2, epsilon: .99, contact: 'block' }, title: 'The mirrors stay put. The bounce changes.', text: 'Restitution 0.99 scales the relative normal velocity at block contact. Each impact is a reflection followed by a contraction towards its mirror. The angular progress changes as well as the energy: this run needs more collisions, not fewer.' },
];

// Run the actual registered engine, without constructing a renderer. The bounded
// experiment is cached per choice and never consumes a per-frame animation loop.
export function collectTurningTrace(SimClass, params) {
  const sim = new SimClass(params);
  const points = [[...sim.getPhasePoint()]];
  for (let i = 0; i < 5000 && !sim.finished; i++) {
    sim.step(.1);
    for (const point of sim.pendingPhasePoints) points.push([...point]);
    sim.pendingPhasePoints.length = 0;
    sim.pendingRawPhasePoints.length = 0;
  }
  return { points, count: sim.getCollisionCount(), finished: sim.finished, outcome: sim.outcome, estimate: sim.getPiApproximation() };
}

export function createTurningPoint() {
  const section = document.getElementById('what-changes') || document.createElement('section');
  section.hidden = false;
  section.className = 'turning-point'; section.id = 'what-changes';
  section.innerHTML = `<span class="atelier-eyebrow">02 · The turning point · ↔ Interactive comparison</span>
    <h2>Then what changes would actually matter?</h2>
    <p>A different-looking machine can hide the same mathematical problem. Before adding more machinery, change one assumption and watch what happens to its geometry.</p>
    <div class="turning-body"><div><svg viewBox="0 0 360 310" role="img" aria-label="Measured normalized momentum trace">
      <path d="M25 155H335 M180 20V290" stroke="#788d7544" fill="none"/><circle cx="180" cy="155" r="115" fill="none" stroke="#d7bf7370" stroke-dasharray="2 5"/>
      <polyline data-trace fill="none" stroke="#95e1c6" stroke-width=".9" opacity=".82"/>
      <text x="340" y="146" fill="#c2cbb9" font-size="11" text-anchor="end">Q₁ / R₀</text><text x="192" y="25" fill="#c2cbb9" font-size="11">Q₂ / R₀</text>
    </svg><p class="turning-note">Actual collision states · Qᵢ = √mᵢ vᵢ · each trace uses its own initial radius R₀.</p></div>
    <div><div class="turning-choices" role="group" aria-label="Change one assumption">${cases.map((c,i) => `<button type="button" data-case="${i}" aria-pressed="${i===0}">${c.label}</button>`).join('')}</div>
    <div class="turning-copy" aria-live="polite"></div><div class="turning-readout"></div><a class="chapter-link" data-open>Explore this machine ↗</a></div></div>`;
  const cache = new Map();
  function select(index) {
    const c = cases[index];
    if (!cache.has(index)) cache.set(index, collectTurningTrace(getSim(c.id), c.params));
    const result = cache.get(index);
    section.querySelectorAll('[data-case]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.case) === index)));
    section.querySelector('[data-trace]').setAttribute('points', result.points.map(p => `${(180 + p[0]*115).toFixed(2)},${(155-p[1]*115).toFixed(2)}`).join(' '));
    section.querySelector('[data-trace]').setAttribute('stroke', index===3 ? '#ffb375' : '#95e1c6');
    section.querySelector('.turning-copy').innerHTML = `<strong>${c.title}</strong>${c.text}`;
    section.querySelector('.turning-readout').textContent = result.finished && result.outcome !== 'collapse' ? `${result.count} collisions  ·  N / 100 = ${(result.count/100).toFixed(2)}` : 'Run did not escape; no digit estimate.';
    section.querySelector('[data-open]').href = `sim.html?id=${c.id}#${new URLSearchParams(c.params)}`;
  }
  section.querySelectorAll('[data-case]').forEach(b => b.addEventListener('click', () => select(Number(b.dataset.case))));
  select(0);
  return section;
}
