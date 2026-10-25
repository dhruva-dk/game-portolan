// The regions' standard shots on the sea test page (tests/pages/sea.html): each a name and its query. regions.shots.ts
// captures them; the budget test (tests/render/budget.test.ts) holds each region's hero to the views' budget.
export const REGION_SHOTS: readonly (readonly [string, Record<string, string>])[] = [
  ['ice-crown', { view: 'crown', hour: '23' }],
  ['crown-light-orbit', { view: 'mark', region: 'Ice', hour: '23' }],
  ['fjord', { view: 'fjord', hour: '8' }],
  ['great-falls-orbit', { view: 'mark', region: 'Fjords', hour: '8' }],
  ['basalt-hero', { view: 'basalt', hour: '16.5' }],
  ['basalt-weave', { view: 'weave', hour: '16.5' }],
  ['basalt-arch-orbit', { view: 'mark', region: 'Basalt', hour: '16.5' }],
  ['kelp-hero', { view: 'kelp', hour: '12' }],
  ['kelp-deck', { view: 'kelpdeck', hour: '12' }],
  ['kelp-cathedral-orbit', { view: 'mark', region: 'Kelp', hour: '12' }],
  ['amber-hero', { view: 'amber', hour: '17', tide: '-0.6' }],
  ['amber-pass-low', { view: 'amberpass', hour: '17', tide: '-0.6' }],
  ['amber-pass-high', { view: 'amberpass', hour: '17', tide: '0.6' }],
  ['amber-light-orbit', { view: 'mark', region: 'Amber', hour: '17', tide: '-0.6' }],
  ['amber-calm', { view: 'amber', hour: '17', tide: '-0.3', calm: '1' }],
  ['weeping-hero', { view: 'weeping', hour: '6' }],
  ['weeping-shore', { view: 'weepingshore', hour: '7' }],
  ['weeping-high', { view: 'mark', region: 'Weeping', hour: '9' }],
  ['weeping-orbit', { view: 'orbit', region: 'Weeping', hour: '9' }],
  ['weeping-night', { view: 'weeping', hour: '22' }],
  ['weeping-rain', { view: 'weeping', hour: '7', squall: '1' }],
  ['coral-hero', { view: 'coral', hour: '12', tide: '0.1', off: '-14' }], // 14 u in from the rim's crest: the lagoon before the pass
  ['coral-shore', { view: 'coralshore', hour: '15', tide: '-0.2' }],
  ['coral-high', { view: 'mark', region: 'Coral', hour: '12', tide: '0.1' }],
  ['coral-orbit', { view: 'orbit', region: 'Coral', hour: '12', tide: '0.1' }],
  ['spice-hero', { view: 'spice', hour: '17.2' }],
  ['spice-shore', { view: 'spiceshore', hour: '16' }],
  ['spice-high', { view: 'mark', region: 'Spice', hour: '16' }],
  ['spice-orbit', { view: 'orbit', region: 'Spice', hour: '16' }],
];

/** Each region's hero: its capture, the richest view of it. */
export const REGION_HEROES = REGION_SHOTS.filter(([name]) => name === 'ice-crown' || name === 'fjord' || name.endsWith('-hero'));
