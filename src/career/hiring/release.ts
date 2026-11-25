import type { Reason } from '../commands.ts';
import { ownerOf, personOf } from '../lookup.ts';
import type { CareerState } from '../state.ts';
import { updateTeam } from '../teams.ts';
import { vacate } from '../vacate.ts';
import { releaseCostOf } from './cost.ts';

export function releaseRefusal(
  state: CareerState,
  team: number,
  id: number
): Reason | null {
  if (ownerOf(state, id) !== null) return 'fixed';
  return personOf(state, id)?.contract?.team === team ? null : 'seat';
}

export function release(
  state: CareerState,
  team: number,
  id: number
): CareerState {
  const person = personOf(state, id);
  if (person === null) return state;
  const cost = releaseCostOf(person);
  const paid = updateTeam(state, team, (t) => ({
    ...t,
    balance: t.balance - cost,
  }));
  return {
    ...paid,
    teams: vacate(paid.teams, new Set([id])),
    people: state.people.map((p) =>
      p.id === id ? { ...p, contract: null } : p
    ),
  };
}
