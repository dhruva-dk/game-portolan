import type { Reason } from '../commands.ts';
import { ownerOf, personOf } from '../lookup.ts';
import type { CareerState } from '../state.ts';
import { updateTeam } from '../teams.ts';
import { SCOUTING } from '../tuning.ts';

export function approachRefusal(
  state: CareerState,
  team: number,
  id: number
): Reason | null {
  if (ownerOf(state, id) !== null) return 'fixed';
  const person = personOf(state, id);
  if (person === null) return 'unknown';
  if (person.contract?.team === team) return 'fixed';
  const { approached, balance } = state.teams[team];
  if (approached[person.role] === id) return 'same';
  return balance < SCOUTING.approach ? 'funds' : null;
}

export function approach(
  state: CareerState,
  team: number,
  id: number
): CareerState {
  const person = personOf(state, id);
  if (person === null) return state;
  return updateTeam(state, team, (t) => ({
    ...t,
    balance: t.balance - SCOUTING.approach,
    approached: { ...t.approached, [person.role]: id },
  }));
}
