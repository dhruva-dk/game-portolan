// The hidden skill rating. It is in the same units as a bot's skill: a bot of skill s should sail like a
// player rated s. One match's showing is the rating plus noise of spread SKILL.sigma.
//
// After each match the rating moves by K times (ships you beat, minus the ships you were expected to beat,
// plus half a ship for each kill beyond what your placement usually brings). K starts high and halves every
// few matches, so a new player's rating finds their level within about 10 matches, then settles.
//
// The bots are drawn SKILL.edge below your rating. That is the tuning: it puts you in the top 5 about half
// the time and gives you a win about 1 match in 6 (tests/career/rating.test.ts plays it with a synthetic player).
import { dexp } from '../sim/math.ts';

export const SKILL = {
  /** Spread of one match's showing about a ship's skill. */
  sigma: 200,
  /** How far below your rating the field is drawn. */
  edge: 135,
  /** How much a captain's league rating moves its skill from the field's centre, and the most it may. */
  lean: 0.15,
  spread: 120,
  /** The first match's captains are this much gentler again. */
  gentle: 300,
  /** K: rating points per ship beaten beyond expectation, from kHigh for a new player down to kLow. */
  kHigh: 60,
  kLow: 8,
  /** Matches over which K's excess halves. */
  kHalf: 5,
  /** A kill beyond expectation counts as this many ships beaten. */
  kill: 0.5,
  /** The share of sunk ships sunk by another ship rather than the Storm, for expected kills. */
  fell: 0.6,
  /** Ratings stay in this range. A new player starts at 0, the bottom of Iron I. */
  min: -400,
  max: 2600,
} as const;

const LN2 = 0.6931471805599453;
const SQRT2 = 1.4142135623730951;

/** The chance a ship of skill a out-places one of skill b in a match (a logistic fit to the normal curve). */
export const beatChance = (a: number, b: number): number => 1 / (1 + dexp((-1.702 * (a - b)) / (SKILL.sigma * SQRT2)));

/** Kills a ship usually has for its placement, if each sunk ship was sunk by any one of the ships still afloat. */
export function expectedKills(place: number, ships: number): number {
  let k = 0;
  for (let q = place + 1; q <= ships; q++) k += 1 / (q - 1);
  return SKILL.fell * k;
}

export const kFactor = (matches: number): number => SKILL.kLow + (SKILL.kHigh - SKILL.kLow) * dexp((-matches * LN2) / SKILL.kHalf);

export const clampRating = (r: number): number => Math.max(SKILL.min, Math.min(SKILL.max, r));

/**
 * The rating after a match. `field` holds the skills the other ships were given; `matches` is how many
 * matches came before this one.
 */
export function rateMatch(rating: number, matches: number, field: readonly number[], place: number, kills: number): number {
  const ships = field.length + 1, beaten = ships - place;
  let expected = 0;
  for (const s of field) expected += beatChance(rating, s);
  const surprise = beaten - expected + SKILL.kill * (kills - expectedKills(place, ships));
  return Math.round(clampRating(rating + kFactor(matches) * surprise));
}

/**
 * The skills handed to the drawn captains: centred SKILL.edge below the player's rating, each nudged by how
 * its league rating stands against the others drawn, so stronger captains are stronger on the water.
 */
export function fieldSkills(rating: number, captainRatings: readonly number[], gentle: boolean): number[] {
  let mean = 0;
  for (const r of captainRatings) mean += r / captainRatings.length;
  const centre = rating - SKILL.edge - (gentle ? SKILL.gentle : 0);
  return captainRatings.map((r) => Math.round(centre + Math.max(-SKILL.spread, Math.min(SKILL.spread, (r - mean) * SKILL.lean))));
}

/** A skill as 0 (the gentlest bot) to 1 (the strongest Legend), for the simulation's bots. */
export const skill01 = (s: number): number => Math.max(0, Math.min(1, (s - SKILL.min) / (SKILL.max - SKILL.min)));
