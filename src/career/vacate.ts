import { perRole, type Team } from './state.ts';

export const vacate = (
  teams: readonly Team[],
  gone: ReadonlySet<number>
): Team[] =>
  teams.map((team) => ({
    ...team,
    seats: perRole((role) => {
      const id = team.seats[role];
      return id !== null && gone.has(id) ? null : id;
    }),
  }));
