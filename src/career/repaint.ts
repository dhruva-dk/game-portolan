import type { Livery } from '../world/livery.ts';
import type { Reason } from './commands.ts';
import { sameLivery } from './start.ts';
import type { CareerState } from './state.ts';
import { updateTeam } from './teams.ts';
import { REPAINT } from './tuning.ts';

export function repaintRefusal(
  state: CareerState,
  team: number,
  livery: Livery,
  emblem: number
): Reason | null {
  const worn = state.teams.some(
    (other, index) => index !== team && sameLivery(other.livery, livery)
  );
  if (worn) return 'taken';
  const current = state.teams[team];
  if (sameLivery(current.livery, livery) && current.emblem === emblem)
    return 'same';
  return current.balance < REPAINT.cost ? 'funds' : null;
}

export const repaint = (
  state: CareerState,
  team: number,
  livery: Livery,
  emblem: number
): CareerState =>
  updateTeam(state, team, (t) => ({
    ...t,
    livery: { dye: livery.dye, pattern: livery.pattern },
    emblem,
    balance: t.balance - REPAINT.cost,
  }));
