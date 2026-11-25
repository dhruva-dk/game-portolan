import type { CareerState, Ship, Team } from './state.ts';

export const updateTeam = (
  state: CareerState,
  index: number,
  change: (team: Team) => Team
): CareerState => ({
  ...state,
  teams: state.teams.map((team, i) => (i === index ? change(team) : team)),
});

export const updateShip = (
  ships: Team['ships'],
  slot: number,
  change: (ship: Ship) => Ship
): Team['ships'] => [
  slot === 0 ? change(ships[0]) : ships[0],
  slot === 1 ? change(ships[1]) : ships[1],
];
