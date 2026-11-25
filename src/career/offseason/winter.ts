import { seatStat } from '../lookup.ts';
import { winterLoss, wintered } from '../rules/development.ts';
import { perLine, type CareerState, type Levels, type Ship } from '../state.ts';

export const teamLoss = (state: CareerState, team: number): number =>
  winterLoss(seatStat(state, team, 'mechanic', 'upkeep'));

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
