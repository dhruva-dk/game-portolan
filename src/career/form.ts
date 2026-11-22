// Form: one seeded draw per race shifts a driver's stats by up to
// ± TUNING.form × (1 − u Consistency) for that race.

import type { DriverStats } from '../race.ts';
import type { Rand } from './dice.ts';
import { mapped, stat, unit } from './roles.ts';
import { TUNING } from './tuning.ts';

/** The most a driver's form can move her stats, by her Consistency. */
export const formReach = (consistency: number): number =>
  TUNING.form * (1 - unit(consistency));

/** A race's form: the points her stats shift, on one draw. */
export const formShift = (consistency: number, rand: Rand): number =>
  (rand() * 2 - 1) * formReach(consistency);

/** A driver's stats shifted by points, each kept to 0..20. */
export const shifted = (stats: DriverStats, by: number): DriverStats =>
  mapped(stats, (v) => stat(v + by));
