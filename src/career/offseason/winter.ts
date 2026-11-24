import { seatHolder } from '../lookup.ts';
import { winterLoss, wintered } from '../rules/winter.ts';
import {
  MECHANIC_STATS,
  perLine,
  type CareerState,
  type Levels,
  type Ship,
} from '../state.ts';

const UPKEEP = MECHANIC_STATS.indexOf('upkeep');

export function teamLoss(state: CareerState, team: number): number {
  const mechanic = seatHolder(state, team, 'mechanic');
  return winterLoss(mechanic === null ? null : mechanic.stats[UPKEEP]);
}

const lose = (levels: Levels, loss: number): Levels =>
  perLine((line) => wintered(levels[line], loss));

const loseShip = (ship: Ship, loss: number): Ship => ({
  ...ship,
  fitted: lose(ship.fitted, loss),
});

export function winter(state: CareerState): CareerState {
  return {
    ...state,
    teams: state.teams.map((team, index) => {
      const loss = teamLoss(state, index);
      return {
        ...team,
        design: lose(team.design, loss),
        ships: [loseShip(team.ships[0], loss), loseShip(team.ships[1], loss)],
      };
    }),
  };
}
