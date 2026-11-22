// What a ship's race mechanic and her team's pit crew make of a pit stop: their
// stats folded into the two numbers of race.ts PitCrew (pace: so many times the
// spec time of every job; slip: the chance a job slips), the pit crew's fatigue
// in closed form, and the bond between a mechanic and her driver. The sim never
// sees a mechanic or a pit crew member, only these.

import type { PitCrew } from '../race.ts';
import { unit, type PersonOf } from './roles.ts';
import { TUNING } from './tuning.ts';

const lin = (pair: readonly [number, number], u: number): number =>
  pair[0] + pair[1] * u;
const M = TUNING.mechanic,
  P = TUNING.pit;

// ---- the race mechanic ------------------------------------------------------

/** Repairs: her ship's pit work × this. */
export const repairsFactor = (repairs: number): number =>
  lin(M.repairs, unit(repairs));
/** Mending: her ship's pit work × this. */
export const mendingFactor = (mending: number): number =>
  lin(M.mending, unit(mending));
/** Pit Handling: her ship's pit pace × this (less is quicker). */
export const handlingFactor = (handling: number): number =>
  lin(M.handling, unit(handling));
/** Concentration: her ship's chance of a slip × this. */
export const concentrationFactor = (concentration: number): number =>
  lin(M.concentration, unit(concentration));
/** Leadership: the pit crew's fatigue gained in a race × this. */
export const leadershipFatigue = (leadership: number): number =>
  lin(M.leadership, unit(leadership));
/** Leadership: the pit crew's morale moves by this a race. */
export const leadershipMorale = (leadership: number): number =>
  (unit(leadership) - 0.5) * M.leadershipMorale;
/** Reliability: improvement points given to reliability on her ship's parts × this. */
export const reliabilityImprovement = (reliability: number): number =>
  lin(M.reliability, unit(reliability));
/** Performance: improvement points given to performance on her ship's parts × this. */
export const perfImprovement = (perf: number): number =>
  lin(M.perf, unit(perf));
/** Chemistry: bond gained a race with her driver. */
export const bondGain = (chemistry: number): number =>
  lin(M.chemistry, unit(chemistry));

/** The bond level (0..3) a bond's points have reached. */
export const bondLevel = (bond: number): number =>
  TUNING.bond.levels.filter((at) => bond >= at).length;

// ---- the pit crew -----------------------------------------------------------

type PitStats = PersonOf<'pit'>['stats'];

/** A pit crew member at a race: their effective stats, their fatigue, and what a dilemma's answer asks of them. */
export interface Member {
  stats: PitStats;
  fatigue: number;
  /** Rested for this race: their work at TUNING.dilemmas.rest of it. */
  rested: boolean;
  /** Pushed on tired: their chance of a slip the greater. */
  pushed: boolean;
}

/** A member's work (1 at stats of 10, fresh): Speed, Strength and Teamwork by their weights, less as they tire. */
export const work = (stats: PitStats, fatigue: number): number =>
  (P.base +
    P.work.speed * unit(stats.speed) +
    P.work.strength * unit(stats.strength) +
    P.work.teamwork * unit(stats.teamwork)) *
  (1 - (P.tired * fatigue) / 100);

/** A member's chance of a slip: less with Precision and Nerve by their weights, more as they tire. */
export const slipOf = (stats: PitStats, fatigue: number): number =>
  P.slip *
    (1 -
      P.steady.precision * unit(stats.precision) -
      P.steady.nerve * unit(stats.nerve)) +
  (P.slipTired * fatigue) / 100;

/** Stamina: fatigue a pit crew member gains in a race they worked, before the mechanics' Leadership. */
export const fatigueGained = (stamina: number): number =>
  P.stamina * (P.staminaOver - unit(stamina));

/** Fatigue recovered a day, by the pit house's level. */
export const recovery = (houseLevel: number): number =>
  P.recovery * (1 + houseLevel);

/** A pit crew member's fatigue on a day, in closed form from what it was on their fatigue day. */
export const fatigueOn = (
  g: { fatigue: number; fatigueDay: number },
  day: number,
  houseLevel: number
): number =>
  Math.max(
    0,
    g.fatigue - recovery(houseLevel) * Math.max(0, day - g.fatigueDay)
  );

// ---- a ship's pit -----------------------------------------------------------

/**
 * What a ship's pit is made from: her mechanic's effective stats (null if she
 * has none), the team's pit crew (a place no one fills works as one of all 0),
 * and her bond's points.
 */
interface Pit {
  mechanic: PersonOf<'mechanic'>['stats'] | null;
  members: readonly Member[];
  bond: number;
}

const NOBODY: PitStats = {
  speed: 0,
  strength: 0,
  precision: 0,
  teamwork: 0,
  nerve: 0,
  stamina: 0,
};
const ABSENT: Member = {
  stats: NOBODY,
  fatigue: 0,
  rested: false,
  pushed: false,
};

/**
 * A ship's PitCrew. Pace: her mechanic's Pit Handling, over the crew's mean
 * work × her mechanic's Repairs and Mending, × her bond's level. Slip: the
 * pit crew's mean chance × her mechanic's Concentration. A pit crew of 10s with a
 * mechanic of 10s and no bond is the spec's pace of 1.
 */
export function pitCrew(p: Pit): PitCrew {
  const members = Array.from(
    { length: TUNING.world.pit },
    (_, i) => p.members[i] ?? ABSENT
  );
  const mean = (f: (m: Member) => number) =>
    members.reduce((a, m) => a + f(m), 0) / members.length;
  const m = p.mechanic;
  const worked =
    mean(
      (x) => work(x.stats, x.fatigue) * (x.rested ? TUNING.dilemmas.rest : 1)
    ) *
    ((repairsFactor(m?.repairs ?? 0) + mendingFactor(m?.mending ?? 0)) / 2);
  const bond = TUNING.bond.pace[bondLevel(p.bond)] ?? 1;
  const slip =
    mean(
      (x) => slipOf(x.stats, x.fatigue) + (x.pushed ? TUNING.dilemmas.push : 0)
    ) * concentrationFactor(m?.concentration ?? 0);
  return {
    pace: (handlingFactor(m?.handling ?? 0) / worked) * bond,
    slip: Math.min(1, Math.max(0, slip)),
  };
}
