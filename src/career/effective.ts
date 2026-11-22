// A gull's effective stats: their role stats shifted by morale (±1) and by their traits in a setting (Phase B
// section 2.3). Form is added on top for a captain's race (career/form.ts). Every reader of a stat in a race or a
// decision reads these, never the raw stats.

import type { CaptainStats } from '../race.ts';
import { moraleShift } from './morale.ts';
import { stat, type Gull, type GullOf } from './roles.ts';
import { modifier, type Setting } from './traits.ts';
import { TUNING } from './tuning.ts';
import type { Role } from '../office.ts';

/** A gull's stats with morale and their traits (those that hold in the setting; null: those that always hold). */
export function effective<R extends Role>(
  g: GullOf<R>,
  setting: Setting | null
): GullOf<R>['stats'] {
  const mod = modifier(g.traits, setting);
  const shift = moraleShift(g.morale) + mod.all;
  const raw: Readonly<Record<string, number>> = g.stats;
  const out: Record<string, number> = {};
  for (const k of Object.keys(raw))
    out[k] = stat(raw[k] + shift + (mod.stats[k] ?? 0));
  return out as GullOf<R>['stats'];
}

/** A captain's effective stats, in the seam's type. */
export const captainStats = (
  g: GullOf<'captain'>,
  setting: Setting | null
): CaptainStats => effective(g, setting);

/** A gull's marketability with their traits', kept to 0..100. */
export const marketability = (g: Gull): number =>
  Math.min(
    100,
    Math.max(0, g.marketability + modifier(g.traits, null).marketability)
  );

/** The Coin a Pay Captain brings her crew a race. */
export const payCoin = (g: Gull): number =>
  Math.round(modifier(g.traits, null).coin * marketability(g));

/** How much a gull's traits move their ask. */
export const wageTrait = (g: Gull): number => 1 + modifier(g.traits, null).wage;

/** Whether a Mentor on a crew lifts its young captains' growth. */
export const mentors = (gulls: readonly Gull[]): boolean =>
  gulls.some(
    (g) => g.role === 'captain' && modifier(g.traits, null).growth > 0
  );

export const MENTOR_AGE = TUNING.growth.mentorAge;
