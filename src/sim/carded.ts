import type { RaceCard } from '../race.ts';

export const RACE = { overtime: 180 } as const;

export function checked(card: RaceCard): RaceCard {
  card.ships.forEach((s, i) => {
    if (s.id !== i) throw new Error(`card: ship ${i} is numbered ${s.id}`);
    if (i > 0 && !s.driver) throw new Error(`card: ship ${i} has no driver`);
  });
  return card;
}

export const teamsOf = (card: RaceCard): number[] =>
  card.ships.map((s) => s.team);

export const entered = (card: RaceCard): number[] =>
  card.ships.filter((s) => !s.forfeit).map((s) => s.id);

export function over(
  teams: readonly number[],
  alive: readonly number[],
  closed: number
): boolean {
  if (closed >= RACE.overtime) return true;
  for (let i = 1; i < alive.length; i++)
    if (teams[alive[i]] !== teams[alive[0]]) return false;
  return true;
}

export const mates = (
  teams: readonly number[] | undefined,
  a: number,
  b: number
): boolean => !!teams && a !== b && teams[a] === teams[b];
