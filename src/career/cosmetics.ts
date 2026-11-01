// The cosmetics catalogue: sail colours, sail patterns, hull paints, figureheads, emblems and wake trails.
// Plain kinds, evocative names. Each has one unlock rule: a level, or a rank tier (the show-off ones).
// Nothing is bought: there is no shop and no currency between matches.
// Ids are stable: saves and captains refer to them. Add to the end of a kind; never rename or reuse an id.
// Figureheads and emblems are natural forms and spirits: never people, never faces.
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
    ['seafoam', 'Seafoam', 'Pale green-white.', at(1), '#cfe8dc'],
    ['duskRose', 'Dusk Rose', 'Soft evening pink.', at(2), '#d89aa0'],
    ['kelpGold', 'Kelp Gold', 'Olive gold.', at(4), '#b59a3c'],
    ['emberRed', 'Ember Red', 'Deep glowing red.', at(6), '#b8322a'],
    ['glacierBlue', 'Glacier Blue', 'Milky turquoise.', at(9), '#7fc3c9'],
    ['mistwoodMoss', 'Mistwood Moss', 'Dark blue-green.', at(12), '#2f5a4c'],
    ['narrowsOchre', 'Narrows Ochre', 'Warm sandstone ochre.', at(15), '#c4823a'],
    ['cherryPetal', 'Cherry Petal', 'Blossom pink.', at(18), '#f2b8c6'],
    ['basaltBlack', 'Basalt Black', 'Near-black grey.', at(21), '#26282b'],
    ['jadeWater', 'Jade Water', 'Pale jade.', at(24), '#8fcfb0'],
    ['coralBloom', 'Coral Bloom', 'Coral orange-pink.', at(27), '#f07a5a'],
    ['flameTree', 'Flame Tree', 'Hot orange-red.', at(30), '#e0441c'],
    ['weepingSapphire', 'Weeping Sapphire', 'Deep sapphire blue.', at(33), '#1f4f9a'],
    ['mangroveTea', 'Mangrove Tea', 'Tea brown.', at(38), '#7a5530'],
    ['maelstromNavy', 'Maelstrom Navy', 'Storm-dark navy.', at(44), '#18233f'],
    ['auroraGreen', 'Aurora Green', 'Shimmering polar green.', at(50), '#3fe0a0'],
    ['bronzeLeaf', 'Bronze Leaf', 'Burnished bronze. For reaching Bronze.', rank(TIER.bronze), '#a86b32'],
    ['silverMist', 'Silver Mist', 'Bright silver. For reaching Silver.', rank(TIER.silver), '#c9ced6'],
    ['goldenHour', 'Golden Hour', 'Shining gold. For reaching Gold.', rank(TIER.gold), '#e8b830'],
    ['platinumDawn', 'Platinum Dawn', 'Pale platinum with a dawn blush. For reaching Platinum.', rank(TIER.platinum), '#e4e2ec'],
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
    ['waveCrest', 'Wave Crest', 'A curling wave along the foot.', at(14)],
    ['spiral', 'Spiral', 'A spiral at the centre of the sail.', at(17)],
    ['scales', 'Scales', 'Overlapping fish scales.', at(20)],
    ['ripples', 'Ripples', 'Rings spreading from one corner.', at(23)],
    ['starfield', 'Starfield', 'Scattered small stars.', at(26)],
    ['feathered', 'Feathered', 'Long feather shapes.', at(29)],
    ['forkedLightning', 'Forked Lightning', 'A bolt across the sail.', at(35)],
    ['tideLines', 'Tide Lines', 'Fine wavy lines like a sand flat.', at(41)],
    ['laurelEdge', 'Laurel Edge', 'A leaf border. For reaching Gold.', rank(TIER.gold)],
    ['diamondLattice', 'Diamond Lattice', 'A glittering diamond grid. For reaching Diamond.', rank(TIER.diamond)],
    ['crownOfStars', 'Crown of Stars', 'A ring of bright stars. For reaching Legend.', rank(TIER.legend)],
  ]),
  ...kind('hullPaint', [
    ['driftwood', 'Driftwood', 'Sun-bleached grey wood.', at(1), '#9a8f80'],
    ['pitchBlack', 'Pitch Black', 'Black, glossy and wet.', at(1), '#1c1a18'],
    ['seaGlass', 'Sea Glass', 'Frosted green.', at(3), '#8fbfae'],
    ['rustBloom', 'Rust Bloom', 'Orange-brown.', at(8), '#9c4a22'],
    ['verdigris', 'Verdigris', 'Blue-green patina.', at(10), '#4f9a88'],
    ['pineBark', 'Pine Bark', 'Dark red-brown.', at(13), '#5a3423'],
    ['sandbar', 'Sandbar', 'Warm amber sand.', at(16), '#d7b277'],
    ['lavaRock', 'Lava Rock', 'Black with red cracks.', at(19), '#2a1512'],
    ['moonstone', 'Moonstone', 'Milky blue-white.', at(22), '#d6dfe8'],
    ['ashGrey', 'Ash Grey', 'Soft volcanic grey.', at(25), '#77736e'],
    ['cedarRed', 'Cedar Red', 'Rich red wood.', at(28), '#8c3b2a'],
    ['pearl', 'Pearl', 'Lustrous cream.', at(32), '#efe6d6'],
    ['kelpBronze', 'Kelp Bronze', 'Olive bronze.', at(36), '#6e5f2c'],
    ['deepIndigo', 'Deep Indigo', 'Night blue.', at(42), '#232a5c'],
    ['emberGlaze', 'Ember Glaze', 'Dark red that glows at night.', at(48), '#5c1410'],
    ['quicksilver', 'Quicksilver', 'Mirror silver. For reaching Silver.', rank(TIER.silver), '#c6ccd4'],
    ['sunlitGold', 'Sunlit Gold', 'Gleaming gold. For reaching Gold.', rank(TIER.gold), '#d9a520'],
    ['stormGlass', 'Storm Glass', 'Dark glass with moving cloud. For reaching Admiral.', rank(TIER.admiral), '#2d3b4a'],
  ]),
  ...kind('figurehead', [
    ['plainStem', 'Plain Stem', 'A bare curved stem.', at(1)],
    ['heron', 'Heron', 'A heron with its neck outstretched.', at(3)],
    ['stormPetrel', 'Storm Petrel', 'A small seabird skimming the waves.', at(6)],
    ['narwhalTusk', 'Narwhal Tusk', 'A long spiral tusk.', at(9)],
    ['coiledEel', 'Coiled Eel', 'An eel wound around the stem.', at(12)],
    ['ammonite', 'Ammonite', 'A great spiral shell.', at(15)],
    ['coralAntler', 'Coral Antler', 'Branching red coral.', at(19)],
    ['iceShard', 'Ice Shard', 'A blade of blue ice.', at(23)],
    ['kelpCrown', 'Kelp Crown', 'Kelp fronds streaming back.', at(27)],
    ['whaleFluke', 'Whale Fluke', 'A whale tail rising.', at(31)],
    ['leapingDolphin', 'Leaping Dolphin', 'A dolphin mid-leap.', at(36)],
    ['emberBloom', 'Ember Bloom', 'A glowing flame-tree flower.', at(43)],
    ['sunburst', 'Sunburst', 'Rays of gold. For reaching Platinum.', rank(TIER.platinum)],
    ['greatWhale', 'Great Whale', 'A breaching whale. For reaching Legend.', rank(TIER.legend)],
  ]),
  ...kind('emblem', [
    ['gull', 'Gull', 'A gull in flight.', at(1)],
    ['wave', 'Wave', 'A single curling wave.', at(1)],
    ['crescentMoon', 'Crescent Moon', 'A thin new moon.', at(2)],
    ['risingSun', 'Rising Sun', 'Half a sun over the sea line.', at(4)],
    ['northStar', 'North Star', 'A four-pointed star.', at(7)],
    ['feather', 'Feather', 'One long feather.', at(10)],
    ['shell', 'Shell', 'A scallop shell.', at(13)],
    ['fern', 'Fern', 'An uncurling fern.', at(16)],
    ['flame', 'Flame', 'A single flame.', at(20)],
    ['snowflake', 'Snowflake', 'A six-armed snowflake.', at(24)],
    ['lightning', 'Lightning', 'A forked bolt.', at(28)],
    ['whirlpool', 'Whirlpool', 'A spiral of water.', at(32)],
    ['leapingFish', 'Leaping Fish', 'A fish arcing out of the water.', at(39)],
    ['petal', 'Petal', 'A cherry blossom.', at(46)],
    ['twinStars', 'Twin Stars', 'Two bright stars. For reaching Platinum.', rank(TIER.platinum)],
    ['northernCrown', 'Northern Crown', 'An arc of seven stars. For reaching Admiral.', rank(TIER.admiral)],
  ]),
  ...kind('wake', [
    ['foam', 'Foam', 'Plain white foam.', at(1), '#ffffff'],
    ['bubbles', 'Bubbles', 'A stream of bubbles.', at(5), '#d8f2ff'],
    ['petalTrail', 'Petal Trail', 'Cherry petals on the water.', at(11), '#f6c2cf'],
    ['glowingPlankton', 'Glowing Plankton', 'Blue light that shows at night.', at(18), '#3cc8ff'],
    ['iceCrystals', 'Ice Crystals', 'Glittering frost.', at(26), '#e2f6ff'],
    ['emberSparks', 'Ember Sparks', 'Drifting sparks.', at(34), '#ff8a3a'],
    ['rainbowSpray', 'Rainbow Spray', 'Spray that throws a rainbow.', at(40), '#ffe27a'],
    ['bronzeRipple', 'Bronze Ripple', 'Burnished ripples. For reaching Bronze.', rank(TIER.bronze), '#c08040'],
    ['silverWake', 'Silver Wake', 'A shining silver trail. For reaching Silver.', rank(TIER.silver), '#dfe4ea'],
    ['gildedWake', 'Gilded Wake', 'A trail of gold light. For reaching Gold.', rank(TIER.gold), '#ffd24a'],
    ['platinumComet', 'Platinum Comet', 'A pale comet tail. For reaching Platinum.', rank(TIER.platinum), '#f2f0ff'],
    ['diamondDust', 'Diamond Dust', 'Sparkling ice dust. For reaching Diamond.', rank(TIER.diamond), '#c8f0ff'],
    ['auroraWake', 'Aurora Wake', 'Green and violet ribbons. For reaching Admiral.', rank(TIER.admiral), '#7affc0'],
    ['wakeOfLegends', 'Wake of Legends', 'A blazing trail of fire. For reaching Legend.', rank(TIER.legend), '#ff5a1a'],
  ]),
];

export const cosmetic = (id: string): Cosmetic | undefined => COSMETICS.find((c) => c.id === id);

export const cosmeticsOf = (k: CosmeticKind): Cosmetic[] => COSMETICS.filter((c) => c.kind === k);

export const isUnlocked = (c: Cosmetic, level: number, bestTier: number): boolean =>
  c.unlock.by === 'level' ? level >= c.unlock.level : bestTier >= c.unlock.tier;

/** What a ship looks like: one cosmetic id per kind. A captain's emblem is its own sigil (see captains.ts). */
export interface Look {
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
