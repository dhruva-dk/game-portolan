import type { Rarity } from './kinds.ts';
import type { MatchSetup } from './setup.ts';

export const HEAL = {
  restores: { common: 0.15, rare: 0.3, epic: 0.5, legendary: 1 },
  found: { common: 0.5, rare: 0.3, epic: 0.15, legendary: 0.05 },
  slots: 3,
  using: 0.6,
  spots: 640,
  cache: {
    count: 8,
    found: { common: 0, rare: 0.5, epic: 0.35, legendary: 0.15 },
  },
} as const satisfies {
  restores: Record<Rarity, number>;
  found: Record<Rarity, number>;
  slots: number;
  using: number;
  spots: number;
  cache: { count: number; found: Record<Rarity, number> };
};

export const HEAL_COUNT: Readonly<Record<MatchSetup['heals'], number>> = {
  1: 0.5,
  2: 0.75,
  3: 1,
  4: 1.25,
  5: 1.5,
};
