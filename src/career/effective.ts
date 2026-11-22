// A person's effective stats: their role stats shifted by morale (±1) and by their traits in a setting (Phase B
// section 2.3). Form is added on top for a driver's race (career/form.ts). Every reader of a stat in a race or a
// decision reads these, never the raw stats.

import type { DriverStats } from '../race.ts';
import { moraleShift } from './morale.ts';
import { stat, type Person, type PersonOf } from './roles.ts';
import { modifier, type Setting } from './traits.ts';
import { TUNING } from './tuning.ts';
import type { Role } from '../office.ts';

/** A person's stats with morale and their traits (those that hold in the setting; null: those that always hold). */
export function effective<R extends Role>(
  g: PersonOf<R>,
  setting: Setting | null
): PersonOf<R>['stats'] {
  const mod = modifier(g.traits, setting);
  const shift = moraleShift(g.morale) + mod.all;
  const raw: Readonly<Record<string, number>> = g.stats;
  const out: Record<string, number> = {};
  for (const k of Object.keys(raw))
    out[k] = stat(raw[k] + shift + (mod.stats[k] ?? 0));
  return out as PersonOf<R>['stats'];
}

/** A driver's effective stats, in the seam's type. */
export const driverStats = (
  g: PersonOf<'driver'>,
  setting: Setting | null
): DriverStats => effective(g, setting);

/** A person's marketability with their traits', kept to 0..100. */
export const marketability = (g: Person): number =>
  Math.min(
    100,
    Math.max(0, g.marketability + modifier(g.traits, null).marketability)
  );

/** The Coin a Pay Driver brings her team a race. */
export const payIncome = (g: Person): number =>
  Math.round(modifier(g.traits, null).balance * marketability(g));

/** How much a person's traits move their ask. */
export const wageTrait = (g: Person): number =>
  1 + modifier(g.traits, null).wage;

/** Whether a Mentor on a team lifts its young drivers' growth. */
export const mentors = (people: readonly Person[]): boolean =>
  people.some(
    (g) => g.role === 'driver' && modifier(g.traits, null).growth > 0
  );

export const MENTOR_AGE = TUNING.growth.mentorAge;
