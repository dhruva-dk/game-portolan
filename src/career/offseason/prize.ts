import { seasonPrize } from '../rules/season-prize.ts';
import { standings } from '../rules/standing.ts';
import type { CareerState } from '../state.ts';

export function payPrizes(state: CareerState): CareerState {
  const final = standings(state);
  return {
    ...state,
    teams: state.teams.map((team, index) => ({
      ...team,
      balance: team.balance + seasonPrize(final[index]),
    })),
  };
}
