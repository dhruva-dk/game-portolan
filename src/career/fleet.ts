// The draw: each match the career picks 19 of the league's captains whose ratings sit near yours, with a
// little luck so the same 19 don't sail every time, and with your rivals pulled closer so they turn up more
// often. The first match draws the gentlest captains, softened further, and bringing the starter pair.
import { STARTER_ACTIVE, STARTER_PASSIVE, type ActiveId, type PassiveId } from '../sim/abilities.ts';
import { hash32, rngFloat, rngFrom } from '../sim/math.ts';
import { CAPTAINS, LEAGUE_SIZE } from './captains.ts';
import { careerLevel, careerRank, wornLook, type CaptainRecord, type Career } from './career.ts';
import type { FleetEntry, MatchPlan } from './contract.ts';
import { GRUDGE, KNOWS_NOTHING, knowledgeOf } from './habits.ts';
import { RANKS, TIER, rankOf, stepOf, type Rank } from './ranks.ts';
import { fieldSkills, skill01 } from './rating.ts';

export const FLEET_SIZE = 19;

export const DRAW = {
  /** Rating points of luck either way in how near each captain counts. */
  jitter: 120,
  /** How much nearer a full rival counts, in rating points. */
  pull: 300,
  /** Matches of sinking or being sunk that make a full rival on their own. */
  record: 6,
} as const;

/** How much of a rival a captain is, 0 to 1: its grudge, and the sinkings between you. */
export const rivalry = (r: CaptainRecord): number => Math.min(1, r.grudge / GRUDGE.max + (r.sank + r.sunk) / DRAW.record);

/** Rivalry at which a captain is called a rival on the rivals page. */
export const RIVAL_AT = 0.3;

const DRAW_SALT = 0x64726177, SEED_SALT = 0x73656564;

/** The captain indices drawn for the career's next match, nearest first. */
export function drawCaptains(c: Career): number[] {
  const rng = rngFrom(hash32(hash32(c.seed, DRAW_SALT), c.matches));
  const score = c.captains.map((r) => Math.abs(r.rating - c.rating) + DRAW.jitter * (2 * rngFloat(rng) - 1) - DRAW.pull * rivalry(r));
  return c.captains.map((_, i) => i).sort((a, b) => score[a] - score[b] || a - b).slice(0, Math.min(FLEET_SIZE, LEAGUE_SIZE));
}

export const isFirstMatch = (c: Career): boolean => c.matches === 0;

/** The skills the drawn captains sail with (rating units), in draw order. */
export function captainSkills(c: Career, drawn: readonly number[]): number[] {
  return fieldSkills(c.rating, drawn.map((i) => c.captains[i].rating), isFirstMatch(c));
}

/** A captain's league standing as a rank name. */
export const leagueRank = (r: CaptainRecord): string => RANKS[stepOf(r.rating)].name;

/** The look a captain wears: its own, with the show-off wake of Admiral or Legend once it stands there. */
function captainLook(i: number, r: CaptainRecord): FleetEntry['look'] {
  const tier = RANKS[stepOf(r.rating)].tier, look = { ...CAPTAINS[i].look };
  if (tier === TIER.legend) look.wake = 'wakeOfLegends';
  else if (tier === TIER.admiral) look.wake = 'auroraWake';
  return look;
}

/** Everything the next match needs from the career. */
export function planMatch(c: Career): MatchPlan {
  const first = isFirstMatch(c), drawn = drawCaptains(c), skills = captainSkills(c, drawn);
  const fleet = drawn.map((i, k): FleetEntry => {
    const cap = CAPTAINS[i], r = c.captains[i];
    return {
      captain: cap.id,
      name: cap.name,
      temperament: cap.temperament,
      skill: skill01(skills[k]),
      rating: skills[k],
      rank: leagueRank(r),
      active: first ? STARTER_ACTIVE : cap.active,
      passive: first ? STARTER_PASSIVE : cap.passive,
      look: captainLook(i, r),
      gentle: first,
      grudge: first ? 0 : r.grudge,
      knows: first ? KNOWS_NOTHING : knowledgeOf(r.habits),
    };
  });
  return {
    seed: hash32(hash32(c.seed, SEED_SALT), c.matches),
    first,
    player: {
      active: c.active as ActiveId,
      passive: c.passive as PassiveId,
      look: wornLook(c),
      level: careerLevel(c),
      rank: careerRank(c).step.name,
    },
    fleet,
  };
}

/** The rank a captain's league rating earns (captains have no floor). */
export const captainRank = (r: CaptainRecord): Rank => rankOf(r.rating, 0);
