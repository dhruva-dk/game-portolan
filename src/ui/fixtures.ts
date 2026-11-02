// Fixtures: every view model filled with real-shaped data at real counts, for the gallery and for tests. The
// tables below were taken from the career's own catalogues (src/career/captains.ts and cosmetics.ts: forty
// captains, 102 cosmetics) without importing them, so the interface stays independent of the career's internals.
// Each builder returns a fresh object, so a screen may change what it is given.
import { ABILITIES, type AbilityId, type ActiveId, type PassiveId } from '../sim/abilities.ts';
import { REGIONS } from '../sim/world/index.ts';
import {
  RANK_LADDER, rarityOf, type AbilitiesModel, type AbilityView, type CareerModel, type CosmeticKind, type CosmeticView,
  type DeathModel, type GaleModel, type HudModel, type LevelView, type LobbyModel, type LockerModel, type Look, type PlayerView,
  type RankModel, type RankView, type ResultsModel, type RivalView, type RivalsModel, type SpectateModel, type TitleModel,
  type Unlock, type VictoryModel,
} from './model.ts';

type CaptainRow = readonly [id: string, name: string, meaning: string, temperament: string, emblem: string, sigil: string, active: ActiveId, passive: PassiveId, sail: string, hull: string];
/** Unlock: a level, or minus the rank tier. */
type CosmeticRow = readonly [id: string, kind: CosmeticKind, name: string, hint: string, unlock: number, colour?: string];

const CAPTAIN_ROWS: readonly CaptainRow[] = [
  ['saetta', 'Saetta', 'Lightning bolt', 'hunter', 'lightning', 'a forked bolt', 'ram', 'quickReload', '#b8322a', '#1c1a18'],
  ['murena', 'Murena', 'Moray eel', 'hunter', 'serpent', 'an eel coiled to strike', 'hardTurn', 'steadyAim', '#2f5a4c', '#5a3423'],
  ['astore', 'Astore', 'Goshawk', 'hunter', 'goshawk', 'a hawk in its stoop', 'reveal', 'lightHull', '#c4823a', '#9a8f80'],
  ['fiera', 'Fiera', 'Wild beast', 'hunter', 'wolf', 'three claw marks', 'ram', 'steadyAim', '#e0441c', '#2a1512'],
  ['morsa', 'Morsa', 'Grip', 'hunter', 'scorpion', 'a claw closing', 'hardTurn', 'quickReload', '#26282b', '#4f9a88'],
  ['orca', 'Orca', 'Killer whale', 'hunter', 'whale', 'a tall black fin', 'ram', 'lightHull', '#26282b', '#efe6d6'],
  ['zanna', 'Zanna', 'Fang', 'hunter', 'swordfish', 'a serrated tooth', 'reveal', 'quickReload', '#f07a5a', '#77736e'],
  ['meridiana', 'Meridiana', 'Meridian', 'holder', 'sun', 'an arc over the world', 'repair', 'stormWalker', '#1f4f9a', '#d7b277'],
  ['marea', 'Marea', 'Tide', 'holder', 'waves', 'three stacked waves', 'wave', 'deepHold', '#7fc3c9', '#8fbfae'],
  ['aurora', 'Aurora', 'Dawn', 'holder', 'risingSun', 'rays over the sea line', 'repair', 'salvage', '#d89aa0', '#d6dfe8'],
  ['lontana', 'Lontana', 'Far away', 'holder', 'northStar', 'an eight-pointed star', 'driftMine', 'stormWalker', '#18233f', '#232a5c'],
  ['rosaDeiVenti', 'Rosa dei Venti', 'Rose of the winds', 'holder', 'wind', 'a rose of the winds', 'wave', 'stormWalker', '#b59a3c', '#8c3b2a'],
  ['rocca', 'Rocca', 'Crag', 'holder', 'mountain', 'a jagged peak', 'repair', 'deepHold', '#cfe8dc', '#77736e'],
  ['corallo', 'Corallo', 'Coral', 'holder', 'starfish', 'a branching coral fan', 'driftMine', 'salvage', '#f07a5a', '#efe6d6'],
  ['gazza', 'Gazza', 'Magpie', 'looter', 'magpie', 'a pied wing', 'smokeScreen', 'deepHold', '#e8dcc0', '#1c1a18'],
  ['volpe', 'Volpe', 'Fox', 'looter', 'fox', 'a brush tail', 'hardTurn', 'quickHands', '#c4823a', '#9c4a22'],
  ['rapina', 'Rapina', 'Plunder', 'looter', 'octopus', 'a talon clutching', 'decoy', 'salvage', '#b8322a', '#9a8f80'],
  ['scheggia', 'Scheggia', 'Splinter', 'looter', 'volcano', 'a burst of splinters', 'smokeScreen', 'quickHands', '#8fcfb0', '#4f9a88'],
  ['ladra', 'Ladra', 'Thief', 'looter', 'bat', 'a hooked crescent', 'decoy', 'deepHold', '#1f4f9a', '#d7b277'],
  ['granchio', 'Granchio', 'Crab', 'looter', 'crab', 'a crab shell', 'smokeScreen', 'salvage', '#e0441c', '#9c4a22'],
  ['corvo', 'Corvo', 'Raven', 'looter', 'raven', 'a black wing', 'decoy', 'quickHands', '#26282b', '#232a5c'],
  ['testuggine', 'Testuggine', 'Tortoise', 'survivor', 'turtle', 'a shell of hexagons', 'repair', 'stormWalker', '#2f5a4c', '#d7b277'],
  ['quieta', 'Quieta', 'The still one', 'survivor', 'lotus', 'a single still ring', 'smokeScreen', 'windReader', '#cfe8dc', '#d6dfe8'],
  ['conchiglia', 'Conchiglia', 'Shell', 'survivor', 'nautilus', 'a whorled shell', 'repair', 'lightHull', '#f2b8c6', '#efe6d6'],
  ['riccio', 'Riccio', 'Urchin', 'survivor', 'pufferfish', 'a ball of spines', 'decoy', 'stormWalker', '#7a5530', '#5a3423'],
  ['scoglio', 'Scoglio', 'Reef rock', 'survivor', 'oak', 'a rock awash', 'smokeScreen', 'lightHull', '#b59a3c', '#77736e'],
  ['nebbia', 'Nebbia', 'Fog', 'survivor', 'moth', 'a bank of fog', 'smokeScreen', 'windReader', '#7fc3c9', '#9a8f80'],
  ['lucciola', 'Lucciola', 'Firefly', 'survivor', 'maple', 'a spark with wings', 'decoy', 'lightHull', '#3fe0a0', '#232a5c'],
  ['pazienza', 'Pazienza', 'Patience', 'ambusher', 'heron', 'a falling drop', 'driftMine', 'steadyAim', '#18233f', '#77736e'],
  ['ombra', 'Ombra', 'Shadow', 'ambusher', 'eclipse', 'a black sun', 'decoy', 'quickReload', '#26282b', '#2a1512'],
  ['gufo', 'Gufo', 'Owl', 'ambusher', 'owl', 'spread owl wings', 'reveal', 'steadyAim', '#7a5530', '#8c3b2a'],
  ['avvoltoio', 'Avvoltoio', 'Vulture', 'ambusher', 'vulture', 'a broken feather', 'driftMine', 'windReader', '#b59a3c', '#1c1a18'],
  ['sorniona', 'Sorniona', 'The sly one', 'ambusher', 'stag', 'a tight spiral', 'decoy', 'windReader', '#8fcfb0', '#5c1410'],
  ['risacca', 'Risacca', 'Undertow', 'ambusher', 'narwhal', 'a wave folding under', 'driftMine', 'quickReload', '#1f4f9a', '#8fbfae'],
  ['fortuna', 'Fortuna', 'Fortune', 'skirmisher', 'clover', 'a four-leaf sprig', 'wave', 'windReader', '#b59a3c', '#d7b277'],
  ['azzardo', 'Azzardo', 'Hazard', 'skirmisher', 'bearPaw', 'rocks breaking the surface', 'hardTurn', 'lightHull', '#b8322a', '#1c1a18'],
  ['tempesta', 'Tempesta', 'Storm', 'skirmisher', 'stormCloud', 'a storm cloud', 'wave', 'quickReload', '#18233f', '#232a5c'],
  ['cometa', 'Cometa', 'Comet', 'skirmisher', 'comet', 'a comet and its tail', 'hardTurn', 'windReader', '#3fe0a0', '#efe6d6'],
  ['sirocchia', 'Sirocchia', 'Sister', 'skirmisher', 'flame', 'two flames', 'smokeScreen', 'lightHull', '#e0441c', '#8c3b2a'],
  ['rondine', 'Rondine', 'Swallow', 'skirmisher', 'swift', 'a forked swallow tail', 'wave', 'steadyAim', '#cfe8dc', '#4f9a88'],
];

const TEMPERAMENTS = [
  { id: 'hunter', name: 'Hunter', text: 'Goes looking for fights and chases down the wounded.' },
  { id: 'looter', name: 'Looter', text: 'Fills its hold first and fights for the spoils.' },
  { id: 'holder', name: 'Holder', text: 'Claims water and landmarks, and defends them.' },
  { id: 'ambusher', name: 'Ambusher', text: 'Waits in cover and strikes the ships that pass.' },
  { id: 'skirmisher', name: 'Skirmisher', text: 'Fights from long range and slips away when hit.' },
  { id: 'survivor', name: 'Survivor', text: 'Avoids fights and plays for a high finish.' },
];

const COSMETIC_ROWS: readonly CosmeticRow[] = [
  ['bareCanvas', 'sailColour', 'Bare Canvas', 'Undyed sailcloth.', 1, '#e8dcc0'],
  ['seafoam', 'sailColour', 'Seafoam', 'Pale green-white.', 1, '#cfe8dc'],
  ['duskRose', 'sailColour', 'Dusk Rose', 'Soft evening pink.', 2, '#d89aa0'],
  ['kelpGold', 'sailColour', 'Kelp Gold', 'Olive gold.', 4, '#b59a3c'],
  ['emberRed', 'sailColour', 'Ember Red', 'Deep glowing red.', 6, '#b8322a'],
  ['glacierBlue', 'sailColour', 'Glacier Blue', 'Milky turquoise.', 9, '#7fc3c9'],
  ['mistwoodMoss', 'sailColour', 'Mistwood Moss', 'Dark blue-green.', 12, '#2f5a4c'],
  ['narrowsOchre', 'sailColour', 'Narrows Ochre', 'Warm sandstone ochre.', 15, '#c4823a'],
  ['cherryPetal', 'sailColour', 'Cherry Petal', 'Blossom pink.', 18, '#f2b8c6'],
  ['basaltBlack', 'sailColour', 'Basalt Black', 'Near-black grey.', 21, '#26282b'],
  ['jadeWater', 'sailColour', 'Jade Water', 'Pale jade.', 24, '#8fcfb0'],
  ['coralBloom', 'sailColour', 'Coral Bloom', 'Coral orange-pink.', 27, '#f07a5a'],
  ['flameTree', 'sailColour', 'Flame Tree', 'Hot orange-red.', 30, '#e0441c'],
  ['weepingSapphire', 'sailColour', 'Weeping Sapphire', 'Deep sapphire blue.', 33, '#1f4f9a'],
  ['mangroveTea', 'sailColour', 'Mangrove Tea', 'Tea brown.', 38, '#7a5530'],
  ['maelstromNavy', 'sailColour', 'Maelstrom Navy', 'Storm-dark navy.', 44, '#18233f'],
  ['auroraGreen', 'sailColour', 'Aurora Green', 'Shimmering polar green.', 50, '#3fe0a0'],
  ['bronzeLeaf', 'sailColour', 'Bronze Leaf', 'Burnished bronze. For reaching Bronze.', -1, '#a86b32'],
  ['silverMist', 'sailColour', 'Silver Mist', 'Bright silver. For reaching Silver.', -2, '#c9ced6'],
  ['goldenHour', 'sailColour', 'Golden Hour', 'Shining gold. For reaching Gold.', -3, '#e8b830'],
  ['platinumDawn', 'sailColour', 'Platinum Dawn', 'Pale platinum with a dawn blush. For reaching Platinum.', -4, '#e4e2ec'],
  ['diamondFrost', 'sailColour', 'Diamond Frost', 'Glittering ice blue. For reaching Diamond.', -5, '#bfeaff'],
  ['abyssalInk', 'sailColour', 'Abyssal Ink', 'Black-blue with a deep sheen. For reaching Admiral.', -6, '#0b1430'],
  ['livingFlame', 'sailColour', 'Living Flame', 'Gold fading to red, as if alight. For reaching Legend.', -7, '#ff7a18'],
  ['plain', 'sailPattern', 'Plain', 'One colour, no pattern.', 1],
  ['singleStripe', 'sailPattern', 'Single Stripe', 'One broad band across the sail.', 2],
  ['twinBands', 'sailPattern', 'Twin Bands', 'Two narrow bands.', 5],
  ['quartered', 'sailPattern', 'Quartered', 'The sail split into four.', 7],
  ['chevron', 'sailPattern', 'Chevron', 'A V pointing down the sail.', 11],
  ['waveCrest', 'sailPattern', 'Wave Crest', 'A curling wave along the foot.', 14],
  ['spiral', 'sailPattern', 'Spiral', 'A spiral at the centre of the sail.', 17],
  ['scales', 'sailPattern', 'Scales', 'Overlapping fish scales.', 20],
  ['ripples', 'sailPattern', 'Ripples', 'Rings spreading from one corner.', 23],
  ['starfield', 'sailPattern', 'Starfield', 'Scattered small stars.', 26],
  ['feathered', 'sailPattern', 'Feathered', 'Long feather shapes.', 29],
  ['forkedLightning', 'sailPattern', 'Forked Lightning', 'A bolt across the sail.', 35],
  ['tideLines', 'sailPattern', 'Tide Lines', 'Fine wavy lines like a sand flat.', 41],
  ['laurelEdge', 'sailPattern', 'Laurel Edge', 'A leaf border. For reaching Gold.', -3],
  ['diamondLattice', 'sailPattern', 'Diamond Lattice', 'A glittering diamond grid. For reaching Diamond.', -5],
  ['crownOfStars', 'sailPattern', 'Crown of Stars', 'A ring of bright stars. For reaching Legend.', -7],
  ['driftwood', 'hullPaint', 'Driftwood', 'Sun-bleached grey wood.', 1, '#9a8f80'],
  ['pitchBlack', 'hullPaint', 'Pitch Black', 'Black, glossy and wet.', 1, '#1c1a18'],
  ['seaGlass', 'hullPaint', 'Sea Glass', 'Frosted green.', 3, '#8fbfae'],
  ['rustBloom', 'hullPaint', 'Rust Bloom', 'Orange-brown.', 8, '#9c4a22'],
  ['verdigris', 'hullPaint', 'Verdigris', 'Blue-green patina.', 10, '#4f9a88'],
  ['pineBark', 'hullPaint', 'Pine Bark', 'Dark red-brown.', 13, '#5a3423'],
  ['sandbar', 'hullPaint', 'Sandbar', 'Warm amber sand.', 16, '#d7b277'],
  ['lavaRock', 'hullPaint', 'Lava Rock', 'Black with red cracks.', 19, '#2a1512'],
  ['moonstone', 'hullPaint', 'Moonstone', 'Milky blue-white.', 22, '#d6dfe8'],
  ['ashGrey', 'hullPaint', 'Ash Grey', 'Soft volcanic grey.', 25, '#77736e'],
  ['cedarRed', 'hullPaint', 'Cedar Red', 'Rich red wood.', 28, '#8c3b2a'],
  ['pearl', 'hullPaint', 'Pearl', 'Lustrous cream.', 32, '#efe6d6'],
  ['kelpBronze', 'hullPaint', 'Kelp Bronze', 'Olive bronze.', 36, '#6e5f2c'],
  ['deepIndigo', 'hullPaint', 'Deep Indigo', 'Night blue.', 42, '#232a5c'],
  ['emberGlaze', 'hullPaint', 'Ember Glaze', 'Dark red that glows at night.', 48, '#5c1410'],
  ['quicksilver', 'hullPaint', 'Quicksilver', 'Mirror silver. For reaching Silver.', -2, '#c6ccd4'],
  ['sunlitGold', 'hullPaint', 'Sunlit Gold', 'Gleaming gold. For reaching Gold.', -3, '#d9a520'],
  ['stormGlass', 'hullPaint', 'Storm Glass', 'Dark glass with moving cloud. For reaching Admiral.', -6, '#2d3b4a'],
  ['plainStem', 'figurehead', 'Plain Stem', 'A bare curved stem.', 1],
  ['heron', 'figurehead', 'Heron', 'A heron with its neck outstretched.', 3],
  ['stormPetrel', 'figurehead', 'Storm Petrel', 'A small seabird skimming the waves.', 6],
  ['narwhalTusk', 'figurehead', 'Narwhal Tusk', 'A long spiral tusk.', 9],
  ['coiledEel', 'figurehead', 'Coiled Eel', 'An eel wound around the stem.', 12],
  ['ammonite', 'figurehead', 'Ammonite', 'A great spiral shell.', 15],
  ['coralAntler', 'figurehead', 'Coral Antler', 'Branching red coral.', 19],
  ['iceShard', 'figurehead', 'Ice Shard', 'A blade of blue ice.', 23],
  ['kelpCrown', 'figurehead', 'Kelp Crown', 'Kelp fronds streaming back.', 27],
  ['whaleFluke', 'figurehead', 'Whale Fluke', 'A whale tail rising.', 31],
  ['leapingDolphin', 'figurehead', 'Leaping Dolphin', 'A dolphin mid-leap.', 36],
  ['emberBloom', 'figurehead', 'Ember Bloom', 'A glowing flame-tree flower.', 43],
  ['sunburst', 'figurehead', 'Sunburst', 'Rays of gold. For reaching Platinum.', -4],
  ['greatWhale', 'figurehead', 'Great Whale', 'A breaching whale. For reaching Legend.', -7],
  ['gull', 'emblem', 'Gull', 'A gull in flight.', 1],
  ['wave', 'emblem', 'Wave', 'A single curling wave.', 1],
  ['crescentMoon', 'emblem', 'Crescent Moon', 'A thin new moon.', 2],
  ['risingSun', 'emblem', 'Rising Sun', 'Half a sun over the sea line.', 4],
  ['northStar', 'emblem', 'North Star', 'A four-pointed star.', 7],
  ['feather', 'emblem', 'Feather', 'One long feather.', 10],
  ['shell', 'emblem', 'Shell', 'A scallop shell.', 13],
  ['fern', 'emblem', 'Fern', 'An uncurling fern.', 16],
  ['flame', 'emblem', 'Flame', 'A single flame.', 20],
  ['snowflake', 'emblem', 'Snowflake', 'A six-armed snowflake.', 24],
  ['lightning', 'emblem', 'Lightning', 'A forked bolt.', 28],
  ['whirlpool', 'emblem', 'Whirlpool', 'A spiral of water.', 32],
  ['leapingFish', 'emblem', 'Leaping Fish', 'A fish arcing out of the water.', 39],
  ['petal', 'emblem', 'Petal', 'A cherry blossom.', 46],
  ['twinStars', 'emblem', 'Twin Stars', 'Two bright stars. For reaching Platinum.', -4],
  ['northernCrown', 'emblem', 'Northern Crown', 'An arc of seven stars. For reaching Admiral.', -6],
  ['foam', 'wake', 'Foam', 'Plain white foam.', 1, '#ffffff'],
  ['bubbles', 'wake', 'Bubbles', 'A stream of bubbles.', 5, '#d8f2ff'],
  ['petalTrail', 'wake', 'Petal Trail', 'Cherry petals on the water.', 11, '#f6c2cf'],
  ['glowingPlankton', 'wake', 'Glowing Plankton', 'Blue light that shows at night.', 18, '#3cc8ff'],
  ['iceCrystals', 'wake', 'Ice Crystals', 'Glittering frost.', 26, '#e2f6ff'],
  ['emberSparks', 'wake', 'Ember Sparks', 'Drifting sparks.', 34, '#ff8a3a'],
  ['rainbowSpray', 'wake', 'Rainbow Spray', 'Spray that throws a rainbow.', 40, '#ffe27a'],
  ['bronzeRipple', 'wake', 'Bronze Ripple', 'Burnished ripples. For reaching Bronze.', -1, '#c08040'],
  ['silverWake', 'wake', 'Silver Wake', 'A shining silver trail. For reaching Silver.', -2, '#dfe4ea'],
  ['gildedWake', 'wake', 'Gilded Wake', 'A trail of gold light. For reaching Gold.', -3, '#ffd24a'],
  ['platinumComet', 'wake', 'Platinum Comet', 'A pale comet tail. For reaching Platinum.', -4, '#f2f0ff'],
  ['diamondDust', 'wake', 'Diamond Dust', 'Sparkling ice dust. For reaching Diamond.', -5, '#c8f0ff'],
  ['auroraWake', 'wake', 'Aurora Wake', 'Green and violet ribbons. For reaching Admiral.', -6, '#7affc0'],
  ['wakeOfLegends', 'wake', 'Wake of Legends', 'A blazing trail of fire. For reaching Legend.', -7, '#ff5a1a'],
];

const ABILITY_LEVEL: Record<AbilityId, number> = {"repair":1,"salvage":1,"smokeScreen":3,"quickReload":5,"hardTurn":8,"quickHands":10,"ram":13,"lightHull":16,"reveal":19,"windReader":22,"decoy":25,"stormWalker":28,"wave":31,"deepHold":34,"driftMine":37,"steadyAim":40}

// ---------------------------------------------------------------- helpers

/** A small seeded random, so fixtures are the same every load. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const xpToNext = (level: number) => 300 + 40 * (Math.min(level, 40) - 1);
const levelView = (level: number, into: number): LevelView => ({ level, into, need: xpToNext(level) });
const rankView = (index: number, progress: number, floored = false): RankView => ({ ...RANK_LADDER[index], progress, floored });

const unlockOf = (n: number): Unlock => (n > 0 ? { by: 'level', level: n } : { by: 'rank', tier: -n });

/** The fixture player: level 14, Gold II, has reached Gold. */
export const FX_LEVEL = 14, FX_TIER = 3;

export const FX_LOOK: Look = {
  sailColour: 'emberRed', sailPattern: 'chevron', hullPaint: 'pineBark', figurehead: 'coiledEel', emblem: 'risingSun', wake: 'bubbles',
};

/** Cosmetics new since the last visit to the locker. */
const NEW_COSMETICS = new Set(['narrowsOchre', 'waveCrest', 'ammonite']);
const NEW_ABILITIES = new Set<AbilityId>(['ram']);

// ---------------------------------------------------------------- builders

export function fxPlayer(): PlayerView {
  return { name: 'Your ship', level: levelView(FX_LEVEL, 512), rank: rankView(10, 0.62), bestTier: FX_TIER, emblem: 'risingSun', colours: ['#b8322a', '#5a3423'] };
}

export const fxTitle = (progress = 0.64): TitleModel => ({ progress, status: progress < 1 ? 'Charting the seas' : 'Ready', version: 'Portolan · build 2' });

export function fxAbilityViews(level = FX_LEVEL): AbilityView[] {
  return ABILITIES.map((a) => ({
    id: a.id, kind: a.kind, name: a.name, text: a.text, cooldown: a.cooldown, level: ABILITY_LEVEL[a.id],
    unlocked: ABILITY_LEVEL[a.id] <= level, isNew: NEW_ABILITIES.has(a.id),
  }));
}

export const fxAbilities = (): AbilitiesModel => ({ level: FX_LEVEL, abilities: fxAbilityViews(), active: 'smokeScreen', passive: 'quickReload' });

export function fxCosmetics(level = FX_LEVEL, tier = FX_TIER): CosmeticView[] {
  return COSMETIC_ROWS.map(([id, kind, name, hint, n, colour]) => {
    const unlock = unlockOf(n);
    const unlocked = unlock.by === 'level' ? level >= unlock.level : tier >= unlock.tier;
    return { id, kind, name, hint, ...(colour ? { colour } : {}), rarity: rarityOf(unlock), unlock, unlocked, isNew: NEW_COSMETICS.has(id) };
  });
}

export const fxLocker = (): LockerModel => ({ level: FX_LEVEL, bestTier: FX_TIER, cosmetics: fxCosmetics(), look: { ...FX_LOOK } });

const GRUDGE = ['Remembers you sank it, and hunts you.', 'Sunk by you twice running, it hunts you hard.', 'Sunk by you again and again, it hunts you hardest.'];
const HABITS = [
  'Has learned you dive into the Spice Isles.', 'Has learned you run when half wrecked.', 'Has learned you skirt the Storm’s edge.',
  'Has learned you fight at middle range.', 'Has learned you favour the cannon.',
];

export function fxRivals(): RivalsModel {
  const r = rng(40);
  const rivals: RivalView[] = CAPTAIN_ROWS.map(([id, name, meaning, t, emblem, sigil, active, passive, sail, hull], i) => {
    const met = i % 7 === 6 ? 0 : Math.floor(r() * 26);
    const sankYou = Math.floor(r() * Math.min(met, 6) * 0.6), sunkByYou = Math.floor(r() * Math.min(met, 6) * 0.6);
    const ahead = Math.floor(met * (0.3 + r() * 0.5)), behind = met - ahead;
    const grudge = sunkByYou > 2 ? Math.min(3, sunkByYou - 2) : 0;
    const rivalry = met === 0 ? 0 : Math.min(1, (sankYou + sunkByYou) / 7 + grudge * 0.2 + met / 60);
    const habits = met > 8 ? HABITS.filter((_, k) => (i + k) % 3 === 0) : [];
    const lines = [...(grudge ? [GRUDGE[grudge - 1]] : []), ...habits,
      met === 0 ? 'Has never met you.' : `Sank you ${sankYou}, sunk by you ${sunkByYou}, in ${met} ${met === 1 ? 'match' : 'matches'} together.`];
    const rank = RANK_LADDER[Math.min(19, Math.max(0, Math.round(4 + r() * 13 + (i % 9 === 0 ? 3 : 0))))].name;
    return {
      id, name, meaning, sigil, emblem, colours: [sail, hull], temperament: TEMPERAMENTS.find((x) => x.id === t)!, rank, active, passive,
      met, ahead, behind, sankYou, sunkByYou, grudge, rivalry, isRival: rivalry >= 0.5, lines,
    };
  });
  rivals.sort((a, b) => b.rivalry - a.rivalry || b.met - a.met || a.name.localeCompare(b.name));
  return { rivals };
}

export function fxCareer(): CareerModel {
  const sailed = [0, 3, 0, 1, 6, 0, 2, 0, 4, 1, 0, 9, 2, 0, 1, 0];
  return {
    player: fxPlayer(),
    stats: { matches: 37, wins: 4, top5: 15, kills: 61, damage: 48210, survived: 37 * 640, bestPlace: 1 },
    chart: REGIONS.map((reg, index) => ({ index, name: reg.name, sailed: sailed[index] })),
    habits: ['You dive into the Spice Isles.', 'You fight at middle range.', 'You favour the cannon.'],
  };
}

export const fxRank = (): RankModel => ({ rank: rankView(10, 0.62), bestTier: FX_TIER, rewards: fxCosmetics().filter((c) => c.unlock.by === 'rank') });

export function fxLobby(): LobbyModel {
  return {
    player: fxPlayer(), active: 'smokeScreen', passive: 'quickReload', look: { ...FX_LOOK },
    news: { locker: 3, abilities: 1 },
    ticker: ['Saetta remembers you sank it, and hunts you.', 'Orca has learned you dive into the Spice Isles.'],
    stats: { matches: 37, wins: 4, top5: 15 },
  };
}

export function fxGale(): GaleModel {
  const r = rng(7);
  return {
    seconds: 14, total: 35, sun: { lat: 12, lon: 40 }, pick: 11, below: 6, ships: 20,
    at: { lat: 18, lon: -30 },
    path: Array.from({ length: 13 }, (_, k) => ({ lat: 18 + k * 2.5, lon: -30 + k * 6 })),
    regions: REGIONS.map((_, index) => ({ index, open: index !== 0 && index !== 15, heading: index === 0 || index === 15 ? 0 : Math.floor(r() * 4) })),
  };
}

export type HudState = 'calm' | 'fight' | 'storm' | 'night';

export function fxHud(state: HudState = 'calm'): HudModel {
  const fight = state === 'fight', storm = state === 'storm';
  return {
    shield: fight ? 18 : storm ? 0 : 75, shieldMax: 100, hull: fight ? 31 : storm ? 52 : 100, hullMax: 100,
    slots: [
      { kind: 'weapon', weapon: 'cannon', rarity: 2, ammo: fight ? 0 : 4, mag: 4, reload: fight ? 0.45 : 0 },
      { kind: 'weapon', weapon: 'scatter', rarity: 3, ammo: 6, mag: 8, reload: 0 },
      { kind: 'weapon', weapon: 'mortar', rarity: 4, ammo: 1, mag: 2, reload: 0 },
      { kind: 'consumable', item: 'smallShield', count: 4 },
      fight ? { kind: 'empty' } : { kind: 'consumable', item: 'repairKit', count: 3 },
    ],
    selected: fight ? 0 : storm ? 4 : 1,
    ability: { id: 'smokeScreen', ready: fight ? 0.35 : 1, seconds: fight ? 23 : 0 },
    passive: 'quickReload',
    gust: { charges: fight ? 0 : storm ? 1 : 2, max: 2, recharge: fight ? 0.7 : 0.4 },
    storm: { phase: storm ? 4 : 2, phases: 7, seconds: storm ? 38 : 72, shrinking: storm, outside: storm },
    ships: fight ? 9 : storm ? 6 : 17, kills: fight ? 3 : storm ? 4 : 1, coins: fight ? 140 : 85,
    gull: { price: 120, ready: fight },
    using: storm ? { item: 'repairKit', progress: 0.55 } : null,
    region: storm ? 'the Coral Atolls' : 'the Spice Isles', perk: storm ? null : 'Better Loot', night: state === 'night',
    pickup: state === 'calm' ? 'Rare Harpoon' : null,
    map: {
      lat: -31, lon: 167, heading: 0.6, range: 260,
      storm: { x: storm ? -210 : -60, y: storm ? 140 : 80, r: storm ? 180 : 420 }, next: { x: -40, y: 120, r: storm ? 110 : 260 },
      ships: fight ? [{ x: 60, y: 40 }, { x: -90, y: 110, spotted: true }, { x: 150, y: -60 }] : [{ x: 160, y: 120 }],
      marks: [{ x: -40, y: -70, kind: 'loot' }, { x: 120, y: 30, kind: 'gull' }, { x: -150, y: -30, kind: 'beacon' }],
    },
  };
}

export function fxDeath(cause: 'ship' | 'storm' = 'ship'): DeathModel {
  const [, name, , t, emblem, , , , sail, hull] = CAPTAIN_ROWS[0];
  return {
    place: 7, ships: 20, cause, how: cause === 'ship' ? 'harpoon' : 'storm', kills: 3, damage: 1840, survived: 612,
    killer: cause === 'ship' ? { name, emblem, colours: [sail, hull], rank: 'Gold III', temperament: TEMPERAMENTS.find((x) => x.id === t)!.name, weapon: 'harpoon', grudge: 2 } : null,
  };
}

export function fxSpectate(): SpectateModel {
  const [, name, , , emblem, , , , sail, hull] = CAPTAIN_ROWS[0];
  return { target: { name, emblem, colours: [sail, hull], rank: 'Gold III', kills: 5, shield: 40, hull: 72 }, ships: 6 };
}

export const fxVictory = (): VictoryModel => ({ kills: 7, damage: 3920, survived: 1104, ships: 20 });

export type ResultsState = 'levelUp' | 'win' | 'early';

export function fxResults(state: ResultsState = 'levelUp'): ResultsModel {
  const win = state === 'win', early = state === 'early';
  const place = win ? 1 : early ? 17 : 4, kills = win ? 7 : early ? 0 : 3;
  const parts = [
    { label: 'Played', amount: 100 },
    { label: 'Ships outlasted', amount: 12 * (20 - place) },
    ...(place <= 5 ? [{ label: 'Top 5', amount: 50 }] : []),
    ...(win ? [{ label: 'Victory', amount: 150 }] : []),
    ...(kills ? [{ label: 'Ships sunk', amount: 40 * kills }] : []),
    { label: 'Damage dealt', amount: win ? 196 : early ? 12 : 92 },
    { label: 'Time afloat', amount: win ? 220 : early ? 31 : 122 },
    ...(!early ? [{ label: 'New waters charted', amount: 30 }] : []),
  ];
  const total = parts.reduce((s, p) => s + p.amount, 0);
  const before = levelView(FX_LEVEL, 512), need = before.need - before.into;
  const after = total >= need ? levelView(FX_LEVEL + 1, total - need) : levelView(FX_LEVEL, before.into + total);
  const ab = fxAbilityViews(FX_LEVEL + 1).filter((a) => a.level === FX_LEVEL + 1);
  const cos = fxCosmetics(FX_LEVEL + 1).filter((c) => c.unlock.by === 'level' && c.unlock.level === FX_LEVEL + 1);
  const rankAfter = win ? rankView(11, 0.08) : early ? rankView(10, 0.31) : rankView(10, 0.91);
  return {
    place, ships: 20, kills, damage: win ? 3920 : early ? 240 : 1840, survived: win ? 1104 : early ? 155 : 612,
    xp: { parts, total },
    level: { before, after },
    rank: { before: rankView(10, 0.62), after: rankAfter, change: win ? 'up' : early ? 'down' : 'same', newTier: false },
    unlocked: after.level > before.level ? { abilities: ab, cosmetics: cos } : { abilities: [], cosmetics: [] },
    newRegions: early ? [] : [{ index: 10, name: REGIONS[10].name }],
    rivals: early
      ? [{ id: 'saetta', name: 'Saetta', emblem: 'lightning', colours: ['#b8322a', '#1c1a18'], what: 'sankYou' }]
      : [
        { id: 'orca', name: 'Orca', emblem: 'whale', colours: ['#26282b', '#efe6d6'], what: 'sunkByYou' },
        { id: 'gufo', name: 'Gufo', emblem: 'owl', colours: ['#7a5530', '#8c3b2a'], what: 'firstMeeting' },
      ],
  };
}

/** Every captain's mark, for whoever needs a crowd (the Gale, the spectate switcher). */
export const fxMarks = () => CAPTAIN_ROWS.map(([id, name, , , emblem, , , , sail, hull]) => ({ id, name, emblem, colours: [sail, hull] as [string, string] }));
