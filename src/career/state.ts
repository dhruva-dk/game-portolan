// The career's state (PROMPT.md, The career; progress.html A4): plain saved data, integers only, declared once for
// the WP1 codec, so a career has one binary encoding, a strict decoding and a 64-bit hash; and the rules of rank
// every ship in the league answers to. Settings (sound, music, haptics, reduced motion) are kept apart, out of the
// hash. Part B added the player's profile, the captains' learning and memory and the career chart (learn.ts,
// voyage.ts): CAREER_FORMAT's second version.
import { bytes, decode, encode, hash64, int, list, rec, type Format, type Value } from '../sim/codec.ts';
import { hash32, rngFrom, rngInt } from '../sim/math.ts';
import { FITTING_SLOT, FORM } from '../sim/tables.ts';
import { REGIONS } from '../sim/world/regions.ts';

/** The thirty named captains of the league besides the player (league.ts CAPTAINS, by league index). */
export const LEAGUE = 30;

/**
 * Rank (PROMPT.md, Rank): the eight winds of the portolan rose clockwise from the north-east to the north, `tier`
 * points each; every ship's points stay within 0 … `top`, the head of Tramontana. A FORM unlocks at its tier in
 * `forms`: the pinnace from the start, the caravel at Levante, the carrack at Ostro, the galleon at Ponente. After a
 * match each of its n ships moves by three terms, each rounded half away from zero:
 *   place     place × (n + 1 − 2p) / (n − 1)          the winner +place, the first to sink −place; every ship outlasted is worth the same
 *   sea       sea × (n·claimed − Σ) / Σ, in −sea … 2·sea   sea claimed against the match's mean: twice the mean +sea, none −sea
 *   sinkings  +sink for each ship it sank, −sink if a ship sank it   points pass from the sunk to the sinker
 * Each term sums to nothing over a match (but for the sea's clamp), so the league neither swells nor drains: a ship
 * climbs only past others.
 */
export const RANK = {
  winds: ['Greco', 'Levante', 'Scirocco', 'Ostro', 'Libeccio', 'Ponente', 'Maestro', 'Tramontana'],
  tier: 100,
  top: 799,
  forms: [1, 2, 4, 6],
  place: 20,
  sea: 8,
  sink: 5,
} as const;

/** A trained gull: each trait's level, 0 untrained … GULL.levels (tables.ts). */
const GULL_LEVELS = rec(['talons', int], ['wings', int], ['eye', int], ['beak', int], ['dive', int]);

const PLAYER = rec(
  ['points', int], // rank points
  ['tier', int], // the highest tier reached, 1 Greco … 8 Tramontana: never lost
  ['treasure', int], // doubloons brought home and not yet spent on the gull
  ['form', int], // the FORM it sails next: one its tier has unlocked
  ['gull', GULL_LEVELS],
);

/** A captain: its rank points. Its tier follows from them and may fall as well as rise; its form, kit and gull follow from its tier and temperament (league.ts). */
const CAPTAIN = rec(['points', int]);

/**
 * What the career learns of the player (PROMPT.md, Captains learn the player). Every habit is a set of weights,
 * permille, over its bins (BINS): the region it breaks off into, the size of its loops, its raiding, the hull it runs
 * at, its way with the storm, the fittings it carries. A match the player was watched in (voyage.ts) moves each weight
 * `learn` percent of the way toward `full` where the match showed that bin and toward 0 where it showed another; a
 * match that shows nothing of a habit, or for a captain one it did not share with the player, lets each weight `fade`
 * percent toward 0. A captain acts on a habit once its weight reaches `known`: a steady habit is known after two
 * matches together (400, 640, 784, 870, 922), and once the player drops it, forgotten after two more together (554,
 * 333) or four apart (784, 667, 567, 482). The career's own profile learns at the same rates from every match.
 */
export const LEARNING = { learn: 40, fade: 15, known: 500, full: 1000 } as const;

/**
 * The habits' bins, by their lower edges: the loops' radius, u (small, middling, large, huge); rivals' trails broken in
 * a match (none, now and then, often); the hull it runs at, percent (nearly sunk, half wrecked, at the first hit, and a
 * last bin: it stood and fought); its margin inside the calm while the storm closes, u (in the storm, at the edge, clear).
 */
export const BINS = { loop: [10, 20, 35], raid: [1, 3], run: [30, 60], storm: [0, 20] } as const;

/** A captain's grudge: one more each time the player sinks it, to `max`; spent by a match together in which it does not. */
export const GRUDGE = { max: 3 } as const;

/**
 * The career chart (PROMPT.md, The career chart): a cube grid `n` cells along a face's edge (about 5 u a cell), a bit
 * each for what the player has seen. Unseen parchment shows the coastlines barely sketched, at `sketch` percent ink.
 */
export const CHART = { n: 64, sketch: 15 } as const;
export const CHART_CELLS = 6 * CHART.n * CHART.n;
/** The world's wrecks and caches (Geography.finds), in the geography's order. */
export const FIND_SITES = REGIONS.reduce((n, r) => n + r.finds.length, 0);
/** FITTING kinds, none among them. */
export const FITTINGS = FITTING_SLOT.length;

/**
 * The player's habits as learned (LEARNING): weights by bin, and the measures a brain steers by (Mind): its loops'
 * radius u, trails broken a match in tenths, the hull it runs at percent, the margin it keeps from the storm u.
 */
const HABITS = rec(
  ['breakOff', list(int, REGIONS.length)],
  ['loop', list(int, BINS.loop.length + 1)],
  ['raid', list(int, BINS.raid.length + 1)],
  ['run', list(int, BINS.run.length + 2)],
  ['storm', list(int, BINS.storm.length + 1)],
  ['fittings', list(int, FITTINGS)],
  ['loopU', int],
  ['raids', int],
  ['runAt', int],
  ['stormU', int],
);

/** A captain's memory of the player: what it has learned, their matches together, the times it sank the player and was sunk by it, its grudge. */
const MIND = rec(['habits', HABITS], ['shared', int], ['sank', int], ['sunk', int], ['grudge', int]);

/** The career chart: cells seen (CHART; cell c at byte c >> 3, bit c & 7), find sites discovered (1 each), and by region the match (−1 never) and tick its name was first lettered. */
const CHART_STATE = rec(['seen', bytes(CHART_CELLS >> 3)], ['found', bytes(FIND_SITES)], ['named', list(rec(['match', int], ['tick', int]), REGIONS.length)]);

const CAREER = rec(
  ['seed', int], // uint32: the league's own randomness between the player's matches
  ['match', int], // matches sailed
  ['player', PLAYER],
  ['captains', list(CAPTAIN, LEAGUE)], // by league index
  ['profile', HABITS], // the player's habits, learned from every match
  ['minds', list(MIND, LEAGUE)], // each captain's memory of the player, by league index
  ['chart', CHART_STATE],
);

export const CAREER_FORMAT: Format<typeof CAREER> = { magic: 'PTLC', version: 2, schema: CAREER };
export type Career = Value<typeof CAREER>;
export type GullLevels = Career['player']['gull'];
export type Learned = Career['profile'];

const zeros = (n: number): number[] => new Array<number>(n).fill(0);
/** Nothing learned. */
export const newHabits = (): Learned => ({
  breakOff: zeros(REGIONS.length), loop: zeros(BINS.loop.length + 1), raid: zeros(BINS.raid.length + 1), run: zeros(BINS.run.length + 2),
  storm: zeros(BINS.storm.length + 1), fittings: zeros(FITTINGS), loopU: 0, raids: 0, runAt: 0, stormU: 0,
});

export const encodeCareer = (c: Career): Uint8Array => encode(CAREER_FORMAT, c);
/** Throws on anything but a whole career of this version: a save is never half-loaded. */
export const decodeCareer = (bytes: Uint8Array): Career => decode(CAREER_FORMAT, bytes);
export const careerHash = (c: Career): string => hash64(encodeCareer(c));
/** A copy to change, leaving `c` as it was. */
export const copyCareer = (c: Career): Career => decodeCareer(encodeCareer(c));

/** How a new career spreads the captains over the rose: shuffled, `step` points apart from `from`, each up to `jitter` more. */
const SPREAD = { from: 10, step: 26, jitter: 16 };
const NEW = 0x6e657721; // the new career's stream

/** A new career on `seed` (uint32): the player a Greco pinnace with an untrained gull, the captains spread over the rose. */
export function newCareer(seed: number): Career {
  const rng = rngFrom(hash32(seed >>> 0, NEW)), order = Array.from({ length: LEAGUE }, (_, i) => i);
  for (let i = LEAGUE - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const captains = order.map(() => ({ points: 0 }));
  order.forEach((id, k) => {
    captains[id].points = SPREAD.from + k * SPREAD.step + rngInt(rng, SPREAD.jitter);
  });
  return {
    seed: seed >>> 0,
    match: 0,
    player: { points: 0, tier: 1, treasure: 0, form: FORM.pinnace, gull: { talons: 0, wings: 0, eye: 0, beak: 0, dive: 0 } },
    captains,
    profile: newHabits(),
    minds: Array.from({ length: LEAGUE }, () => ({ habits: newHabits(), shared: 0, sank: 0, sunk: 0, grudge: 0 })),
    chart: { seen: new Uint8Array(CHART_CELLS >> 3), found: new Uint8Array(FIND_SITES), named: REGIONS.map(() => ({ match: -1, tick: -1 })) },
  };
}

/** The tier rank points stand in, 1 Greco … 8 Tramontana. */
export const tierOf = (points: number): number => Math.min(RANK.winds.length, Math.floor(points / RANK.tier) + 1);

/** The forms a ship of `tier` may sail, the pinnace first: always a prefix of FORM's order. */
export const unlockedForms = (tier: number): number[] => RANK.forms.flatMap((at, form) => (at <= tier ? [form] : []));

export const clampPoints = (points: number): number => Math.max(0, Math.min(RANK.top, points));

/** Half away from zero, so opposite shares round to opposite points (and never to −0). */
const round = (x: number): number => (x < 0 ? -Math.floor(0.5 - x) : Math.floor(x + 0.5)) + 0;

/** A ship's match as rank counts it: end.ts Finish, or a captains' match the league makes up (league.ts). */
export interface Outcome {
  /** 1 the winner … n the first to sink. */
  readonly place: number;
  /** Sea claimed, in any unit shared by the match. */
  readonly claimed: number;
  /** Ships it sank, and the ship that sank it (−1 none: it won, or the storm or the rocks took it). */
  readonly sank: number;
  readonly by: number;
}

/** Each ship's rank points from its match (RANK). */
export function rankDeltas(ships: readonly Outcome[]): number[] {
  const n = ships.length;
  let total = 0;
  for (const s of ships) total += s.claimed;
  return ships.map((s) => {
    const sea = total > 0 ? Math.max(-RANK.sea, Math.min(2 * RANK.sea, round((RANK.sea * (n * s.claimed - total)) / total))) : 0;
    return round((RANK.place * (n + 1 - 2 * s.place)) / (n - 1)) + sea + RANK.sink * (s.sank - (s.by >= 0 ? 1 : 0));
  });
}
