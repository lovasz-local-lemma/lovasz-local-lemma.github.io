import { getAllSims } from './core/registry.js';
import { renderPreview } from './core/cardPreviews.js';
import { CARD_COPY } from './core/readingPath.js';
import { createTurningPoint } from './core/turningPoint.js';
import './sims/TwoBlocks.js';
import './sims/ThreeBlocks.js';
import './sims/NBlocks.js';
import './sims/RotatingDiscs.js';
import './sims/GearRackCounter.js';
import './sims/OpticalWedge.js';
import './sims/ConeKaleidoscope.js';
import './sims/WedgeBilliard.js';
import './sims/HelicalCylinder.js';
import './sims/RollingSliding.js';
import './sims/BuffonNeedle.js';
import './sims/CircleCoverage.js';
import './sims/ReuleauxRailPi.js';
import './sims/ReuleauxCollisionLab.js';
import './sims/CoupledOscillatorWinding.js';
import './sims/LissajousTurnCounter.js';
import './sims/StandingWaveNodePi.js';
import './sims/ChladniPlateEstimator.js';
import './sims/PolygonRollingRoad.js';
import './sims/PendulumRail.js';
import './sims/SphericalTriangleBilliard.js';
import './sims/TetrahedralMirrorRoom.js';
import './sims/CoxeterChamberExplorer.js';
import './sims/TwoPendulums.js';
import './sims/GaussCircleLattice.js';
import './sims/VisibleLatticeTrees.js';
import './sims/SquareFreeSieve.js';
import './sims/LeibnizWalk.js';
import './sims/BaselSumWalker.js';
import './sims/WallisRectangle.js';
import './sims/BuffonCrossGrid.js';
import './sims/SphereVolumeMC.js';
import './sims/BesselZeroCounter.js';
import './sims/PistonGasGalperin.js';
import './sims/AirHockeyGalperin.js';
import './sims/MagneticRepulsionGalperin.js';
import './sims/RollingShapeOdometer.js';
import './sims/SlippingDiscOdometer.js';
import './sims/LoadedDiscGalperin.js';
import './sims/CoinRotationParadox.js';
import './sims/GaltonBoardPi.js';
import './sims/ThreeBodyPi.js';
import './sims/MandelbrotPi.js';
import './sims/UniformSumE.js';
import './sims/LogisticChaosPi.js';
import './sims/RamanujanPi.js';
import './sims/RandomMatrixPi.js';
import './sims/DrunkardsPi.js';
import './sims/ArchimedesPolygons.js';
import './sims/DerangementE.js';
import './sims/OscillatorPeriodPi.js';
import './sims/GravityRampGalperin.js';
import './sims/DrainingVesselE.js';
import './sims/CollisionGasE.js';
import './sims/ResistorLatticePi.js';
import './sims/CauchyLighthousePi.js';
import './sims/IsoperimetricPi.js';
import './sims/HardSphereCrossSectionPi.js';
import './sims/RestitutionGalperin.js';

const grid = document.getElementById('hub-grid');
const allSims = getAllSims();
const sims = allSims.filter(SimClass => !SimClass.hubHidden).sort((a, b) => {
  const orderA = a.sortOrder ?? 100;
  const orderB = b.sortOrder ?? 100;
  if (orderA !== orderB) return orderA - orderB;
  return a.title.localeCompare(b.title);
});

// The key pedagogical axis, surfaced on every card: does this machine produce
// digits, noise, deliberate bias, or no π at all? Derived from piNature.
const CONVERGENCE_BADGES = {
  exact: { text: 'exact digits', cls: 'conv-exact' },
  bounded: { text: 'convergent bounds', cls: 'conv-exact' },
  statistical: { text: 'noise ∝ 1/√N', cls: 'conv-stat' },
  biased: { text: 'biased on purpose', cls: 'conv-biased' },
  experimental: { text: 'π proxy', cls: 'conv-biased' },
  extension: { text: 'not a π counter', cls: 'conv-ext' },
  legacy: { text: 'π as input', cls: 'conv-legacy' },
};

// ── WHAT'S NEW ───────────────────────────────────────────────────────────────
// Explicit changelog, newest batch first. `kind` drives the colour everywhere:
//   new     — a mechanism that did not exist before (a NEW REASON π appears)
//   rebuilt — the card was substantially reworked
//   fixed   — an honesty / framing correction, no physics change
//   retired — moved to the hidden shelf (still loadable by id)
// Keep the notes concrete: say what changed and what it now shows.
const WHATS_NEW_BATCHES = [
  {
    label: 'Latest pass — four new mechanisms, and the encoding ladder cut',
    items: [
      ['cauchy-lighthouse-pi', 'new', 'π by pure counting from a distribution with NO mean — the running average never settles, so averaging fails outright and only counting recovers π. Bias–variance is a live knob.'],
      ['isoperimetric-pi', 'new', 'π as the answer to an OPTIMISATION — the first variational card. Any random blob relaxes until L²/4A descends to π from above; every starting shape reaches the same limit.'],
      ['hard-sphere-cross-section-pi', 'new', 'π from the mean free path of a simulated gas — kinetic theory, the one place a physicist actually meets π in a gas. Packing fraction is the bias knob.'],
      ['restitution-galperin', 'new', 'The bias family’s missing member. An inelastic bounce leaves the Galperin angle right but kills the radius — and the count runs LONG, not short. Push it far enough and the counter dies outright (inelastic collapse), reporting no π rather than inventing one.'],
      ['sphere-volume-mc', 'rebuilt', 'The higher-dimensional encoding ladder is GONE — size (x₇) and opacity (x₈) cut. One colour channel now shows |x| on a fixed scale that never renormalises, so you watch the cloud visibly drain as n climbs.'],
      ['random-matrix-pi', 'rebuilt', 'Now really diagonalises N×N matrices instead of a 2×2 closed form (which was provably just a Gaussian in costume). The lesson is universality: change the entry law and the spacing curve stays put.'],
      ['coxeter-chambers', 'rebuilt', 'The bouncing ball was decoration — the readout never read it. Promoting it exposed a real trap: a MIRROR-walled billiard in these triangles does NOT equidistribute (it locks onto a confidently wrong answer), so the wall law was changed to a diffuse one that genuinely does. The ball is now a second estimator that reads a clock where the darts read a count, and mirror walls stay selectable as a live demonstration of the failure — reported as "not a measurement" rather than quietly averaged in.'],
      ['three-blocks', 'rebuilt', 'The actual mirror planes are shown on the energy sphere, alongside the rescaled configuration path inside their chamber. The velocity direction and configuration direction are different observables.'],
      ['two-blocks', 'fixed', 'The initial-velocity slider was a silent no-op; it is now labelled as what it really is — the family’s cheapest invariance demo (change the speed, the digits do not move).'],
      ['pendulum-rail', 'fixed', 'The initial angle is a phase, not a bias handle, and the rubber band reduces exactly to Two Blocks — both now stated honestly.'],
    ],
  },
  {
    label: 'Previous pass — subtraction, honesty, and π from a field solve',
    items: [
      ['resistor-lattice-pi', 'new', 'π from a FIELD SOLVE — a grid of identical 1 Ω resistors with no circle, no angle and no randomness. Its two boundary conditions bracket π rigorously, squeezing from both sides exactly as Archimedes does.'],
      ['oscillator-period-pi', 'rebuilt', 'Was four "oscillators" that were secretly one linear equation. Now a genuine nonlinear pendulum whose small-angle estimate visibly fails, repaired by the arithmetic–geometric mean — doubling correct digits per iteration.'],
      ['cone-kaleidoscope', 'rebuilt', 'Merged with the old helical-cylinder card into "The Wedge in Disguise": one stepper, three surfaces, and the counter carries straight across a mid-run switch.'],
      ['rolling-sliding', 'rebuilt', 'Five "realizations" that were three code paths became one continuous inertia slider. The count stays pinned at 314 across every setting — the invariance is now demonstrated, not asserted.'],
      ['draining-vessel-e', 'rebuilt', 'Three vessels that differed only in prose became one tank plus a real nonlinearity exponent p: e is exact at p=1 and drifts measurably either side.'],
      ['loaded-disc-galperin', 'rebuilt', '120 combinations of an arbitrary waveform cut down to the off-centre mass and its load slider — one bias knob with a reachable zero.'],
      ['buffon-needle', 'rebuilt', 'Race mode (four estimators converging at once), tunable fractal dimensions, and exponential size for every shape. Dimension mode no longer mislabels a fractal dimension "π ≈", and the fixed circle no longer prints digits it did not earn.'],
      ['magnetic-repulsion-galperin', 'fixed', 'The card declared itself "Biased" while stamping [EXACT] on its formula. Framing made consistent.'],
      ['n-blocks', 'retired', 'k dimensions changed no mechanism, it had no π readout at all, and it duplicated three-blocks. Still loadable from the hidden shelf.'],
      ['helical-cylinder', 'retired', 'Was the same program as the cone card with the variables renamed — folded into "The Wedge in Disguise".'],
    ],
  },
];

// Flatten to id -> {kind, note} for the card badges.
const WHATS_NEW = new Map();
for (const batch of WHATS_NEW_BATCHES) {
  for (const [id, kind, note] of batch.items) {
    if (!WHATS_NEW.has(id)) WHATS_NEW.set(id, { kind, note });
  }
}
const NEW_TAG_TEXT = { new: 'New', rebuilt: 'Rebuilt', fixed: 'Honesty fix', retired: 'Retired' };

function makeCard(SimClass) {
  const rigorClass = (SimClass.rigor || 'Exact')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  const conv = CONVERGENCE_BADGES[SimClass.piNature];
  const card = document.createElement('article');
  card.className = 'sim-card';
  // What's-new badge: read first, colour-matched to the panel at the top.
  const nw = WHATS_NEW.get(SimClass.id);
  if (nw && nw.kind !== 'retired') card.classList.add(`is-${nw.kind}`);
  if (SimClass.id === 'reuleaux-collision-lab') {
    card.classList.add('sim-card-with-action');
  }
  card.innerHTML = `
    <a class="sim-card-link" href="sim.html?id=${SimClass.id}">
      <div class="card-preview" data-sim-id="${SimClass.id}">
        <img class="card-preview-img" alt="" />
        <div class="card-placeholder">${SimClass.title.charAt(0)}</div>
      </div>
      <div class="card-info">

        <span class="card-rigor card-rigor-${rigorClass}">${SimClass.rigor || 'Exact'}</span>
        ${conv ? `<span class="card-conv ${conv.cls}">${conv.text}</span>` : ''}
        <h2>${SimClass.title}</h2>
        <p>${CARD_COPY[SimClass.id] || SimClass.description}</p>
        <span class="card-mechanism">${SimClass.piMechanism}</span><span class="card-launch">Open experiment <span aria-hidden="true">↗</span></span>
      </div>
    </a>
  `;
  if (SimClass.id === 'reuleaux-collision-lab') {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'card-popup-action';
    action.dataset.popupSim = 'reuleaux-rail-pi';
    action.textContent = 'Odometer';
    action.title = 'Open the Reuleaux odometer in a popup';
    card.appendChild(action);
  }
  return card;
}

const groups = [
  {
    title: '04 · An even simpler geometry gives another family',
    description: 'Once the circle is visible, we can set the machinery aside. Measure a polygon inside it and another outside: their perimeters bracket π. Or let a rough closed shape relax and watch L²/(4A) approach the circle’s optimum. The observable is now length or area, rather than the number of bounces.',
    ids: ['archimedes-doubling', 'isoperimetric-pi']
  },
  {
    title: '01 · The seed: blocks, rolling bodies, and a piston',
    description: 'Two blocks make the starting point unusually tangible: each impact adds one to the count. Replace the small block with a rolling body: spin becomes effective mass, and the same energy circle survives. Then add a piston and motion across the rail. The scene gets busier, but those extra coordinates never feed back into the counting engine. What can change without changing the answer?',
    ids: ['two-blocks', 'rolling-sliding', 'piston-gas-galperin']
  },
  {
    title: '03 · The wedge: the blocks were geometry all along',
    description: 'The two-block system already contains a wedge. In mass-weighted coordinates, its two contact constraints become mirrors separated by α = arctan√(m/M). Draw those mirrors in real space and let a light ray bounce: the collision problem becomes an optical one. Unfold the walls, and the broken path becomes a straight line crossing copies of the wedge.',
    ids: ['optical-wedge', 'cone-kaleidoscope', 'wedge-billiard', 'coxeter-chambers']
  },
  {
    title: 'Imperfect machines: how the answer drifts',
    description: 'Start with a bounce that loses energy, then change contact geometry, soften the interaction, or introduce a force between impacts. These changes break different parts of the reduction. Compare each imperfect machine with its reachable ideal limit: more samples cannot remove model bias, and a counter that never escapes has no final digit string.',
    ids: ['restitution-galperin', 'loaded-disc-galperin', 'reuleaux-collision-lab', 'magnetic-repulsion-galperin', 'pendulum-rail', 'gravity-ramp-galperin']
  },
  {
    title: 'More routes — field solves, chaos, and spectra',
    description: 'Independent mechanisms widen the question after the main tour. A resistor network uses a field solve and boundary bounds; the Mandelbrot set, logistic dynamics, and random matrices expose different numerical and statistical routes.',
    ids: ['resistor-lattice-pi', 'mandelbrot-pi', 'logistic-chaos-pi', 'random-matrix-pi']
  },
  {
    title: 'More routes — periods and waves',
    description: 'Timing replaces collision counting. The pendulum demonstrates where the small-angle estimate drifts and how an arithmetic–geometric-mean correction changes it; a standing wave supplies a separate geometric measurement.',
    ids: ['oscillator-period-pi', 'standing-wave-node-pi']
  },
  {
    title: '05 · More dimensions. What could we count now?',
    description: 'A third coupled velocity expands the energy circle into a sphere. Several mirror planes cut out a chamber, and a collision sequence no longer sweeps a single fixed-angle fan. That rules out the old universal digit recipe; it does not rule out other measurements. Compare the genuine 3D chamber with the special free three-body system, whose conserved total momentum brings the problem back to a planar circle.',
    ids: ['three-blocks', 'three-body-pi']
  },
  {
    title: 'Related studies — sampling, series, and sieves',
    description: 'Supporting examples for comparing estimators after the main collision-to-bias story. Sampling, integer sieves, and series give useful baselines; the Galton board here deliberately uses independent fair left/right choices, rather than simulated collisions.',
    ids: ['galton-board-pi', 'drunkard-pi', 'buffon-needle', 'cauchy-lighthouse-pi', 'hard-sphere-cross-section-pi', 'sphere-volume-mc', 'square-free-sieve', 'leibniz-walk', 'ramanujan-pi', 'basel-sum-walker', 'wallis-rectangle', 'bessel-zero-counter']
  },
  {
    title: 'What about e?',
    description: 'Four studies of e extend the collection through random sums, derangements, decay, and gas statistics. Each keeps its own observable and assumptions visible.',
    ids: ['uniform-sum-e', 'derangement-e', 'draining-vessel-e', 'collision-gas-e']
  },
];

// Preserve existing #sec-N links while putting the primary argument before side routes.
const DISPLAY_ORDER = [1, 3, 2, 0, 6, 4, 5, 8, 7];

// Per-category accent colour (header underline + card top strip).
const SECTION_ACCENTS = ['#dfc876', '#9bddc5', '#edca7d', '#f1ac72', '#79d6bc', '#accb86', '#c2abea', '#97bfc6', '#e4c97c'];

const simsById = new Map(sims.map(SimClass => [SimClass.id, SimClass]));
const allSimsById = new Map(allSims.map(SimClass => [SimClass.id, SimClass]));
const used = new Set();

// Suggested viewing order — the site's narrative arc, as anchor links into the
// section list below (indexes into `groups`).
const PATH_STEPS = [
  { label: 'The seed', anchor: 'sec-1' },
  { label: 'What actually matters?', anchor: 'what-changes' },
  { label: 'The wedge', anchor: 'sec-2' },
  { label: 'Simpler geometry', anchor: 'sec-0' },
  { label: 'More dimensions', anchor: 'sec-6' },
];
// What's-new panel — the explicit changelog, newest batch first, sitting above
// the suggested path so a returning reader sees exactly what moved.
{
  const counts = { new: 0, rebuilt: 0, fixed: 0, retired: 0 };
  for (const b of WHATS_NEW_BATCHES) for (const [, kind] of b.items) counts[kind]++;
  const panel = document.createElement('details');
  panel.className = 'whats-new';
  panel.id = 'whats-new';
  const batchHTML = WHATS_NEW_BATCHES.map((batch) => `
    <div class="wn-batch">
      <h3>${batch.label}</h3>
      <ul class="wn-list">
        ${batch.items.map(([id, kind, note]) => {
          const S = allSimsById.get(id);
          const title = S ? S.title : id;
          return `<li class="wn-item">
            <span class="wn-tag wn-tag-${kind}">${NEW_TAG_TEXT[kind]}</span>
            <span><a href="sim.html?id=${id}">${title}</a> <span class="wn-note">— ${note}</span></span>
          </li>`;
        }).join('')}
      </ul>
    </div>
  `).join('');
  panel.innerHTML = `
    <summary>Development notes — recent mechanisms and revisions</summary>
    <p class="wn-sub">
      ${counts.new} new mechanisms, ${counts.rebuilt} rebuilt cards,
      ${counts.fixed} honesty fixes and ${counts.retired} retirements.
      Open a note to revisit the motivation behind a change; the main reading path is below.
    </p>
    ${batchHTML}
    <div class="wn-legend">
      <span class="l-new">New — a mechanism that did not exist before</span>
      <span class="l-rebuilt">Rebuilt — substantially reworked</span>
      <span class="l-fixed">Honesty fix — framing/labels, no physics change</span>
      <span class="l-retired">Retired — on the hidden shelf, still loadable</span>
    </div>
  `;
  grid.appendChild(panel);
}

{
  const strip = document.createElement('nav');
  strip.className = 'path-strip';
  strip.setAttribute('aria-label', 'Main reading path');
  strip.innerHTML = '<span class="path-label">Suggested path</span>' + PATH_STEPS.map((s, i) =>
    `<a class="path-step" href="#${s.anchor}"><span class="path-num">${i + 1}</span>${s.label}</a>`
  ).join('<span class="path-arrow">→</span>');
  grid.insertBefore(strip, grid.firstChild);
}

let cardIndex = 0;   // running position across all sections, for the entrance stagger
for (const gi of DISPLAY_ORDER) {
  const group = groups[gi];
  const groupSims = group.ids
    .map(id => simsById.get(id))
    .filter(Boolean);
  for (const SimClass of groupSims) used.add(SimClass.id);

  if (groupSims.length === 0) continue;
  const section = document.createElement('section');
  section.className = `sim-section${gi === 7 ? ' sim-section-secondary' : ''}${gi === 8 ? ' sim-section-e' : ''}`;
  section.id = `sec-${gi}`;
  section.style.setProperty('--section-accent', SECTION_ACCENTS[gi] || '#5a6a8a');

  const header = document.createElement('div');
  header.className = 'sim-section-header';
  header.innerHTML = `<h2>${group.title}</h2><p>${group.description}</p>`;
  section.appendChild(header);

  const sectionGrid = document.createElement('div');
  sectionGrid.className = 'sim-section-grid';
  for (const SimClass of groupSims) {
    const card = makeCard(SimClass);
    // Index drives the staggered entrance (--card-i in style.css). Capped so a
    // card far down the page is not still waiting to appear after the reader
    // has scrolled to it.
    card.style.setProperty('--card-i', String(Math.min(cardIndex++, 24)));
    sectionGrid.appendChild(card);
  }
  section.appendChild(sectionGrid);
  if (gi === 2) {
    const bridge = document.createElement('div');
    bridge.className = 'chapter-bridge';
    bridge.innerHTML = `<div><h3>Blocks → mirrors</h3><p>Write the contact coordinates as X = √m x and Y = √M y. The wall and the line where the blocks touch bound a wedge. In velocity coordinates the same mass weighting turns constant energy into a circle.</p><p class="equation">tan α = √(m / M)</p></div><div><h3>Reflections → a straight path</h3><p>Reflect the room instead of the ray. A path crossing successive copies now reveals why a half-turn enters the count. Cone and cylinder presentations refold that developed geometry; they preserve the counting engine.</p><p class="equation">Nα ≈ π · finite angular steps</p></div>`;
    section.insertBefore(bridge, sectionGrid);
  }
  grid.appendChild(section);
  if (gi === 1) grid.appendChild(createTurningPoint());
}

const uncategorized = sims.filter(SimClass => !used.has(SimClass.id));
for (const SimClass of uncategorized) {
  grid.appendChild(makeCard(SimClass));
}

// Capstone: the whole thesis in one table — every visible machine, its mechanism,
// and what kind of answer it gives. Generated from statics the sims already carry.
{
  const cap = document.createElement('section');
  cap.className = 'capstone';
  const famShort = (t) => t.split('—')[0].trim();
  let rows = '';
  let n = 0;
  for (const gi of DISPLAY_ORDER) {
    const group = groups[gi];
    for (const id of group.ids) {
      const S = simsById.get(id);
      if (!S) continue;
      const conv = CONVERGENCE_BADGES[S.piNature];
      rows += `<tr>
        <td class="cap-n">${++n}</td>
        <td><a href="sim.html?id=${S.id}">${S.title}</a></td>
        <td class="cap-fam">${famShort(group.title)}</td>
        <td class="cap-mech">${S.piMechanism}</td>
        <td>${conv ? `<span class="card-conv ${conv.cls}">${conv.text}</span>` : ''}</td>
      </tr>`;
    }
  }
  const hidden = allSims.filter(S => S.hubHidden)
    .map(S => `<a href="sim.html?id=${S.id}">${S.title}</a>`)
    .join(' · ');
  cap.innerHTML = `
    <div class="sim-section-header" style="--section-accent:#9aa7c7">
      <h2>Mechanism index — what each readout establishes</h2>
      <p>Exact counts, estimates, deliberate bias, and geometric explorations share an interface while retaining their different guarantees.</p>
    </div>
    <details><summary>All mechanisms, guarantees &amp; variants</summary><div class="capstone-table-wrap"><table class="capstone-table">
      <thead><tr><th>#</th><th>Machine</th><th>Family</th><th>Mechanism</th><th>Answer type</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <details class="hidden-shelf"><summary>Hidden shelf — ${allSims.filter(S => S.hubHidden).length} retired or variant sims, still loadable</summary>
      <p>${hidden}</p>
    </details></details>
  `;
  cap.style.setProperty('--section-accent', '#9aa7c7');
  grid.appendChild(cap);
  grid.appendChild(document.getElementById('whats-new'));
}

// Card previews: render each sim's scene to a thumbnail. One shared renderer,
// processed through a small stagger queue (setTimeout, so it stays responsive and
// runs regardless of tab focus). Cards are queued top-to-bottom so the ones already
// on screen fill in first.
const previewQueue = [];
let previewPumping = false;
function pumpPreviews() {
  if (previewPumping) return;
  previewPumping = true;
  const tick = () => {
    const job = previewQueue.shift();
    if (!job) { previewPumping = false; return; }
    try { job(); } catch (e) { /* keep the placeholder */ }
    setTimeout(tick, 28);
  };
  setTimeout(tick, 28);
}

const previewObserver = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    previewObserver.unobserve(entry.target);
    previewQueue.push(entry.target._renderPreview);
  }
  pumpPreviews();
}, { rootMargin: '400px' });
for (const el of document.querySelectorAll('.card-preview[data-sim-id]')) {
  const SimClass = allSimsById.get(el.dataset.simId);
  if (!SimClass) continue;
  el._renderPreview = () => {
    const url = renderPreview(SimClass);
    if (!url) return;
    const img = el.querySelector('.card-preview-img');
    const ph = el.querySelector('.card-placeholder');
    if (!img) return;
    img.onload = () => { img.classList.add('loaded'); if (ph) ph.style.display = 'none'; };
    img.src = url;
  };
  previewObserver.observe(el);
}
pumpPreviews();

let simPopup = null;

function ensureSimPopup() {
  if (simPopup) return simPopup;

  const popup = document.createElement('div');
  popup.className = 'sim-popup';
  popup.setAttribute('aria-hidden', 'true');
  popup.innerHTML = `
    <div class="sim-popup-scrim" data-popup-close></div>
    <section class="sim-popup-panel" role="dialog" aria-modal="true" aria-labelledby="sim-popup-title">
      <div class="sim-popup-header">
        <h2 id="sim-popup-title">Simulation</h2>
        <a class="sim-popup-open" href="#" target="_blank" rel="noopener">Open full</a>
        <button type="button" class="sim-popup-close" data-popup-close aria-label="Close popup">&times;</button>
      </div>
      <iframe class="sim-popup-frame" title="Simulation popup" src="about:blank"></iframe>
    </section>
  `;
  document.body.appendChild(popup);

  simPopup = {
    root: popup,
    title: popup.querySelector('#sim-popup-title'),
    frame: popup.querySelector('.sim-popup-frame'),
    fullLink: popup.querySelector('.sim-popup-open'),
    closeButton: popup.querySelector('.sim-popup-close'),
  };

  popup.addEventListener('click', (event) => {
    if (event.target.closest('[data-popup-close]')) closeSimPopup();
  });

  return simPopup;
}

function openSimPopup(simId) {
  const SimClass = allSimsById.get(simId);
  const popup = ensureSimPopup();
  const url = `sim.html?id=${encodeURIComponent(simId)}`;

  popup.title.textContent = SimClass ? SimClass.title : 'Simulation';
  popup.fullLink.href = url;
  popup.frame.src = url;
  popup.root.classList.add('open');
  popup.root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  popup.closeButton.focus();
}

function closeSimPopup() {
  if (!simPopup) return;
  simPopup.root.classList.remove('open');
  simPopup.root.setAttribute('aria-hidden', 'true');
  simPopup.frame.src = 'about:blank';
  document.body.classList.remove('modal-open');
}

grid.addEventListener('click', (event) => {
  const action = event.target.closest('[data-popup-sim]');
  if (!action) return;

  event.preventDefault();
  event.stopPropagation();
  openSimPopup(action.dataset.popupSim);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && simPopup?.root.classList.contains('open')) {
    closeSimPopup();
  }
});

document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('is-background', document.hidden));

// The hub is authored from modules; resolve an initial section link after mounting.
requestAnimationFrame(() => {
  const id = decodeURIComponent(location.hash.slice(1));
  if (/^(sec-\d+|what-changes)$/.test(id)) document.getElementById(id)?.scrollIntoView({behavior:'instant',block:'start'});
});
