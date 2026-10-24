// The career's state (PROMPT.md, The career; progress.html A4): plain saved data, integers only, declared once for
// the WP1 codec, so a career has one binary encoding, a strict decoding and a 64-bit hash; and the rules of rank
// every ship in the league answers to. Settings (sound, music, haptics, reduced motion) are kept apart, out of the
// hash. Part B adds the player's profile, the captains' learning and memory, the career chart and the cards' recent
// results to this schema, bumping CAREER_FORMAT's version.
import { decode, encode, hash64, int, list, rec, type Format, type Value } from '../sim/codec.ts';
import { hash32, rngFrom, rngInt } from '../sim/math.ts';
import { FORM } from '../sim/tables.ts';

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

const CAREER = rec(
  ['seed', int], // uint32: the league's own randomness between the player's matches
  ['match', int], // matches sailed
  ['player', PLAYER],
  ['captains', list(CAPTAIN, LEAGUE)], // by league index
);

export const CAREER_FORMAT: Format<typeof CAREER> = { magic: 'PTLC', version: 1, schema: CAREER };
export type Career = Value<typeof CAREER>;
export type GullLevels = Career['player']['gull'];

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
