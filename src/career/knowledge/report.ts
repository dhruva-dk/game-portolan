import type { Reason } from '../commands.ts';
import { personOf } from '../lookup.ts';
import { reportCost } from '../rules/knowledge.ts';
import { YOURS, type CareerState } from '../state.ts';
import { updateTeam } from '../change.ts';
import { knownStars } from './people.ts';

export const reportPrice = (state: CareerState, id: number): number =>
  reportCost(knownStars(state, id)?.hi ?? 0);

export function reportRefusal(
  state: CareerState,
  team: number,
  id: number
): Reason | null {
  if (team !== YOURS) return 'same';
  if (state.knowledge.reports.includes(id)) return 'same';
  if (personOf(state, id)?.contract?.team === team) return 'same';
  return state.teams[team].balance < reportPrice(state, id) ? 'funds' : null;
}

export function buyReport(
  state: CareerState,
  team: number,
  id: number
): CareerState {
  const price = reportPrice(state, id);
  const paid = updateTeam(state, team, (t) => ({
    ...t,
    balance: t.balance - price,
  }));
  return {
    ...paid,
    knowledge: { ...paid.knowledge, reports: [...paid.knowledge.reports, id] },
  };
}

export const discardReports = (state: CareerState): CareerState => ({
  ...state,
  knowledge: { ...state.knowledge, reports: [] },
});
