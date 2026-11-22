// What a ship's mechanic and pit make possible in a race (Phase B section 2.1): their stats folded into the plain
// numbers of race.ts Service, the pit crew's fatigue in closed form, and the bond between a mechanic and her driver.
// The sim never sees a mechanic or a pit crew member, only this.

import type { Job, Service } from '../race.ts';
import { unit, type PersonOf } from './roles.ts';
import { TUNING } from './tuning.ts';

const lin = (pair: readonly [number, number], u: number): number =>
  pair[0] + pair[1] * u;
const B = TUNING.mechanic,
  F = TUNING.pit;

export const JOBS: readonly Job[] = ['mend', 'gust', 'stores', 'part'];

// ---- the mechanic -------------------------------------------------------------------------------------------------

/** Repairs: the part job's rate × this. */
export const repairsFactor = (repairs: number): number =>
  lin(B.repairs, unit(repairs));
/** Mending: the mend job's rate × this. */
export const mendingFactor = (mending: number): number =>
  lin(B.mending, unit(mending));
/** Pit Handling: seconds from a call to work. */
export const arriveSeconds = (handling: number): number =>
  B.arrive * lin(B.handling, unit(handling));
/** Concentration: every job's botch chance × this. */
export const concentrationFactor = (concentration: number): number =>
  lin(B.concentration, unit(concentration));
/** Leadership: the pit crew's fatigue gained in a race × this. */
export const leadershipFatigue = (leadership: number): number =>
  lin(B.leadership, unit(leadership));
/** Leadership: the pit crew's morale moves by this a race. */
export const leadershipMorale = (leadership: number): number =>
  (unit(leadership) - 0.5) * B.leadershipMorale;
/** Reliability: improvement points given to reliability on her ship's parts × this. */
export const reliabilityImprovement = (reliability: number): number =>
  lin(B.reliability, unit(reliability));
/** Performance: improvement points given to performance on her ship's parts × this. */
export const perfImprovement = (perf: number): number =>
  lin(B.perf, unit(perf));
/** Chemistry: bond gained a race with her driver. */
export const bondGain = (chemistry: number): number =>
  lin(B.chemistry, unit(chemistry));

/** The bond level (0..3) a bond's points have reached. */
export const bondLevel = (bond: number): number =>
  TUNING.bond.levels.filter((at) => bond >= at).length;

// ---- the pit crew ------------------------------------------------------------------------------------------------

type PitStats = PersonOf<'pit'>['stats'];

/** A pit crew member's rating r at a job, by the job's weights of their stats (each as u). */
export function rating(stats: PitStats, job: Job): number {
  const weights: Readonly<Record<string, number>> = F.weights[job];
  const s: Readonly<Record<string, number>> = stats;
  return Object.entries(weights).reduce((r, [k, w]) => r + w * unit(s[k]), 0);
}

/** A job's rate before the mechanic's factor: (0.5 + r) × (1 − 0.3 × fatigue / 100). */
export const jobRate = (r: number, fatigue: number): number =>
  (F.base + r) * (1 - (F.tired * fatigue) / 100);

/** A job's botch chance before the mechanic's factor, by the person's Precision and fatigue. */
export const jobBotch = (precision: number, fatigue: number): number =>
  F.botch * (1 - unit(precision)) + (F.botchTired * fatigue) / 100;

/** Nerve: how much being under fire multiplies botch, from the four's mean Nerve. */
export function underFire(nerves: readonly number[]): number {
  const mean =
    nerves.length === 0
      ? 0
      : nerves.reduce((a, n) => a + unit(n), 0) / nerves.length;
  return 1 + (1 - mean);
}

/** Stamina: fatigue a pit crew member gains in a race they worked, before the mechanic's Leadership. */
export const fatigueGained = (stamina: number): number =>
  F.stamina * (F.staminaOver - unit(stamina));

/** Fatigue recovered a day, by the pit crew loft's level. */
export const recovery = (loftLevel: number): number =>
  F.recovery * (1 + loftLevel);

/** A pit crew member's fatigue on a day, in closed form from what it was on their fatigue day. */
export const fatigueOn = (
  g: { fatigue: number; fatigueDay: number },
  day: number,
  loftLevel: number
): number =>
  Math.max(
    0,
    g.fatigue - recovery(loftLevel) * Math.max(0, day - g.fatigueDay)
  );

// ---- the service -----------------------------------------------------------------------------------------------

/** What a ship's service is made from: her mechanic's effective stats (null if she has none), the pit crew's effective
 *  stats and fatigue by the job each works (a job no one works rates as a person of all 0), the job order and the bond. */
export interface Teaming {
  mechanic: PersonOf<'mechanic'>['stats'] | null;
  pit: readonly { job: Job; stats: PitStats; fatigue: number }[];
  order: readonly Job[];
  bond: number;
}

const NOBODY = {
  speed: 0,
  strength: 0,
  precision: 0,
  teamwork: 0,
  nerve: 0,
  stamina: 0,
} as const;

/** A ship's Service from her mechanic, her pit and the bond. */
export function service(c: Teaming): Service {
  const b = c.mechanic;
  const at = (job: Job) =>
    c.pit.find((f) => f.job === job) ?? { job, stats: NOBODY, fatigue: 0 };
  const level = bondLevel(c.bond);
  const concentration = concentrationFactor(b?.concentration ?? 0);
  const rate = {} as Record<Job, number>,
    botch = {} as Record<Job, number>;
  for (const job of JOBS) {
    const f = at(job);
    const factor =
      job === 'part'
        ? repairsFactor(b?.repairs ?? 0)
        : job === 'mend'
          ? mendingFactor(b?.mending ?? 0)
          : 1;
    rate[job] = jobRate(rating(f.stats, job), f.fatigue) * factor;
    botch[job] = Math.min(
      1,
      jobBotch(f.stats.precision, f.fatigue) * concentration
    );
  }
  return {
    arrive: Math.max(
      0,
      arriveSeconds(b?.handling ?? 0) - (level >= 1 ? TUNING.bond.sooner : 0)
    ),
    order: c.order,
    rate,
    botch,
    underFire: underFire(JOBS.map((j) => at(j).stats.nerve)),
    freeRepair: level >= 2,
    gustRecharge: level >= 3 ? TUNING.bond.gustRecharge : 1,
  };
}
