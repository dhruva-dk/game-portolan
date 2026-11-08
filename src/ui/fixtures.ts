// Fixtures: every view model filled with real-shaped data at real counts, for the gallery and for tests. The
// tables below were taken from the career's own catalogues (src/career/captains.ts and cosmetics.ts: twenty
// captains, 102 cosmetics) without importing them, so the interface stays independent of the career's internals.
// Each builder returns a fresh object, so a screen may change what it is given.
import { ABILITIES, type AbilityId, type ActiveId, type PassiveId } from '../sim/abilities.ts';
import { REGIONS } from '../sim/world/index.ts';
import {
  RANK_LADDER, rarityOf, type AbilitiesModel, type AbilityView, type CareerModel, type CosmeticKind, type CosmeticView,
  type DeathModel, type HudModel, type LevelView, type LockerModel, type Look, type PlayerView,
  type RankModel, type RankView, type ResultsModel, type RivalView, type RivalsModel,
  type Unlock, type VictoryModel,
} from './model.ts';

type CaptainRow = readonly [id: string, name: string, meaning: string, temperament: string, emblem: string, sigil: string, active: ActiveId, passive: PassiveId, colour: string];
/** A captain's seal: its charge in ink on its colour. */
const seal = (colour: string): [string, string] => [colour, '#1d1a17'];
/** Unlock: a level, or minus the rank tier. */
type CosmeticRow = readonly [id: string, kind: CosmeticKind, name: string, hint: string, unlock: number, colour?: string];

const CAPTAIN_ROWS: readonly CaptainRow[] = [
  ['corvo', 'Corvo', 'Raven', 'survivor', 'raven', 'a raven', 'smokeScreen', 'windReader', '#e66e68'],
  ['corallo', 'Corallo', 'Coral', 'holder', 'starfish', 'a starfish', 'driftMine', 'salvage', '#f9a685'],
  ['sirocchia', 'Sirocchia', 'Sister', 'skirmisher', 'flame', 'a flame', 'smokeScreen', 'lightHull', '#d68129'],
  ['meridiana', 'Meridiana', 'Meridian', 'holder', 'sun', 'the noon sun', 'repair', 'stormWalker', '#f1b136'],
  ['sorniona', 'Sorniona', 'The sly one', 'ambusher', 'scorpion', 'a scorpion', 'decoy', 'windReader', '#ae982a'],
  ['saetta', 'Saetta', 'Lightning bolt', 'hunter', 'lightning', 'a forked bolt', 'ram', 'quickReload', '#bbc949'],
  ['testuggine', 'Testuggine', 'Tortoise', 'survivor', 'turtle', 'a sea turtle', 'repair', 'stormWalker', '#72ab42'],
  ['cervo', 'Cervo', 'Stag', 'ambusher', 'stag', 'a stag', 'driftMine', 'quickReload', '#6cd98b'],
  ['rocca', 'Rocca', 'Crag', 'holder', 'mountain', 'a jagged peak', 'repair', 'deepHold', '#30b08b'],
  ['marea', 'Marea', 'Tide', 'holder', 'waves', 'three stacked waves', 'wave', 'deepHold', '#3ed8cb'],
  ['orca', 'Orca', 'Killer whale', 'hunter', 'whale', 'a whale', 'ram', 'lightHull', '#30abb7'],
  ['rondine', 'Rondine', 'Swallow', 'skirmisher', 'swift', 'a swift in flight', 'wave', 'steadyAim', '#4ccff9'],
  ['tempesta', 'Tempesta', 'Storm', 'skirmisher', 'stormCloud', 'a storm cloud', 'wave', 'quickReload', '#2ea1e7'],
  ['quieta', 'Quieta', 'The still one', 'survivor', 'crescentMoon', 'a crescent moon', 'smokeScreen', 'windReader', '#9abff9'],
  ['ombra', 'Ombra', 'Shadow', 'ambusher', 'eclipse', 'a black sun', 'decoy', 'quickReload', '#828df3'],
  ['ladra', 'Ladra', 'Thief', 'looter', 'bat', 'a bat', 'decoy', 'deepHold', '#c2b1f9'],
  ['gufo', 'Gufo', 'Owl', 'ambusher', 'owl', 'an owl', 'reveal', 'steadyAim', '#b87ad9'],
  ['rapina', 'Rapina', 'Plunder', 'looter', 'octopus', 'an octopus, arms spread', 'decoy', 'salvage', '#f498ea'],
  ['morsa', 'Morsa', 'Grip', 'hunter', 'bearPaw', 'a bear’s paw', 'hardTurn', 'quickReload', '#da6ea7'],
  ['granchio', 'Granchio', 'Crab', 'looter', 'crab', 'a crab', 'smokeScreen', 'quickHands', '#f9a0b2'],
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
    const unlocked = unlock.by === 'level' ? level >= unlock.level : unlock.by === 'rank' && tier >= unlock.tier;
    return { id, kind, name, hint, ...(colour ? { colour } : {}), rarity: rarityOf(unlock), unlock, unlocked, isNew: NEW_COSMETICS.has(id) };
  });
}

export const fxLocker = (): LockerModel => ({ level: FX_LEVEL, bestTier: FX_TIER, cosmetics: fxCosmetics(), look: { ...FX_LOOK } });

const GRUDGE = ['Remembers you sank it, and hunts you.', 'Sunk by you twice running, it hunts you hard.', 'Sunk by you again and again, it hunts you hardest.'];
const HABITS = [
  'Has learned you dive into the Spice Isles.', 'Has learned you run when half wrecked.', 'Has learned you skirt the Storm’s edge.',
  'Has learned you fight at middle range.', 'Has learned you favour the cannon.',
];

/** As the career's: the rivalry at which a captain is called a rival. */
const RIVAL_AT = 0.3;

export function fxRivals(): RivalsModel {
  const r = rng(40);
  const rivals: RivalView[] = CAPTAIN_ROWS.map(([id, name, meaning, t, emblem, sigil, active, passive, colour], i) => {
    // a mid-career player: most captains met a few times, a handful often, and only those often sunk either way are rivals
    const met = i % 7 === 6 ? 0 : Math.floor(r() * r() * 26);
    const sankYou = Math.floor(r() * Math.min(met, 8) * 0.4), sunkByYou = Math.floor(r() * Math.min(met, 8) * 0.4);
    const ahead = Math.floor(met * (0.3 + r() * 0.5)), behind = met - ahead;
    const grudge = sunkByYou > 1 ? Math.min(3, sunkByYou - 1) : 0;
    // the career's own measure: a grudge out of 3, and sinkings either way out of 6
    const rivalry = Math.min(1, grudge / 3 + (sankYou + sunkByYou) / 6);
    const habits = met > 8 ? HABITS.filter((_, k) => (i + k) % 3 === 0) : [];
    const lines = [...(grudge ? [GRUDGE[grudge - 1]] : []), ...habits,
      met === 0 ? 'Has never met you.' : `Sank you ${sankYou}, sunk by you ${sunkByYou}, in ${met} ${met === 1 ? 'match' : 'matches'} together.`];
    const rank = RANK_LADDER[Math.min(19, Math.max(0, Math.round(4 + r() * 13 + (i % 9 === 0 ? 3 : 0))))].name;
    return {
      id, name, meaning, sigil, emblem, colours: seal(colour), temperament: TEMPERAMENTS.find((x) => x.id === t)!, rank, active, passive,
      met, ahead, behind, sankYou, sunkByYou, grudge, rivalry, isRival: rivalry >= RIVAL_AT, lines,
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

export type HudState = 'calm' | 'fight' | 'storm' | 'night';

export function fxHud(state: HudState = 'calm'): HudModel {
  const fight = state === 'fight', storm = state === 'storm';
  return {
    shield: fight ? 18 : storm ? 0 : 75, shieldMax: 100, hull: fight ? 31 : storm ? 52 : 100, hullMax: 100,
    parts: fight
      ? { sail: 0.45, mast: 1, down: 9, jury: false, rudder: 0.3, flood: 0.42, sinks: 0.6, burning: true, ice: 0.7 }
      : { sail: 0, mast: 0, down: 0, jury: false, rudder: 0, flood: 0, sinks: 0.6, burning: false, ice: 0 },
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
    storm: { phase: storm ? 4 : 2, phases: 7, seconds: storm ? 38 : 72, shrinking: storm, grace: false, progress: storm ? 0.3 : 0.1, outside: storm, depth: storm ? 0.5 : 0 },
    ships: fight ? 9 : storm ? 6 : 17, kills: fight ? 3 : storm ? 4 : 1, coins: fight ? 140 : 85,
    gull: {
      price: 20, ready: fight,
      parcels: [{ name: 'Supplies', price: 20, ready: true }, { name: 'Armament', price: 45, ready: fight }, { name: 'Treasure', price: 80, ready: fight }],
    },
    throttle: fight ? 1 : storm ? 0.5 : 1,
    steady: storm ? 0.85 : fight ? 0.4 : null,
    aimed: fight ? { weapon: 'Harpoon', bearing: 0.9, wound: 0.6 } : null,
    using: storm ? { item: 'repairKit', progress: 0.55 } : null,
    region: storm ? 'the Coral Atolls' : 'the Spice Isles', regionId: storm ? 'coralAtolls' : 'spiceIsles', colour: '#b8301a', perk: storm ? null : 'Better Loot', night: state === 'night',
    perks: storm ? [] : fight ? ['betterLoot', 'fastReload', 'spotter'] : ['betterLoot'],
    weather: storm ? 'rain' : state === 'night' ? 'fog' : null,
    tide: { level: fight ? -0.6 : 0.4, rising: !fight },
    pickup: state === 'calm' ? 'Rare Harpoon' : null,
    // the Spice Isles' pearls in a fight, the Coral Atolls' tide in the Storm, and Cinder Peak warned next door at night;
    map: {
      lat: -31, lon: 167, heading: 0.6, range: 260,
      storm: { x: storm ? -210 : -60, y: storm ? 140 : 80, r: storm ? 180 : 420 }, next: { x: -40, y: 120, r: storm ? 110 : 260 },
      ships: fight
        ? [{ x: 60, y: 40, emblem: 'lightning', colour: '#bbc949' }, { x: -90, y: 110, emblem: 'whale', colour: '#30abb7', spotted: true }, { x: 150, y: -60, emblem: 'octopus', colour: '#f498ea' }]
        : [{ x: 160, y: 120, emblem: 'owl', colour: '#b87ad9' }],
      marks: [{ x: -40, y: -70, kind: 'loot' }, { x: 120, y: 30, kind: 'gull' }, { x: -150, y: -30, kind: 'beacon' }],
      marker: null,
    },
  };
}

export function fxDeath(cause: 'ship' | 'storm' = 'ship'): DeathModel {
  const [, name, , t, emblem, , , , colour] = CAPTAIN_ROWS[0];
  return {
    place: 7, ships: 20, cause, how: cause === 'ship' ? 'harpoon' : 'storm', kills: 3, damage: 1840, survived: 612,
    killer: cause === 'ship' ? { name, emblem, colours: seal(colour), rank: 'Gold III', temperament: TEMPERAMENTS.find((x) => x.id === t)!.name, weapon: 'harpoon', grudge: 2 } : null,
  };
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
export const fxMarks = () => CAPTAIN_ROWS.map(([id, name, , , emblem, , , , colour]) => ({ id, name, emblem, colours: seal(colour) }));
