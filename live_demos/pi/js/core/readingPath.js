// Editorial navigation only; stable simulation IDs remain unchanged.
export const READING_PATH = [
  { id: 'two-blocks', label: 'The seed', next: 'Replace the block with a rolling body' },
  { id: 'rolling-sliding', label: 'Roll, yet keep the count', next: 'Add motion in another direction' },
  { id: 'piston-gas-galperin', label: 'More motion, same count', next: 'Then what changes would actually matter?', href: 'index.html#what-changes' },
  { id: 'restitution-galperin', label: 'Change the bounce', next: 'Change the contact inertia' },
  { id: 'loaded-disc-galperin', label: 'Change the geometry', next: 'Compare the other imperfect machines', href: 'index.html#sec-3' },
  { id: 'optical-wedge', label: 'See the mirrors directly', next: 'Refold the same path' },
  { id: 'cone-kaleidoscope', label: 'One geometry, several surfaces', next: 'An even simpler geometric interpretation', href: 'index.html#sec-0' },
  { id: 'archimedes-doubling', label: 'Measure instead of bouncing', next: 'What happens in an active third dimension?' },
  { id: 'three-blocks', label: 'The spherical chamber', next: 'A special three-body reduction' },
  { id: 'three-body-pi', label: 'Constraints recover a circle', next: 'Explore fields, statistics and other constants', href: 'index.html#sec-4' },
];

export const CARD_COPY = {
  'two-blocks': 'Count the impacts. The familiar blocks on the left become reflections on an energy circle on the right.',
  'rolling-sliding': 'Let it roll: a body’s spin becomes effective mass. Sweep from a sliding block to a hoop while preserving the collision ratio—and all its digits.',
  'piston-gas-galperin': 'From a block to a rolling circle—and now a piston with an atom that rises and falls. It looks more complicated, but the extra motion never feeds back into the along-rail collisions. More happening, same count.',
  'optical-wedge': 'The blocks’ phase-space mirrors become real mirrors. Set an opening from a slope, then unfold the light ray into a straight path.',
  'cone-kaleidoscope': 'A flat sector, a cone, a cylinder: switch the surface while the same developed-wedge path keeps its count.',
  'three-blocks': 'Three coupled velocities give an energy sphere. Explore its reflection chamber, then ask what a statistical area measurement can recover.',
  'three-body-pi': 'Remove the wall. Conserved total momentum cuts the energy sphere with a plane; this special three-body system recovers a circular counting problem.',
  'restitution-galperin': 'Real impacts lose energy. Here a small loss lengthens the count; a larger loss can stop the machine escaping at all.',
  'loaded-disc-galperin': 'Move a disc’s load off-center. Its changing contact inertia bends the ideal reflection law, exposing model bias.',
  'buffon-needle': 'Count crossings instead of impacts. Compare sampling noise, curve shape and competing estimators in one experiment.',
  'resistor-lattice-pi': 'A square network with no circle in sight. Solve for voltage, measure a resistance and let two boundary conditions squeeze π from opposite sides.',
  'uniform-sum-e': 'Pour random amounts into a glass. Count how many pours first take the total above one; their average approaches e.',
  'draining-vessel-e': 'A tank loses a fraction of what remains. Watch exponential drainage—and how a nonlinear flow law spoils the e readout.',
};

export const WATCH_FOR = {
  'two-blocks': 'Each impact reflects the momentum point. Change launch speed: the energy changes, the count does not.',
  'rolling-sliding': 'M follows the effective rolling mass here. Preserving that ratio preserves the count; rolling alone is not enough.',
  'piston-gas-galperin': 'Watch the rise and fall, then switch to air-hockey. That extra motion never feeds back into the along-rail count; top and bottom bounces are outside the tally.',
  'optical-wedge': 'Unfold the mirrors: a zig-zag becomes a straight path through an angular fan.',
  'cone-kaleidoscope': 'Change the surface mid-run. The developed wedge and its counting engine stay the same.',
  'restitution-galperin': 'A contracting phase trace can take more bounces to escape. Compare restitution 1 with 0.99.',
  'loaded-disc-galperin': 'Bring the load back to the center to recover the ideal limit of this quasi-static model.',
  'three-blocks': 'Collision hits and sampled chamber area are different observables. Use Measurement to compare them.',
  'resistor-lattice-pi': 'Mint and rose show signed potential; gold follows current. Increase the grid to tighten the boundary bracket.',
  'uniform-sum-e': 'One trial ends on the pour that crosses the rim. The average number of pours—not the poured volume—approaches e.',
  'draining-vessel-e': 'At flow exponent p = 1, equal time intervals remove the same fraction. Change p to see that rule fail.',
};
