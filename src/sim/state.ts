// The match state: one plain object, encoded by the codec, so a match can be snapshotted, resumed and hashed.
// Every field here is part of the deterministic state; nothing outside it changes the outcome.
import { bool, bytes, decode, encode, f64, hash64, int, list, rec, words, type Format, type Value } from './codec.ts';
import { v3, type V3 } from './math.ts';
import { TERRITORY } from './sphere.ts';
import { MATCH, SLOTS } from './tables.ts';

export const TICK = MATCH.tick;

/** A timer one tick on. It lands on 0 exactly, so a 3 s timer runs 90 ticks, not 91 with the rounding. */
export const elapse = (t: number): number => (t - TICK > 1e-9 ? t - TICK : 0);

export const SHIPS = MATCH.ships;
/** The player sails ship 0 unless the setup gives it a captain. */
export const PLAYER = 0;

/** Random streams: each system draws from its own, so one change doesn't reshuffle the rest. */
export const STREAM = { world: 0, weather: 1, wind: 2, loot: 3, storm: 4, combat: 5, whale: 6, captains: 7 } as const;
export const STREAMS = STREAM.captains + SHIPS;

/** What is being sailed: a match (the Storm closes and the last ship afloat wins), or a free voyage on the same planet,
 *  with no Storm and no end, where a wreck refits and sails on (voyage.ts). */
export const MODE = { match: 0, voyage: 1 } as const;

/** Where a ship is in the match: riding the Gale, gliding down, at sea, or sunk. */
export const PHASE = { gale: 0, glide: 1, sea: 2, sunk: 3 } as const;

/** What sank a ship, or hurt it. Weapons use their item kind (1–6). */
export const CAUSE = { storm: 20, ram: 21, ink: 22, burn: 23, ash: 24, lightning: 25, mine: 26, wave: 27, whale: 28, rock: 29, flood: 30 } as const;

/** The gull's delivery run. */
export const GULL = { home: 0, flying: 1, rest: 2 } as const;

/** The whale's state. */
export const WHALE_STATE = { under: 0, surfaced: 1, rising: 2, breach: 3 } as const;

const XYZ = rec(['x', f64], ['y', f64], ['z', f64]);

const ITEM = rec(['kind', int], ['rarity', int], ['n', int]);

const EXPECT = rec(['value', f64], ['confidence', f64]);

const CAPTAIN = rec(
  ['on', bool],
  ['temperament', int],
  ['skill', f64],
  ['gentle', bool],
  ['grudge', int],
  ['aggro', f64],
  ['greed', f64],
  // what this captain has learnt of the player, carried in from the career and updated in the match
  ['dive', EXPECT],
  ['loop', EXPECT],
  ['raids', EXPECT],
  ['run', EXPECT],
  ['storm', EXPECT],
  ['watches', bool],
  ['eyed', bool],
  // the mind at work
  ['mode', int],
  ['think', int],
  ['since', f64],
  ['react', f64],
  ['foe', int],
  ['seen', f64],
  ['last', XYZ],
  ['goal', XYZ],
  ['want', XYZ],
  ['target', int],
  ['region', int],
  ['drop', XYZ],
  ['path', list(int)],
  ['leg', int],
  ['pathTo', XYZ],
  ['repath', f64],
  ['strafe', int],
  ['strafeT', f64],
  ['err', XYZ],
  ['errTo', XYZ],
  ['errT', f64],
  ['burst', f64],
  ['swapT', f64],
  ['stuckT', f64],
  ['backT', f64],
  ['claimT', f64],
  ['ring', list(XYZ)],
  ['li', int],
  // seconds it holds a turn off land ahead, signed by its side: negative to port
  ['avoid', f64],
  ['felt', f64],
  // radians off the straight course to its goal it sails, to ride a current or sail a better point of the wind
  ['lean', f64],
  // the board it beats to windward on when its course lies in the eye of the wind (+1, -1)
  ['beat', int],
  // its drop has come past in the Gale: it leaves at the first gap in the crowd
  ['bound', bool],
  // the last noise it heard and went by (hearing.ts): where, and when; a hunch is the director's (director.ts)
  ['heard', XYZ],
  ['heardT', f64],
  ['hunch', bool],
);

const DELIVERY = rec(['state', int], ['t', f64], ['tier', int], ['at', XYZ], ['alt', f64]);

const SHIP = rec(
  ['name', int],
  ['look', int],
  ['phase', int],
  ['pos', XYZ],
  ['head', XYZ],
  ['was', XYZ],
  ['alt', f64],
  ['vy', f64],
  ['speed', f64],
  ['drift', f64],
  ['rate', f64],
  ['turn', f64],
  ['shove', XYZ],
  ['vel', XYZ],
  ['hull', f64],
  ['shield', f64],
  ['slots', list(ITEM, SLOTS)],
  ['sel', int],
  ['cool', f64],
  ['reload', f64],
  ['equip', f64],
  // seconds left winding up a heavy gun before it fires (WINDUP)
  ['windup', f64],
  ['use', int],
  ['useT', f64],
  ['gusts', int],
  ['gustT', f64],
  ['boost', f64],
  ['aim', XYZ],
  ['aimY', f64],
  ['active', int],
  ['passive', int],
  ['cooldown', f64],
  ['power', f64],
  ['burn', f64],
  ['burnBy', int],
  ['slow', f64],
  ['spotted', f64],
  ['revealed', f64],
  ['ice', f64],
  ['ash', f64],
  ['flip', f64],
  ['scrape', f64],
  // going about (sailing.ts about): the board the wind is on (+1 over her starboard side, 0 not yet known), seconds
  // pinching in the no-go zone, seconds left in irons, the surge of a clean tack still in her canvas (m/s), and
  // seconds left of a thrown gybe's lurch
  ['board', int],
  ['nogo', f64],
  ['irons', f64],
  ['fill', f64],
  ['lurch', f64],
  // her parts (PARTS): canvas torn, the mainmast's damage, seconds until a jury mast stands in a fallen one's place
  // and whether one does, the rudder's damage, water in her and the side she lists to (+1 to starboard)
  ['torn', f64],
  ['mast', f64],
  ['fallen', f64],
  ['jury', bool],
  ['rudder', f64],
  ['flood', f64],
  ['listTo', f64],
  ['kills', int],
  ['dealt', f64],
  ['place', int],
  ['by', int],
  ['cause', int],
  ['lastBy', int],
  ['lastHit', int],
  ['landed', int],
  ['sunk', int],
  ['coins', f64],
  ['sailed', f64],
  ['regions', int],
  ['laid', list(int)],
  ['held', f64],
  ['perks', int],
  ['gull', DELIVERY],
  ['near', int],
  ['captain', CAPTAIN],
);

const LOOT = rec(['id', int], ['at', XYZ], ['v', XYZ], ['item', ITEM], ['age', f64], ['from', int], ['spot', int]);

const SHOT = rec(
  ['owner', int], ['kind', int], ['rarity', int], ['pos', XYZ], ['dir', XYZ], ['v', f64], ['y', f64], ['vy', f64], ['g', f64],
  ['damage', f64], ['crit', f64], ['splash', f64], ['range', f64], ['travelled', f64],
);

const WIND_GUST = rec(['at', XYZ], ['age', f64], ['life', f64], ['r', f64]);

const SYSTEM = rec(
  ['kind', int], ['at', XYZ], ['v', XYZ], ['r', f64], ['age', f64], ['life', f64], ['gap', f64],
  ['strike', f64], ['bolt', XYZ], ['target', int],
);

const STORM = rec(['region', int], ['centres', list(XYZ)], ['start', int], ['phase', int], ['shrinking', bool], ['scale', f64]);

const GALE = rec(['from', XYZ], ['dir', XYZ], ['at', XYZ], ['head', XYZ], ['t', f64], ['done', bool]);

const WHALE = rec(['at', XYZ], ['head', XYZ], ['route', list(XYZ)], ['leg', int], ['state', int], ['t', f64], ['breaches', int], ['spot', XYZ]);

/** A region's own event: one each, by region index (regionEvents.ts). */
export const EVENT_STATE = { waiting: 0, warning: 1, running: 2, over: 3 } as const;

const MARK = rec(['at', XYZ], ['t', f64]);

const REGION_EVENT = rec(
  ['state', int],
  // when it starts (match seconds), how long its warning is, how long it runs, and how far into the run it is
  ['at', f64], ['warn', f64], ['run', f64], ['t', f64],
  // which of the region's spots it happens at, and where its effect stands now
  ['k', int], ['spot', XYZ],
  // a counter and things in flight (the eruption's bombs: where each lands and seconds until it does)
  ['n', int], ['marks', list(MARK)],
);

const CLOUD = rec(['owner', int], ['at', XYZ], ['t', f64]);
const DECOY = rec(['owner', int], ['pos', XYZ], ['head', XYZ], ['t', f64]);
const MINE = rec(['owner', int], ['at', XYZ], ['t', f64]);

const SINKING = rec(['ship', int], ['by', int], ['cause', int], ['tick', int]);

/** Something the captains can hear or see from afar (hearing.ts): its kind (SOUND), where, when, how loud, whose. */
const NOISE = rec(['kind', int], ['at', XYZ], ['t', f64], ['loud', f64], ['by', int]);

/** The pacing director (director.ts): its phase (PACE), the player's heat, seconds into the phase, seconds of quiet,
 *  and how many hunches it has handed out. */
const DIRECTOR = rec(['phase', int], ['heat', f64], ['t', f64], ['quiet', f64], ['hunches', int]);

/** One thing that happened this tick. Which fields mean what is listed per kind in match.ts. */
const HAPPENING = rec(
  ['kind', int], ['ship', int], ['by', int], ['at', XYZ], ['y', f64], ['amount', f64], ['shield', f64], ['hull', f64],
  ['item', int], ['flag', int], ['cells', list(int)],
);

/** The voyage's own clocks (voyage.ts): seconds until loot is laid again, until the whale is called, and until a hidden
 *  cache taken is filled again, by cache. */
const VOYAGE = rec(['lootT', f64], ['whaleT', f64], ['caches', list(f64)]);

const MATCH_SCHEMA = rec(
  ['seed', int],
  ['tick', int],
  ['rule', int],
  ['mode', int],
  ['hour', f64],
  ['tilt', f64],
  ['rng', list(words(4), STREAMS)],
  ['ships', list(SHIP, SHIPS)],
  ['gale', GALE],
  ['storm', STORM],
  ['gusts', list(WIND_GUST)],
  ['weather', list(SYSTEM)],
  ['owner', bytes(TERRITORY.cells)],
  ['trail', bytes(TERRITORY.cells)],
  ['loot', list(LOOT)],
  ['nextId', int],
  ['shots', list(SHOT)],
  ['clouds', list(CLOUD)],
  ['decoys', list(DECOY)],
  ['mines', list(MINE)],
  ['whale', WHALE],
  ['regionEvents', list(REGION_EVENT, 16)],
  // seconds the Ice Crown's floes have ridden ahead of the clock, when its event drives them on
  ['floeT', f64],
  ['leader', int],
  ['rentT', f64],
  ['events', list(HAPPENING)],
  ['noise', list(NOISE)],
  ['director', DIRECTOR],
  ['sunk', list(SINKING)],
  ['winner', int],
  // the secrets the player has found (secrets.ts), carried in from the career and added to as they are found, and
  // how far along each feat is (a stay counted up, a circle sailed round, the poles reached)
  ['found', list(int)],
  ['quest', list(f64)],
  ['voyage', VOYAGE],
);

export type Ship = Value<typeof SHIP>;
export type Captain = Value<typeof CAPTAIN>;
export type Item = Value<typeof ITEM>;
export type Loot = Value<typeof LOOT>;
export type Shot = Value<typeof SHOT>;
export type WindGust = Value<typeof WIND_GUST>;
export type WeatherSystem = Value<typeof SYSTEM>;
export type Happening = Value<typeof HAPPENING>;
export type Sinking = Value<typeof SINKING>;
export type Noise = Value<typeof NOISE>;
export type Director = Value<typeof DIRECTOR>;
export type RegionEvent = Value<typeof REGION_EVENT>;
export type Expect = Value<typeof EXPECT>;
export type MatchState = Value<typeof MATCH_SCHEMA>;

export const MATCH_FORMAT: Format<typeof MATCH_SCHEMA> = { magic: 'PTLN', version: 6, schema: MATCH_SCHEMA };

/** Every gameplay moment the renderer, the interface and the sound need. Fields per kind are listed in match.ts. */
export const EVENT = {
  fire: 0,
  impact: 1,
  hit: 2,
  shieldBreak: 3,
  sink: 4,
  pickup: 5,
  drop: 6,
  gust: 7,
  useStart: 8,
  useDone: 9,
  useCancel: 10,
  reload: 11,
  empty: 12,
  select: 13,
  stormWait: 14,
  stormShrink: 15,
  galeDive: 16,
  landing: 17,
  deliveryCalled: 18,
  deliveryArrived: 19,
  whaleSurface: 20,
  whaleDive: 21,
  whaleRising: 22,
  whaleBreach: 23,
  flipped: 24,
  perkGained: 25,
  perkLost: 26,
  home: 27,
  claim: 28,
  cut: 29,
  swallow: 30,
  freed: 31,
  lead: 32,
  ability: 33,
  abilityEnd: 34,
  mineBurst: 35,
  lightningWarn: 36,
  lightning: 37,
  ablaze: 38,
  scrape: 39,
  ram: 40,
  coins: 41,
  win: 42,
  weatherForms: 43,
  weatherEnds: 44,
  blocked: 45,
  splash: 46,
  regionWarn: 47,
  regionStart: 48,
  regionEnd: 49,
  lavaBomb: 50,
  mastFall: 51,
  juryRig: 52,
  quench: 53,
  secret: 54,
  refit: 55,
  /** A ship going about: item 0 a clean tack, 1 a gybe, 2 a gybe thrown so the yards slam, 3 caught in irons. */
  about: 56,
  /** A heavy gun winding up: item weapon kind, amount seconds (0 when it was stood down), by the ship it is aimed at. */
  windup: 57,
} as const;

/** Each event kind's name, by number. */
export const EVENT_NAMES: readonly string[] = [
  'fire', 'impact', 'hit', 'shieldBreak', 'sink', 'pickup', 'drop', 'gust', 'useStart', 'useDone', 'useCancel', 'reload', 'empty', 'select', 'stormWait', 'stormShrink', 'galeDive', 'landing', 'deliveryCalled', 'deliveryArrived', 'whaleSurface', 'whaleDive', 'whaleRising', 'whaleBreach', 'flipped', 'perkGained', 'perkLost', 'home', 'claim', 'cut', 'swallow', 'freed', 'lead', 'ability', 'abilityEnd', 'mineBurst', 'lightningWarn', 'lightning', 'ablaze', 'scrape', 'ram', 'coins', 'win', 'weatherForms', 'weatherEnds', 'blocked', 'splash',
  'regionWarn', 'regionStart', 'regionEnd', 'lavaBomb', 'mastFall', 'juryRig', 'quench', 'secret', 'refit', 'about', 'windup',
];

/** Event flag bits. */
export const FLAG = { crit: 1, broke: 2, land: 4, ship: 8, steady: 16, done: 32, rake: 64, sail: 128, waterline: 256, rudder: 512 } as const;

const AT = v3();

export function emit(state: MatchState, kind: number, ship: number, by: number, at: V3 | null, f: Partial<Omit<Happening, 'kind' | 'ship' | 'by' | 'at'>> = {}): Happening {
  const p = at ?? AT;
  const e: Happening = {
    kind, ship, by, at: { x: p.x, y: p.y, z: p.z }, y: f.y ?? 0, amount: f.amount ?? 0, shield: f.shield ?? 0, hull: f.hull ?? 0,
    item: f.item ?? 0, flag: f.flag ?? 0, cells: f.cells ?? [],
  };
  state.events.push(e);
  return e;
}

export const afloat = (ship: Ship): boolean => ship.phase !== PHASE.sunk;
export const atSea = (ship: Ship): boolean => ship.phase === PHASE.sea;
export const timeOf = (state: MatchState): number => state.tick * TICK;
export const over = (state: MatchState): boolean => state.winner >= 0;

export const encodeMatch = (state: MatchState): Uint8Array => encode(MATCH_FORMAT, state);
export const decodeMatch = (data: Uint8Array): MatchState => decode(MATCH_FORMAT, data);
export const matchHash = (state: MatchState): string => hash64(encodeMatch(state));

export const copy = (out: V3, a: V3): V3 => {
  out.x = a.x;
  out.y = a.y;
  out.z = a.z;
  return out;
};
