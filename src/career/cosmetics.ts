// The cosmetics catalogue: sail colours, sail patterns, hull paints, figureheads, emblems and wake trails.
// Plain kinds, evocative names. Each has one unlock rule: a level, or a rank tier (the show-off ones).
// Nothing is bought: there is no shop and no currency between matches.
// Ids are stable: saves and captains refer to them. Add to the end of a kind; never rename or reuse an id. No two items
// of a kind look alike on the ship or in the locker: a sail pattern for each of the shader's six, a figurehead for each
// of the model's seven. Ids cut for looking like another are in RETIRED.
// Figureheads and emblems are natural forms and spirits: never people, never faces. Emblem ids are the player
// charges drawn in src/render/cosmetics/emblems.ts (PLAYER_EMBLEMS).
import { TIER } from './ranks.ts';

export type CosmeticKind = 'sailColour' | 'sailPattern' | 'hullPaint' | 'figurehead' | 'emblem' | 'wake';

export const COSMETIC_KINDS: readonly { kind: CosmeticKind; name: string }[] = [
  { kind: 'sailColour', name: 'Sail colours' },
  { kind: 'sailPattern', name: 'Sail patterns' },
  { kind: 'hullPaint', name: 'Hull paints' },
  { kind: 'figurehead', name: 'Figureheads' },
  { kind: 'emblem', name: 'Emblems' },
  { kind: 'wake', name: 'Wake trails' },
];

export type Unlock = { by: 'level'; level: number } | { by: 'rank'; tier: number };

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  /** What it is, plainly, for the renderer and the locker card. */
  hint: string;
  /** The main colour, for colours, paints and wakes. */
  colour?: string;
  unlock: Unlock;
}

const at = (level: number): Unlock => ({ by: 'level', level });
const rank = (tier: number): Unlock => ({ by: 'rank', tier });

const kind = (k: CosmeticKind, items: readonly (readonly [id: string, name: string, hint: string, unlock: Unlock, colour?: string])[]): Cosmetic[] =>
  items.map(([id, name, hint, unlock, colour]) => (colour === undefined ? { id, kind: k, name, hint, unlock } : { id, kind: k, name, hint, unlock, colour }));

export const COSMETICS: readonly Cosmetic[] = [
  ...kind('sailColour', [
    ['bareCanvas', 'Bare Canvas', 'Undyed sailcloth.', at(1), '#e8dcc0'],
    ['duskRose', 'Dusk Rose', 'Soft evening pink.', at(2), '#d89aa0'],
    ['kelpGold', 'Kelp Gold', 'Olive gold.', at(4), '#b59a3c'],
    ['emberRed', 'Ember Red', 'Deep glowing red.', at(6), '#b8322a'],
    ['glacierBlue', 'Glacier Blue', 'Milky turquoise.', at(9), '#7fc3c9'],
    ['mistwoodMoss', 'Mistwood Moss', 'Dark blue-green.', at(12), '#2f5a4c'],
    ['coralBloom', 'Coral Bloom', 'Coral orange-pink.', at(27), '#f07a5a'],
    ['weepingSapphire', 'Weeping Sapphire', 'Deep sapphire blue.', at(33), '#1f4f9a'],
    ['auroraGreen', 'Aurora Green', 'Shimmering polar green.', at(50), '#3fe0a0'],
    ['bronzeLeaf', 'Bronze Leaf', 'Burnished bronze. For reaching Bronze.', rank(TIER.bronze), '#a86b32'],
    ['silverMist', 'Silver Mist', 'Bright silver. For reaching Silver.', rank(TIER.silver), '#c9ced6'],
    ['goldenHour', 'Golden Hour', 'Shining gold. For reaching Gold.', rank(TIER.gold), '#e8b830'],
    ['diamondFrost', 'Diamond Frost', 'Glittering ice blue. For reaching Diamond.', rank(TIER.diamond), '#bfeaff'],
    ['abyssalInk', 'Abyssal Ink', 'Black-blue with a deep sheen. For reaching Admiral.', rank(TIER.admiral), '#0b1430'],
    ['livingFlame', 'Living Flame', 'Gold fading to red, as if alight. For reaching Legend.', rank(TIER.legend), '#ff7a18'],
  ]),
  ...kind('sailPattern', [
    ['plain', 'Plain', 'One colour, no pattern.', at(1)],
    ['singleStripe', 'Single Stripe', 'One broad band across the sail.', at(2)],
    ['twinBands', 'Twin Bands', 'Two narrow bands.', at(5)],
    ['quartered', 'Quartered', 'The sail split into four.', at(7)],
    ['chevron', 'Chevron', 'A V pointing down the sail.', at(11)],
    ['laurelEdge', 'Laurel Edge', 'A leaf border. For reaching Gold.', rank(TIER.gold)],
  ]),
  ...kind('hullPaint', [
    ['driftwood', 'Driftwood', 'Sun-bleached grey wood.', at(1), '#9a8f80'],
    ['pitchBlack', 'Pitch Black', 'Black, glossy and wet.', at(1), '#1c1a18'],
    ['seaGlass', 'Sea Glass', 'Frosted green.', at(3), '#8fbfae'],
    ['rustBloom', 'Rust Bloom', 'Orange-brown.', at(8), '#9c4a22'],
    ['verdigris', 'Verdigris', 'Blue-green patina.', at(10), '#4f9a88'],
    ['pineBark', 'Pine Bark', 'Dark red-brown.', at(13), '#5a3423'],
    ['sandbar', 'Sandbar', 'Warm amber sand.', at(16), '#d7b277'],
    ['pearl', 'Pearl', 'Lustrous cream.', at(32), '#efe6d6'],
    ['kelpBronze', 'Kelp Bronze', 'Olive bronze.', at(36), '#6e5f2c'],
    ['deepIndigo', 'Deep Indigo', 'Night blue.', at(42), '#232a5c'],
    ['quicksilver', 'Quicksilver', 'Mirror silver. For reaching Silver.', rank(TIER.silver), '#c6ccd4'],
    ['sunlitGold', 'Sunlit Gold', 'Gleaming gold. For reaching Gold.', rank(TIER.gold), '#d9a520'],
    ['stormGlass', 'Storm Glass', 'Dark glass with moving cloud. For reaching Admiral.', rank(TIER.admiral), '#2d3b4a'],
  ]),
  ...kind('figurehead', [
    ['plainStem', 'Plain Stem', 'A bare curved stem.', at(1)],
    ['heron', 'Heron', 'A heron with its neck outstretched.', at(3)],
    ['narwhalTusk', 'Narwhal Tusk', 'A long spiral tusk.', at(9)],
    ['ammonite', 'Ammonite', 'A great spiral shell.', at(15)],
    ['coralAntler', 'Coral Antler', 'Branching red coral.', at(19)],
    ['sunburst', 'Sunburst', 'Rays of gold. For reaching Platinum.', rank(TIER.platinum)],
    ['greatWhale', 'Great Whale', 'A breaching whale. For reaching Legend.', rank(TIER.legend)],
  ]),
  ...kind('emblem', [
    ['gull', 'Gull', 'A gull in flight.', at(1)],
    ['scallop', 'Scallop', 'A scallop shell.', at(2)],
    ['seahorse', 'Seahorse', 'A seahorse, tail curled.', at(7)],
    ['dolphin', 'Dolphin', 'A leaping dolphin.', at(13)],
    ['fern', 'Fern', 'An uncurling fern.', at(16)],
    ['hare', 'Hare', 'A running hare.', at(20)],
    ['swan', 'Swan', 'A swan, wings raised.', at(24)],
    ['butterfly', 'Butterfly', 'A butterfly.', at(32)],
    ['snowflake', 'Snowflake', 'A six-armed snowflake.', at(39)],
    ['crystal', 'Crystal Heart', 'A heart of clear crystal. For reaching Diamond.', rank(TIER.diamond)],
    ['leviathan', 'Leviathan', 'A great sea beast in gold. For reaching Admiral.', rank(TIER.admiral)],
    ['phoenix', 'Phoenix', 'A firebird of living light. For reaching Legend.', rank(TIER.legend)],
  ]),
  ...kind('wake', [
    ['foam', 'Foam', 'Plain white foam.', at(1), '#ffffff'],
    ['petalTrail', 'Petal Trail', 'Cherry petals on the water.', at(11), '#f6c2cf'],
    ['glowingPlankton', 'Glowing Plankton', 'Blue light that shows at night.', at(18), '#3cc8ff'],
    ['bronzeRipple', 'Bronze Ripple', 'Burnished ripples. For reaching Bronze.', rank(TIER.bronze), '#c08040'],
    ['silverWake', 'Silver Wake', 'A shining silver trail. For reaching Silver.', rank(TIER.silver), '#dfe4ea'],
    ['gildedWake', 'Gilded Wake', 'A trail of gold light. For reaching Gold.', rank(TIER.gold), '#ffd24a'],
    ['diamondDust', 'Diamond Dust', 'Sparkling ice dust. For reaching Diamond.', rank(TIER.diamond), '#c8f0ff'],
    ['auroraWake', 'Aurora Wake', 'Green and violet ribbons. For reaching Admiral.', rank(TIER.admiral), '#7affc0'],
    ['wakeOfLegends', 'Wake of Legends', 'A blazing trail of fire. For reaching Legend.', rank(TIER.legend), '#ff5a1a'],
  ]),
];

/** Ids a saved career can still be wearing that have gone from the catalogue, each to the item it looked most like. */
export const RETIRED: Readonly<Record<string, string>> = {
  seafoam: 'bareCanvas', cherryPetal: 'duskRose', narrowsOchre: 'kelpGold', jadeWater: 'glacierBlue', flameTree: 'emberRed',
  basaltBlack: 'abyssalInk', mangroveTea: 'bronzeLeaf', maelstromNavy: 'abyssalInk', platinumDawn: 'silverMist',
  waveCrest: 'laurelEdge', spiral: 'plain', scales: 'twinBands', ripples: 'plain', starfield: 'plain', feathered: 'chevron',
  forkedLightning: 'chevron', tideLines: 'twinBands', diamondLattice: 'quartered', crownOfStars: 'laurelEdge',
  lavaRock: 'pitchBlack', moonstone: 'quicksilver', ashGrey: 'driftwood', cedarRed: 'rustBloom', emberGlaze: 'pineBark',
  stormPetrel: 'heron', coiledEel: 'ammonite', iceShard: 'coralAntler', kelpCrown: 'sunburst', whaleFluke: 'greatWhale',
  leapingDolphin: 'greatWhale', emberBloom: 'sunburst', bubbles: 'foam', iceCrystals: 'diamondDust', emberSparks: 'wakeOfLegends',
  rainbowSpray: 'gildedWake', platinumComet: 'silverWake',
};

export const cosmetic = (id: string): Cosmetic | undefined => COSMETICS.find((c) => c.id === id);

export const cosmeticsOf = (k: CosmeticKind): Cosmetic[] => COSMETICS.filter((c) => c.kind === k);

export const isUnlocked = (c: Cosmetic, level: number, bestTier: number): boolean =>
  c.unlock.by === 'level' ? level >= c.unlock.level : bestTier >= c.unlock.tier;

/** What a ship looks like: one cosmetic id per kind. A captain's emblem is its own sigil, and its own colour, '#rrggbb',
 *  is worn on the sail, hull and pennant in place of a sail colour and hull paint (see captains.ts). */
export interface Look {
  colour?: string;
  sailColour: string;
  sailPattern: string;
  hullPaint: string;
  figurehead: string;
  emblem: string;
  wake: string;
}

export const LOOK_KINDS: readonly CosmeticKind[] = ['sailColour', 'sailPattern', 'hullPaint', 'figurehead', 'emblem', 'wake'];

/** The look a new career starts with. */
export const STARTER_LOOK: Look = {
  sailColour: 'bareCanvas', sailPattern: 'plain', hullPaint: 'driftwood', figurehead: 'plainStem', emblem: 'gull', wake: 'foam',
};
