// The league: twenty captains. Each is a spirit, known by its colour and the sigil on its sail (never a face), with a
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
  /** Its colour, '#rrggbb': its sail, hull, pennant, chart mark and seal all wear it. */
  colour: string;
  active: ActiveId;
  passive: PassiveId;
  look: Look;
}

const FIGUREHEADS = cosmeticsOf('figurehead').filter((c) => c.unlock.by === 'level');
const WAKES = cosmeticsOf('wake').filter((c) => c.unlock.by === 'level');

type Row = readonly [id: string, name: string, meaning: string, t: TemperamentId, sigil: string, sigilName: string, active: ActiveId, passive: PassiveId, colour: string];

// The twenty colours go round the hue circle a step (18°) apart in OKLCH, so no two are within a step of each other,
// at a lightness of 0.68 and 0.80 in turn, so neighbours differ in value as well and every one stands well above the
// sea's (about 0.4 at noon in deep water, 0.13 at night), with as much chroma as sRGB holds there, up to 0.15. The
// charges are twenty different shapes at the chart mark's 24 px, no two overlapping by more than 0.53 of their area:
// a spiked disc, a ring, a crescent, a star, a cloud, lines, a peak, a flame, a bolt, a paw, antlers, wings, a bird
// perched and one in flight, a fluke and five creatures of distinct outline.
const ROWS: readonly Row[] = [
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

export const CAPTAINS: readonly Captain[] = ROWS.map(([id, name, meaning, t, sigil, sigilName, active, passive, colour], i) => ({
  id, name, meaning, temperament: t, sigil: { id: sigil, name: sigilName }, colour, active, passive,
  // her colour stands for the sail colour and hull paint, which the look keeps only as the catalogue's plainest
  look: {
    colour,
    sailColour: 'bareCanvas',
    sailPattern: 'plain',
    hullPaint: 'driftwood',
    figurehead: FIGUREHEADS[(i * 7 + 1) % FIGUREHEADS.length].id,
    emblem: sigil,
    wake: WAKES[(i * 3) % WAKES.length].id,
  },
}));

export const LEAGUE_SIZE = CAPTAINS.length;

export const captainIndex = (id: string): number => CAPTAINS.findIndex((c) => c.id === id);
