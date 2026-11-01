// The league: forty captains. Each is a spirit, known by the sigil on its sail (never a face), with a
// temperament that sets how it plays, and the one active and one passive ability it always brings, so you
// learn what each rival carries. Ids are stable: saves refer to them.
// Sigil ids are the captain charges drawn in src/render/cosmetics/emblems.ts (CAPTAIN_EMBLEMS).
import type { ActiveId, PassiveId } from '../sim/abilities.ts';
import { cosmeticsOf, type Look } from './cosmetics.ts';

export type TemperamentId = 'hunter' | 'looter' | 'holder' | 'ambusher' | 'skirmisher' | 'survivor';

export interface Temperament {
  id: TemperamentId;
  /** Plain name, shown on the rivals page. */
  name: string;
  text: string;
  /** Leanings from 0 to 1, for the bots: how much it seeks fights, loot, held water and cover, and how far off it likes to fight. */
  fight: number;
  loot: number;
  hold: number;
  hide: number;
  range: number;
}

export const TEMPERAMENTS: readonly Temperament[] = [
  { id: 'hunter', name: 'Hunter', text: 'Goes looking for fights and chases down the wounded.', fight: 0.9, loot: 0.3, hold: 0.2, hide: 0.1, range: 0.3 },
  { id: 'looter', name: 'Looter', text: 'Fills its hold first and fights for the spoils.', fight: 0.4, loot: 0.9, hold: 0.2, hide: 0.3, range: 0.5 },
  { id: 'holder', name: 'Holder', text: 'Claims water and landmarks, and defends them.', fight: 0.5, loot: 0.4, hold: 0.9, hide: 0.2, range: 0.5 },
  { id: 'ambusher', name: 'Ambusher', text: 'Waits in cover and strikes the ships that pass.', fight: 0.7, loot: 0.3, hold: 0.3, hide: 0.9, range: 0.4 },
  { id: 'skirmisher', name: 'Skirmisher', text: 'Fights from long range and slips away when hit.', fight: 0.6, loot: 0.4, hold: 0.2, hide: 0.4, range: 0.9 },
  { id: 'survivor', name: 'Survivor', text: 'Avoids fights and plays for a high finish.', fight: 0.2, loot: 0.5, hold: 0.3, hide: 0.7, range: 0.7 },
];

export const temperament = (id: TemperamentId): Temperament => TEMPERAMENTS.find((t) => t.id === id)!;

export interface Captain {
  id: string;
  name: string;
  /** What the name means, for the rivals card. */
  meaning: string;
  temperament: TemperamentId;
  /** The sigil on its sail: a spirit or natural form, never a face. */
  sigil: { id: string; name: string };
  active: ActiveId;
  passive: PassiveId;
  look: Look;
}

const PATTERNS = cosmeticsOf('sailPattern').filter((c) => c.unlock.by === 'level');
const FIGUREHEADS = cosmeticsOf('figurehead').filter((c) => c.unlock.by === 'level');
const WAKES = cosmeticsOf('wake').filter((c) => c.unlock.by === 'level');

type Row = readonly [id: string, name: string, meaning: string, t: TemperamentId, sigil: string, sigilName: string, active: ActiveId, passive: PassiveId, sail: string, hull: string];

const ROWS: readonly Row[] = [
  ['saetta', 'Saetta', 'Lightning bolt', 'hunter', 'lightning', 'a forked bolt', 'ram', 'quickReload', 'emberRed', 'pitchBlack'],
  ['murena', 'Murena', 'Moray eel', 'hunter', 'serpent', 'a sea serpent', 'hardTurn', 'steadyAim', 'mistwoodMoss', 'pineBark'],
  ['astore', 'Astore', 'Goshawk', 'hunter', 'goshawk', 'a goshawk in its stoop', 'reveal', 'lightHull', 'narrowsOchre', 'driftwood'],
  ['fiera', 'Fiera', 'Wild beast', 'hunter', 'wolf', 'a running wolf', 'ram', 'steadyAim', 'flameTree', 'lavaRock'],
  ['morsa', 'Morsa', 'Grip', 'hunter', 'bearPaw', 'a bear’s paw', 'hardTurn', 'quickReload', 'basaltBlack', 'verdigris'],
  ['orca', 'Orca', 'Killer whale', 'hunter', 'whale', 'a whale', 'ram', 'lightHull', 'basaltBlack', 'pearl'],
  ['narvalo', 'Narvalo', 'Narwhal', 'hunter', 'narwhal', 'a narwhal', 'reveal', 'quickReload', 'coralBloom', 'ashGrey'],
  ['meridiana', 'Meridiana', 'Meridian', 'holder', 'sun', 'the noon sun', 'repair', 'stormWalker', 'weepingSapphire', 'sandbar'],
  ['marea', 'Marea', 'Tide', 'holder', 'waves', 'three stacked waves', 'wave', 'deepHold', 'glacierBlue', 'seaGlass'],
  ['aurora', 'Aurora', 'Dawn', 'holder', 'risingSun', 'the sun rising over the sea', 'repair', 'salvage', 'duskRose', 'moonstone'],
  ['lontana', 'Lontana', 'Far away', 'holder', 'northStar', 'the north star', 'driftMine', 'stormWalker', 'maelstromNavy', 'deepIndigo'],
  ['rosaDeiVenti', 'Rosa dei Venti', 'Rose of the winds', 'holder', 'wind', 'a gust of wind', 'wave', 'stormWalker', 'kelpGold', 'cedarRed'],
  ['rocca', 'Rocca', 'Crag', 'holder', 'mountain', 'a jagged peak', 'repair', 'deepHold', 'seafoam', 'ashGrey'],
  ['corallo', 'Corallo', 'Coral', 'holder', 'starfish', 'a starfish', 'driftMine', 'salvage', 'coralBloom', 'pearl'],
  ['gazza', 'Gazza', 'Magpie', 'looter', 'magpie', 'a magpie', 'smokeScreen', 'deepHold', 'bareCanvas', 'pitchBlack'],
  ['volpe', 'Volpe', 'Fox', 'looter', 'fox', 'a fox', 'hardTurn', 'quickHands', 'narrowsOchre', 'rustBloom'],
  ['rapina', 'Rapina', 'Plunder', 'looter', 'octopus', 'an octopus, arms spread', 'decoy', 'salvage', 'emberRed', 'driftwood'],
  ['scheggia', 'Scheggia', 'Splinter', 'looter', 'swordfish', 'a swordfish', 'smokeScreen', 'quickHands', 'jadeWater', 'verdigris'],
  ['ladra', 'Ladra', 'Thief', 'looter', 'bat', 'a bat', 'decoy', 'deepHold', 'weepingSapphire', 'sandbar'],
  ['granchio', 'Granchio', 'Crab', 'looter', 'crab', 'a crab', 'smokeScreen', 'salvage', 'flameTree', 'rustBloom'],
  ['corvo', 'Corvo', 'Raven', 'looter', 'raven', 'a raven', 'decoy', 'quickHands', 'basaltBlack', 'deepIndigo'],
  ['testuggine', 'Testuggine', 'Tortoise', 'survivor', 'turtle', 'a sea turtle', 'repair', 'stormWalker', 'mistwoodMoss', 'sandbar'],
  ['quieta', 'Quieta', 'The still one', 'survivor', 'lotus', 'a lotus', 'smokeScreen', 'windReader', 'seafoam', 'moonstone'],
  ['conchiglia', 'Conchiglia', 'Shell', 'survivor', 'nautilus', 'a nautilus shell', 'repair', 'lightHull', 'cherryPetal', 'pearl'],
  ['riccio', 'Riccio', 'Urchin', 'survivor', 'pufferfish', 'a spined pufferfish', 'decoy', 'stormWalker', 'mangroveTea', 'pineBark'],
  ['quercia', 'Quercia', 'Oak', 'survivor', 'oak', 'an oak', 'smokeScreen', 'lightHull', 'kelpGold', 'ashGrey'],
  ['acero', 'Acero', 'Maple', 'survivor', 'maple', 'a maple leaf', 'smokeScreen', 'windReader', 'glacierBlue', 'driftwood'],
  ['lucciola', 'Lucciola', 'Firefly', 'survivor', 'moth', 'a moth', 'decoy', 'lightHull', 'auroraGreen', 'deepIndigo'],
  ['pazienza', 'Pazienza', 'Patience', 'ambusher', 'heron', 'a heron, waiting', 'driftMine', 'steadyAim', 'maelstromNavy', 'ashGrey'],
  ['ombra', 'Ombra', 'Shadow', 'ambusher', 'eclipse', 'a black sun', 'decoy', 'quickReload', 'basaltBlack', 'lavaRock'],
  ['gufo', 'Gufo', 'Owl', 'ambusher', 'owl', 'an owl', 'reveal', 'steadyAim', 'mangroveTea', 'cedarRed'],
  ['avvoltoio', 'Avvoltoio', 'Vulture', 'ambusher', 'vulture', 'a vulture', 'driftMine', 'windReader', 'kelpGold', 'pitchBlack'],
  ['sorniona', 'Sorniona', 'The sly one', 'ambusher', 'scorpion', 'a scorpion', 'decoy', 'windReader', 'jadeWater', 'emberGlaze'],
  ['cervo', 'Cervo', 'Stag', 'ambusher', 'stag', 'a stag', 'driftMine', 'quickReload', 'weepingSapphire', 'seaGlass'],
  ['fortuna', 'Fortuna', 'Fortune', 'skirmisher', 'clover', 'a four-leaf clover', 'wave', 'windReader', 'kelpGold', 'sandbar'],
  ['azzardo', 'Azzardo', 'Hazard', 'skirmisher', 'volcano', 'a smoking volcano', 'hardTurn', 'lightHull', 'emberRed', 'pitchBlack'],
  ['tempesta', 'Tempesta', 'Storm', 'skirmisher', 'stormCloud', 'a storm cloud', 'wave', 'quickReload', 'maelstromNavy', 'deepIndigo'],
  ['cometa', 'Cometa', 'Comet', 'skirmisher', 'comet', 'a comet and its tail', 'hardTurn', 'windReader', 'auroraGreen', 'pearl'],
  ['sirocchia', 'Sirocchia', 'Sister', 'skirmisher', 'flame', 'a flame', 'smokeScreen', 'lightHull', 'flameTree', 'cedarRed'],
  ['rondine', 'Rondine', 'Swallow', 'skirmisher', 'swift', 'a swift in flight', 'wave', 'steadyAim', 'seafoam', 'verdigris'],
];

export const CAPTAINS: readonly Captain[] = ROWS.map(([id, name, meaning, t, sigil, sigilName, active, passive, sail, hull], i) => ({
  id, name, meaning, temperament: t, sigil: { id: sigil, name: sigilName }, active, passive,
  look: {
    sailColour: sail,
    sailPattern: PATTERNS[(i * 5 + 1) % PATTERNS.length].id,
    hullPaint: hull,
    figurehead: FIGUREHEADS[(i * 7 + 1) % FIGUREHEADS.length].id,
    emblem: sigil,
    wake: WAKES[(i * 3) % WAKES.length].id,
  },
}));

export const LEAGUE_SIZE = CAPTAINS.length;

export const captainIndex = (id: string): number => CAPTAINS.findIndex((c) => c.id === id);
