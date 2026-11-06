// Secrets: places and moments on the planet for a captain to find, in a match or on a free voyage. Most are a place
// under a condition the planet has to bring round (Moonbow Arch at night, Cinder Peak's lake while it erupts, Spice Cove
// as the sun comes up, the Kelp Cathedral at noon); some are feats (round the world on the Great Current, both poles in
// one sailing, a lightning strike survived); a few are simply hidden (the slot behind Thunder Falls, the Hollow Cedar's
// heart). Only the player finds them: the career keeps them, the match carries the ones already found in
// (state.found) so none is announced twice, and the log shows the rest as riddles.
//
// What a secret gives pays off in matches, never as raw strength:
// - a cache: something good laid at the hidden place in every match, for whoever gets there, and marked on the chart
//   of a captain who knows it;
// - an ability that is different, not stronger (Whale Call, Dark Lantern);
// - an emblem for the sail, to show where you have been.
import type { AbilityId } from './abilities.ts';
import { isNight, seaLevel, sunDir, sunHeight } from './environment.ts';
import { PI, datan2, dcos, dot, dsin, hash32, rngFrom, set, v3, type V3 } from './math.ts';
import { rollItem, spawnLoot } from './items.ts';
import { R, apart } from './sphere.ts';
import { EVENT, EVENT_STATE, PHASE, PLAYER, TICK, WHALE_STATE, emit, type MatchState, type Ship } from './state.ts';
import { newSky, skyAt } from './weather.ts';
import { fromChart, regionIndex, toChart, type RegionId } from './world/index.ts';

export type SecretId =
  | 'moonbow' | 'thunderFalls' | 'cedarHeart' | 'midnightSun' | 'eyeOfVortex' | 'starlitGlass' | 'naveAtNoon' | 'gorgeEcho'
  | 'coveAtDawn' | 'springFlood' | 'calderaFire' | 'reefAtLow' | 'sandbarLight' | 'weepingRound' | 'rootGateTide'
  | 'needleThunder' | 'whaleRoad' | 'greatCurrent' | 'poleToPole' | 'northernLights' | 'struck';

export type SecretReward = { kind: 'cache' } | { kind: 'ability'; id: AbilityId } | { kind: 'emblem'; id: string };

export interface SecretDef {
  id: SecretId;
  /** Its evocative name, once found. */
  name: string;
  /** The region it lies in, or null for a feat that spans the planet. */
  region: RegionId | null;
  /** The riddle the log shows until it is found. */
  hint: string;
  /** What finding it was, in a line, for the log and the ceremony. */
  found: string;
  reward: SecretReward;
}

const cache: SecretReward = { kind: 'cache' };
const emblem = (id: string): SecretReward => ({ kind: 'emblem', id });
const ability = (id: AbilityId): SecretReward => ({ kind: 'ability', id });

/** The catalogue. Ids are stable (the career keeps them); indices are what the match carries. Add to the end. */
export const SECRETS: readonly SecretDef[] = [
  { id: 'moonbow', name: 'The Moonbow', region: 'basaltStacks', reward: emblem('crescentMoon'),
    hint: 'The arch is named for a bow that only the night can draw.', found: 'You sailed under Moonbow Arch by night and saw its pale bow.' },
  { id: 'thunderFalls', name: 'Behind the Falls', region: 'fjords', reward: cache,
    hint: 'Thunder Falls hides a room with a wall of water for a door.', found: 'Behind Thunder Falls is a slot of still water no one can see into.' },
  { id: 'cedarHeart', name: 'The Heart of the Cedar', region: 'mistwood', reward: cache,
    hint: 'The fallen giant is hollow. Few stop to listen inside it.', found: 'You lay still in the heart of the Hollow Cedar.' },
  { id: 'midnightSun', name: 'The Midnight Sun', region: 'iceCrown', reward: emblem('sunOnSea'),
    hint: 'Some years the Crown is never dark. Be there when it is so.', found: 'You reached the Crown under a sun that never sets.' },
  { id: 'eyeOfVortex', name: 'The Eye of the Vortex', region: 'maelstrom', reward: emblem('whirlpool'),
    hint: 'When the Maelstrom winds up, everyone flees the Eye. Do not.', found: 'You rode the rising vortex into the calm at its Eye.' },
  { id: 'starlitGlass', name: 'Starlit Glasswater', region: 'glassSea', reward: emblem('twinStars'),
    hint: 'Glasswater holds two skies on a clear night.', found: 'You floated in Glasswater under a clear night sky.' },
  { id: 'naveAtNoon', name: 'Noon in the Cathedral', region: 'kelpShallows', reward: emblem('coralFan'),
    hint: 'The Kelp Cathedral fills with light once a day, when the sun stands highest.', found: 'You were in the nave of the Kelp Cathedral at noon.' },
  { id: 'gorgeEcho', name: 'The Gorge Answers', region: 'narrows', reward: emblem('jaggedRocks'),
    hint: 'The walls of the Gorge answer whoever speaks loudly between them.', found: 'You fired your guns in the Gorge and heard it fire back.' },
  { id: 'coveAtDawn', name: 'Dawn in Spice Cove', region: 'spiceIsles', reward: emblem('firefly'),
    hint: 'Spice Cove faces the sea it wakes to.', found: 'You were in Spice Cove as the sun came up.' },
  { id: 'springFlood', name: 'The Spring Flood', region: 'blossomRun', reward: emblem('blossom'),
    hint: 'When the river runs high, the Great Cherry lets go of its petals.', found: 'You rode the Spring Flood under the Great Cherry.' },
  { id: 'calderaFire', name: 'The Heart of Fire', region: 'fireArchipelago', reward: emblem('twinFlames'),
    hint: 'Cinder Peak keeps a lake in its crater. Visit while it is angry.', found: 'You sailed the caldera lake while Cinder Peak erupted.' },
  { id: 'reefAtLow', name: 'Dead Low Water', region: 'coralAtolls', reward: cache,
    hint: 'The Great Reef has two shallow doors. Slip through one when the sea is at its lowest.', found: 'You slipped through the Great Reef at dead low water.' },
  { id: 'sandbarLight', name: 'The Sandbar Light', region: 'jadeShoals', reward: ability('darkLantern'),
    hint: 'The glowing dune knows how to hide a light. Ask it at night.', found: 'By the Sandbar Light at night you learnt to darken your lantern.' },
  { id: 'weepingRound', name: 'The Hundred Falls', region: 'weepingIsle', reward: emblem('fallingDrop'),
    hint: 'The Weeping Isle has a hundred falls. Count them all.', found: 'You sailed all the way round the Weeping Isle.' },
  { id: 'rootGateTide', name: 'The King Tide', region: 'mangroveLabyrinth', reward: cache,
    hint: 'Pass under the Root Gate when the Labyrinth floods.', found: 'You passed under the Root Gate on the king tide.' },
  { id: 'needleThunder', name: 'Thunder on the Needle', region: 'spires', reward: emblem('forkedBolt'),
    hint: 'The Needle is the tallest thing for a long way. Storms know it.', found: 'You stood by the Needle under a thunderhead.' },
  { id: 'whaleRoad', name: 'The Whale Road', region: 'glassSea', reward: ability('whaleCall'),
    hint: 'The whale surfaces to breathe. Be close enough to share the breath.', found: 'The whale surfaced beside you, and now it knows your call.' },
  { id: 'greatCurrent', name: 'Round the World', region: null, reward: emblem('meridianArc'),
    hint: 'The Great Current never ends. Neither should you.', found: 'You sailed all the way round the world near the equator.' },
  { id: 'poleToPole', name: 'Pole to Pole', region: null, reward: emblem('windRose'),
    hint: 'The world has two ends. Visit both in one sailing.', found: 'You reached the Crown and the Eye in one sailing.' },
  { id: 'northernLights', name: 'Under the Lights', region: null, reward: emblem('northernCrown'),
    hint: 'Near the ends of the world the night sky moves.', found: 'You sailed under the aurora on a clear night.' },
  { id: 'struck', name: 'Lightning\'s Mark', region: null, reward: emblem('splinterBurst'),
    hint: 'Thunder finds the tallest mast. Let it find yours, and live.', found: 'Lightning struck your mast, and you sailed on.' },
];

export const SECRET_COUNT = SECRETS.length;
export const secretIndex = (id: SecretId): number => SECRETS.findIndex((s) => s.id === id);
export const secret = (id: string): SecretDef | undefined => SECRETS.find((s) => s.id === id);

/** The secrets that give each ability, and each emblem. */
export const ABILITY_SECRET: Readonly<Partial<Record<AbilityId, SecretId>>> = Object.fromEntries(
  SECRETS.flatMap((s) => (s.reward.kind === 'ability' ? [[s.reward.id, s.id]] : [])),
);
export const EMBLEM_SECRET: Readonly<Record<string, SecretId>> = Object.fromEntries(
  SECRETS.flatMap((s) => (s.reward.kind === 'emblem' ? [[s.reward.id, s.id]] : [])),
);

// ---------------------------------------------------------------- where

const at = (id: RegionId, x: number, y: number): V3 => fromChart(regionIndex(id), x, y);
const DEG = PI / 180;

/** The places, in each region's chart (see its file): the spot, and how near counts. */
export const SECRET_PLACES: Readonly<Partial<Record<SecretId, { at: V3; r: number }>>> = {
  // under the span of Moonbow Arch
  moonbow: { at: at('basaltStacks', 60, -40), r: 26 },
  // the slot of water between the curtain and the head wall's foot
  thunderFalls: { at: at('fjords', 0, 112), r: 8 },
  // the middle of the Hollow Cedar's bore
  cedarHeart: { at: at('mistwood', 0, 25), r: 12 },
  midnightSun: { at: at('iceCrown', 0, 0), r: 150 },
  eyeOfVortex: { at: at('maelstrom', 0, 0), r: 55 },
  starlitGlass: { at: at('glassSea', 0, -10), r: 36 },
  naveAtNoon: { at: at('kelpShallows', 0, 30), r: 58 },
  coveAtDawn: { at: at('spiceIsles', 5, -32), r: 30 },
  springFlood: { at: at('blossomRun', 58, 44), r: 130 },
  // the caldera lake
  calderaFire: { at: at('fireArchipelago', 0, 25), r: 40 },
  sandbarLight: { at: at('jadeShoals', 10, -10), r: 95 },
  rootGateTide: { at: at('mangroveLabyrinth', 0, 0), r: 16 },
  needleThunder: { at: at('spires', 0, 50), r: 80 },
};

/** The Great Reef's two sills (its gaps at bearings 140 and 300, 100 m out from its centre). */
const REEF = { x: -20, y: -25, r: 100 } as const;
const SILLS = [140, 300].map((b) => at('coralAtolls', REEF.x + REEF.r * dsin(b * DEG), REEF.y + REEF.r * dcos(b * DEG)));

/** Where each cache lies: in the hidden place itself, or (for the reef) just inside its door. */
export const CACHE_PLACES: readonly { secret: SecretId; at: V3 }[] = [
  { secret: 'thunderFalls', at: at('fjords', 0, 113) },
  { secret: 'cedarHeart', at: at('mistwood', 0, 25) },
  { secret: 'reefAtLow', at: at('coralAtolls', REEF.x + 82 * dsin(300 * DEG), REEF.y + 82 * dcos(300 * DEG)) },
  { secret: 'rootGateTide', at: at('mangroveLabyrinth', 0, 0) },
];

const WEEPING = { at: at('weepingIsle', 0, -15), r: 340 } as const;
/** Within 150 m of a pole. */
const POLE = dcos(150 / R);
const NARROWS = regionIndex('narrows');
/** The Gorge, in the Narrows' chart (narrows.ts): its axis wanders east and west as it runs north to south. */
const gorgeAxis = (y: number): number => 16 * dsin(y * 0.011) + 6 * dsin(y * 0.027 + 1);

// ---------------------------------------------------------------- finding them

/** Seconds a ship has to stay for a place to count. */
const STAY = 2;
/** Clear enough that the stars or the sun show. */
const clear = (sky: { fog: number; rain: number; thunder: number; snow: number; ash: number }): boolean =>
  sky.fog < 0.25 && sky.rain < 0.3 && sky.thunder < 0.2 && sky.snow < 0.3 && sky.ash < 0.2;

const SKY = newSky(), SUN = v3(), EAST = v3(), CH = { x: 0, y: 0 };
const running = (state: MatchState, id: RegionId): boolean => state.regionEvents[regionIndex(id)]?.state === EVENT_STATE.running;
const near = (s: Ship, id: SecretId): boolean => {
  const p = SECRET_PLACES[id]!;
  return apart(s.pos, p.at) < p.r;
};

/** Longitude, in radians, as fromLatLon has it. */
const lon = (p: V3): number => datan2(-p.z, p.x);

/**
 * Whether ship s, this tick, does what secret k asks. Feats keep their progress in state.quest[k]; a place counts
 * once the ship has stayed there STAY seconds (also in quest).
 */
function test(state: MatchState, k: number, s: Ship): boolean {
  const q = state.quest, id = SECRETS[k].id, p = s.pos;
  const stay = (ok: boolean, need = STAY): boolean => {
    q[k] = ok ? q[k] + TICK : 0;
    return q[k] >= need;
  };
  switch (id) {
    case 'moonbow': return stay(near(s, id) && isNight(state, p));
    case 'thunderFalls': return stay(near(s, id));
    case 'cedarHeart': return stay(near(s, id) && Math.abs(s.speed) < 3.5, 2.5);
    case 'midnightSun': return stay(near(s, id) && sunHeight(state, p) > 0.04);
    case 'eyeOfVortex': return stay(near(s, id) && running(state, 'maelstrom'));
    case 'starlitGlass': return stay(near(s, id) && isNight(state, p) && clear(skyAt(state, p, SKY)), 3);
    case 'naveAtNoon': {
      // noon: the sun crossing the meridian, high enough to light the nave
      sunDir(state, SUN);
      set(EAST, p.z, 0, -p.x);
      const e = Math.sqrt(EAST.x * EAST.x + EAST.z * EAST.z) || 1;
      return stay(near(s, id) && sunHeight(state, p) > 0.3 && Math.abs(dot(SUN, EAST) / e) < 0.09);
    }
    case 'gorgeEcho': {
      toChart(NARROWS, p, CH);
      if (Math.abs(CH.y) > 190 || Math.abs(CH.x - gorgeAxis(CH.y)) > 13) return false;
      for (const e of state.events) if (e.kind === EVENT.fire && e.ship === PLAYER) return true;
      return false;
    }
    case 'coveAtDawn': {
      sunDir(state, SUN);
      set(EAST, p.z, 0, -p.x);
      const h = sunHeight(state, p);
      return stay(near(s, id) && h > -0.04 && h < 0.1 && dot(SUN, EAST) > 0);
    }
    case 'springFlood': return stay(near(s, id) && running(state, 'blossomRun'));
    case 'calderaFire': return stay(near(s, id) && running(state, 'fireArchipelago'));
    case 'reefAtLow': {
      // at a sill while the sea stands near its lowest
      let at = false;
      for (const sill of SILLS) at ||= apart(p, sill) < 12;
      return stay(at && seaLevel(state) < -0.8, 1);
    }
    case 'sandbarLight': return stay(near(s, id) && isNight(state, p), 3);
    case 'weepingRound': {
      // the angle swept round the isle, kept while the ship stays within sight of its cliffs
      const d = apart(p, WEEPING.at);
      if (d > WEEPING.r) {
        q[k] = 0;
        return false;
      }
      const a = bearingAround(p), was = bearingAround(s.was);
      let da = a - was;
      if (da > PI) da -= 2 * PI;
      if (da < -PI) da += 2 * PI;
      q[k] += da;
      return Math.abs(q[k]) >= 2 * PI;
    }
    case 'rootGateTide': return stay(near(s, id) && running(state, 'mangroveLabyrinth'), 1);
    case 'needleThunder': return stay(near(s, id) && skyAt(state, p, SKY).thunder > 0.35);
    case 'whaleRoad': return stay(state.whale.state === WHALE_STATE.surfaced && apart(p, state.whale.at) < 28, 1);
    case 'greatCurrent': {
      // longitude made good within the equator's band, either way round
      if (Math.abs(p.y) > 0.27) return false;
      let d = lon(p) - lon(s.was);
      if (d > PI) d -= 2 * PI;
      if (d < -PI) d += 2 * PI;
      q[k] += d;
      return Math.abs(q[k]) >= 2 * PI;
    }
    case 'poleToPole': {
      const cut = POLE;
      let bits = q[k];
      if (p.y > cut && bits % 2 < 1) bits += 1;
      if (p.y < -cut && bits < 2) bits += 2;
      q[k] = bits;
      return bits >= 3;
    }
    case 'northernLights': return stay(Math.abs(p.y) > 0.86 && isNight(state, p) && clear(skyAt(state, p, SKY)), 3);
    case 'struck': {
      for (const e of state.events) if (e.kind === EVENT.lightning && e.ship === PLAYER) q[k] = 1;
      // she has to come through it: still afloat a few seconds on
      if (q[k] >= 1) q[k] += TICK;
      return q[k] >= 1 + 3;
    }
  }
}

const AROUND = { x: 0, y: 0 };
/** The bearing of p round the Weeping Isle's centre. */
function bearingAround(p: V3): number {
  toChart(regionIndex('weepingIsle'), p, AROUND);
  return datan2(AROUND.x, AROUND.y + 15);
}

/** Checks the player's ship against every secret not yet found; one found is recorded and announced. */
export function seek(state: MatchState): void {
  const s = state.ships[PLAYER];
  // what a feat has made good is lost with the ship: each is one sailing
  if (s.phase === PHASE.sunk) state.quest.fill(0);
  if (s.captain.on || s.phase !== PHASE.sea) return;
  if (state.quest.length < SECRET_COUNT) for (let k = state.quest.length; k < SECRET_COUNT; k++) state.quest.push(0);
  for (let k = 0; k < SECRET_COUNT; k++) {
    if (state.found.includes(k)) continue;
    if (!test(state, k, s)) continue;
    state.found.push(k);
    emit(state, EVENT.secret, PLAYER, -1, s.pos, { item: k });
  }
}

// ---------------------------------------------------------------- caches

/** Lays a cache at each hidden place: an epic or legendary find, the same for everyone. */
export function seedCaches(state: MatchState): void {
  const rng = rngFrom(hash32(state.seed, 0xcac4e));
  for (let c = 0; c < CACHE_PLACES.length; c++) fillCache(state, c, rng);
}

export function fillCache(state: MatchState, c: number, rng = rngFrom(hash32(state.seed + state.tick, 0xcac4e + c))): void {
  spawnLoot(state, CACHE_PLACES[c].at, rollItem(state, rng, 3), -1, CACHE_SPOT - c);
}

/** Loot laid in cache c carries spot CACHE_SPOT - c. */
export const CACHE_SPOT = -10;
export const cacheOf = (spot: number): number => (spot <= CACHE_SPOT && spot > CACHE_SPOT - CACHE_PLACES.length ? CACHE_SPOT - spot : -1);
