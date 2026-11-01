// The world's public face. Everything outside src/sim/world imports the planet from here and nowhere else:
// which region a point is in and how it blends into its neighbours, how high the ground is, the currents,
// and the fixed sites (landmarks, beacons, loot spots). Units are metres on a sphere of radius R.
//
// Everything here is deterministic: only + - * /, Math.sqrt, Math.floor, Math.abs, Math.min, Math.max and the
// helpers in ../math.ts (dsin, dcos, datan2, ...), never Math.sin or Math.random, so the simulation stays
// bit-identical in Node, Chromium and WebKit.
//
// Pass 1 contract: these names and signatures are what the simulation and the renderer code against.
// The internals start as placeholders (one round island per region) and get replaced by each region's
// own terrain code.
import { PI, dot, normalize, set, v3, type V3 } from '../math.ts';
import { R, fromLatLon } from '../sphere.ts';

export type RegionId =
  | 'iceCrown'
  | 'fjords' | 'mistwood' | 'spires' | 'narrows' | 'basaltStacks' | 'kelpShallows' | 'blossomRun'
  | 'glassSea' | 'jadeShoals' | 'coralAtolls' | 'spiceIsles' | 'fireArchipelago' | 'weepingIsle' | 'mangroveLabyrinth'
  | 'maelstrom';

export type PerkId =
  | 'frostShot' | 'fastRepair' | 'fogSight' | 'spotter' | 'longRange' | 'fastReload' | 'hiddenWake' | 'quickGust'
  | 'cheapDeliveries' | 'shallowDraft' | 'lootSense' | 'betterLoot' | 'fireShot' | 'quickHands' | 'tightTurns' | 'currentRider';

export type WeatherKind = 'clear' | 'fog' | 'rain' | 'thunder' | 'calm' | 'snow' | 'ash';

export interface RegionInfo {
  id: RegionId;
  name: string;
  /** Centre, in degrees. Increasing longitude runs east. */
  lat: number;
  lon: number;
  ring: 'pole' | 'north' | 'south';
  landmark: string;
  perk: PerkId;
  perkName: string;
  perkText: string;
  weather: readonly WeatherKind[];
  /** Indices of the regions that share a border with this one. */
  neighbours: readonly number[];
}

const RING = 360 / 7, RING_LAT = 31;

const north = (k: number) => ({ ring: 'north' as const, lat: RING_LAT, lon: k * RING });
const south = (k: number) => ({ ring: 'south' as const, lat: -RING_LAT, lon: k * RING - RING / 2 });

// Index layout: 0 the Ice Crown, 1–7 the northern ring, 8–14 the southern ring, 15 the Maelstrom.
// Southern region j sits between northern regions j-1 and j, so each ring region touches two in the other ring.
const N = (k: number) => 1 + ((k + 7) % 7), S = (k: number) => 8 + ((k + 7) % 7);
const ringNeighbours = (i: number): number[] =>
  i <= 7 ? [N(i - 2), N(i), 0, S(i - 1), S(i)] : [S(i - 9), S(i - 7), 15, N(i - 9), N(i - 8)];

const INFO: Omit<RegionInfo, 'neighbours'>[] = [
  { id: 'iceCrown', name: 'the Ice Crown', ring: 'pole', lat: 90, lon: 0, landmark: 'the Crown', perk: 'frostShot', perkName: 'Frost Shot', perkText: 'Your hits slow ships for a moment.', weather: ['snow', 'fog'] },
  { id: 'fjords', name: 'the Fjords', ...north(0), landmark: 'Thunder Falls', perk: 'fastRepair', perkName: 'Fast Repair', perkText: 'You repair twice as fast in your own water.', weather: ['fog', 'rain'] },
  { id: 'mistwood', name: 'Mistwood', ...north(1), landmark: 'the Hollow Cedar', perk: 'fogSight', perkName: 'Fog Sight', perkText: 'You see at full range through fog and at night.', weather: ['fog'] },
  { id: 'spires', name: 'the Spires', ...north(2), landmark: 'the Needle', perk: 'spotter', perkName: 'Spotter', perkText: 'Ships you hit show on the map for a few seconds.', weather: ['rain', 'thunder'] },
  { id: 'narrows', name: 'the Narrows', ...north(3), landmark: 'the Gorge', perk: 'longRange', perkName: 'Long Range', perkText: 'Your weapons reach about 15% further.', weather: ['calm', 'rain'] },
  { id: 'basaltStacks', name: 'the Basalt Stacks', ...north(4), landmark: 'Moonbow Arch', perk: 'fastReload', perkName: 'Fast Reload', perkText: 'You reload about 30% faster.', weather: ['fog', 'rain'] },
  { id: 'kelpShallows', name: 'the Kelp Shallows', ...north(5), landmark: 'the Kelp Cathedral', perk: 'hiddenWake', perkName: 'Hidden Wake', perkText: 'Your wake does not show, and you drop off the map.', weather: ['clear', 'calm'] },
  { id: 'blossomRun', name: 'Blossom Run', ...north(6), landmark: 'the Great Cherry', perk: 'quickGust', perkName: 'Quick Gust', perkText: 'Your gust recharges faster.', weather: ['clear', 'rain'] },
  { id: 'glassSea', name: 'the Glass Sea', ...south(0), landmark: 'Glasswater', perk: 'cheapDeliveries', perkName: 'Cheap Deliveries', perkText: 'Gull deliveries cost about 30% less.', weather: ['calm', 'clear'] },
  { id: 'jadeShoals', name: 'the Jade Shoals', ...south(1), landmark: 'the Sandbar Light', perk: 'shallowDraft', perkName: 'Shallow Draft', perkText: 'You can cross sandbars without running aground.', weather: ['clear', 'calm'] },
  { id: 'coralAtolls', name: 'the Coral Atolls', ...south(2), landmark: 'the Great Reef', perk: 'lootSense', perkName: 'Loot Sense', perkText: 'Nearby loot shows on your map.', weather: ['clear', 'rain'] },
  { id: 'spiceIsles', name: 'the Spice Isles', ...south(3), landmark: 'Spice Cove', perk: 'betterLoot', perkName: 'Better Loot', perkText: 'Loot you open rolls one rarity higher.', weather: ['rain', 'thunder'] },
  { id: 'fireArchipelago', name: 'the Fire Archipelago', ...south(4), landmark: 'Cinder Peak', perk: 'fireShot', perkName: 'Fire Shot', perkText: 'Your hits set ships burning.', weather: ['ash'] },
  { id: 'weepingIsle', name: 'the Weeping Isle', ...south(5), landmark: 'the Weeping Isle', perk: 'quickHands', perkName: 'Quick Hands', perkText: 'You use consumables about 30% faster.', weather: ['rain', 'fog'] },
  { id: 'mangroveLabyrinth', name: 'the Mangrove Labyrinth', ...south(6), landmark: 'the Root Gate', perk: 'tightTurns', perkName: 'Tight Turns', perkText: 'You turn much more sharply.', weather: ['rain', 'fog'] },
  { id: 'maelstrom', name: 'the Maelstrom', ring: 'pole', lat: -90, lon: 0, landmark: 'the Eye', perk: 'currentRider', perkName: 'Current Rider', perkText: 'Currents push you about 50% harder.', weather: ['rain', 'thunder'] },
];

export const REGION_COUNT = 16;

export const REGIONS: readonly RegionInfo[] = INFO.map((r, i) => ({
  ...r,
  neighbours: i === 0 ? [1, 2, 3, 4, 5, 6, 7] : i === 15 ? [8, 9, 10, 11, 12, 13, 14] : ringNeighbours(i),
}));

export const regionIndex = (id: RegionId): number => REGIONS.findIndex((r) => r.id === id);

/** Unit vectors to each region's centre. */
export const CENTRES: readonly V3[] = REGIONS.map((r) => fromLatLon(r.lat * (PI / 180), r.lon * (PI / 180), v3()));

/** The region that owns p (p is a unit vector from the planet's centre). */
export function regionAt(p: V3): number {
  let best = 0, bd = -2;
  for (let i = 0; i < REGION_COUNT; i++) {
    const d = dot(p, CENTRES[i]);
    if (d > bd) { bd = d; best = i; }
  }
  return best;
}

/** The two nearest regions and how far p has crossed toward the second: t is 0 deep inside a, 0.5 on the border. */
export interface RegionMix { a: number; b: number; t: number }

/** Half-width of the blend band either side of a border, in metres. */
export const BLEND = 60;

export function regionMix(p: V3, out: RegionMix = { a: 0, b: 0, t: 0 }): RegionMix {
  let a = 0, b = 1, da = -2, db = -2;
  for (let i = 0; i < REGION_COUNT; i++) {
    const d = dot(p, CENTRES[i]);
    if (d > da) { b = a; db = da; a = i; da = d; }
    else if (d > db) { b = i; db = d; }
  }
  // Distance to the bisector between the two centres, along the surface (small-angle form).
  const ca = CENTRES[a], cb = CENTRES[b];
  const gap = Math.sqrt((ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2 + (ca.z - cb.z) ** 2);
  const toBorder = ((da - db) / gap) * R;
  out.a = a;
  out.b = b;
  out.t = toBorder >= BLEND ? 0 : 0.5 * (1 - toBorder / BLEND);
  return out;
}

/** Height of the ground above mean sea level in metres: positive is land, negative is the sea floor. */
export function heightAt(p: V3): number {
  // Placeholder: one round island at each region's centre on a 30 m deep sea.
  const i = regionAt(p), d = (1 - dot(p, CENTRES[i])) * R * R * 2, r2 = 45 * 45;
  return d < r2 ? 18 * (1 - d / r2) - 2 : -30;
}

/** The surface current at p, in m/s, tangent to the sphere. Placeholder: the Great Current runs east along the equator. */
export function currentAt(p: V3, out: V3): V3 {
  const band = Math.max(0, 1 - Math.abs(p.y) * R / 40);
  set(out, p.z, 0, -p.x);
  const l = Math.sqrt(out.x * out.x + out.z * out.z);
  if (l < 1e-9 || band === 0) return set(out, 0, 0, 0);
  return set(out, (out.x / l) * 3 * band, 0, (out.z / l) * 3 * band);
}

export interface Site {
  region: number;
  /** Unit vector. */
  pos: V3;
  /** Unit tangent the site faces. */
  facing: V3;
  /** Radius in metres. */
  r: number;
}

export interface Landmark extends Site {
  name: string;
  /** Height in metres above sea level. */
  height: number;
}

const tangent = (p: V3): V3 => {
  const t = Math.abs(p.y) > 0.99 ? v3(1, 0, 0) : v3(0, 1, 0);
  const d = dot(t, p);
  return normalize(set(t, t.x - d * p.x, t.y - d * p.y, t.z - d * p.z));
};

export const LANDMARKS: readonly Landmark[] = REGIONS.map((r, i) => ({
  region: i, pos: CENTRES[i], facing: tangent(CENTRES[i]), r: 30, name: r.landmark, height: 50,
}));

export const BEACONS: readonly Site[] = LANDMARKS.map((l) => ({ region: l.region, pos: l.pos, facing: l.facing, r: 4 }));

export const LOOT_SPOTS: readonly Site[] = [];
