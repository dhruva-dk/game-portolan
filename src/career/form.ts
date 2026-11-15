// Form (Phase B section 2.3): one seeded draw per race shifts a captain's stats by up to ±3 × (1 − u Consistency) for
// that race. The draw is the crew's 'form:<crew>' stream's.

import type { CaptainStats, Stat } from '../race.ts';
import type { Rand } from './dice.ts';
import { stat, unit } from './roles.ts';
import { TUNING } from './tuning.ts';

/** The most a captain's form can move her stats, by her Consistency. */
export const formReach = (consistency: number): number => TUNING.form * (1 - unit(consistency));

/** A race's form: the points her stats shift, on one draw. */
export const formShift = (consistency: number, rand: Rand): number => (rand() * 2 - 1) * formReach(consistency);

/** A captain's stats shifted by points, each kept to 0..20. */
export function shifted(stats: CaptainStats, by: number): CaptainStats {
  const out = {} as Record<Stat, number>;
  for (const k of Object.keys(stats) as Stat[]) out[k] = stat(stats[k] + by);
  return out;
}
