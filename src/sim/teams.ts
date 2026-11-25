import { MATCH_END } from './tuning.ts';

export const teamsOf = (ships: readonly { team: number }[]): number[] =>
  ships.map((s) => s.team);

export function over(
  teams: readonly number[],
  alive: readonly number[],
  closed: number
): boolean {
  if (closed >= MATCH_END.overtime) return true;
  for (let i = 1; i < alive.length; i++)
    if (teams[alive[i]] !== teams[alive[0]]) return false;
  return true;
}

export const mates = (
  teams: readonly number[] | undefined,
  a: number,
  b: number
): boolean => !!teams && a !== b && teams[a] === teams[b];
