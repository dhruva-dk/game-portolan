import { apply, newCareer, type CareerOptions } from '../career/apply.ts';
import type { Command } from '../career/commands.ts';
import { planetSeed } from '../career/fit.ts';
import { YOURS, type CareerState } from '../career/state.ts';
import type { MatchResult } from '../sim/result.ts';

export const FIRST_PLANET = 'portolan';

export type Launch =
  | { kind: 'new'; planet: string }
  | { kind: 'race' | 'flow' | 'lobby'; planet: string; state: CareerState };

export function launchOf(state: CareerState | null): Launch {
  if (state === null) return { kind: 'new', planet: FIRST_PLANET };
  const planet = planetSeed(state);
  if (state.phase === 'racing') return { kind: 'race', planet, state };
  if (state.unread && state.lastRace !== null)
    return { kind: 'flow', planet, state };
  return { kind: 'lobby', planet, state };
}

export const recordOf = (result: MatchResult): Command => ({
  type: 'RecordRace',
  team: YOURS,
  result,
});

export type Founded = { state: CareerState; options: CareerOptions };

export function begun(options: CareerOptions): Founded {
  const created = newCareer(options),
    raced = apply(created, { type: 'StartRace', team: YOURS });
  if (!raced.ok) throw new Error(`StartRace refused (${raced.reason})`);
  return { state: raced.state, options };
}
