import { hash01 } from '../world/random.ts';
import { seedOf } from '../world/seeds.ts';
import type { CareerState } from './state.ts';
import { LEAGUE } from './tuning.ts';

export type Key = string | number;

export function draw(seed: string, ...keys: readonly Key[]): number {
  return hash01(seedOf(seed), seedOf(keys.join('/')));
}

export function uniform(
  lo: number,
  hi: number,
  seed: string,
  ...keys: readonly Key[]
): number {
  return lo + (hi - lo) * draw(seed, ...keys);
}

export function whole(
  lo: number,
  hi: number,
  seed: string,
  ...keys: readonly Key[]
): number {
  return lo + Math.floor(draw(seed, ...keys) * (hi - lo + 1));
}

export function pick<T>(
  items: readonly T[],
  seed: string,
  ...keys: readonly Key[]
): T {
  return items[whole(0, items.length - 1, seed, ...keys)];
}

export function ordered<T>(
  items: readonly T[],
  keyOf: (item: T) => Key,
  seed: string,
  ...keys: readonly Key[]
): T[] {
  return items
    .map((item, index) => ({
      item,
      index,
      u: draw(seed, ...keys, keyOf(item)),
    }))
    .sort((a, b) => a.u - b.u || a.index - b.index)
    .map(({ item }) => item);
}

export const OFFSEASON_RACE = LEAGUE.racesPerSeason + 1;

export const raceKey = (state: Pick<CareerState, 'race' | 'phase'>): number =>
  state.phase === 'offseason' ? OFFSEASON_RACE : state.race;

export const knowledgeYear = (
  state: Pick<CareerState, 'season' | 'phase'>
): number => (state.phase === 'offseason' ? state.season + 1 : state.season);
