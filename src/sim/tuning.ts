import type { Rarity } from './kinds.ts';
import type { DriverStats, MatchSetup } from './setup.ts';

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

export const GUST_METER = { drain: 1, refill: 0.5, least: 0.3 } as const;

export const SHIELD = { start: 0, most: 100, held: 0.01 } as const;

export const HEAL_COUNT: Readonly<Record<MatchSetup['heals'], number>> = {
  1: 0.5,
  2: 0.75,
  3: 1,
  4: 1.25,
  5: 1.5,
};

export const DRIVER = {
  stat: { least: 1, most: 20 },
  want: { base: 0.25, slope: 1.5, over: 20, flip: 21 },
  react: [2.2, 0.3],
  aim: [0, 1],
  helm: [0, 1],
  breakOff: [0.6, 0.15],
  loop: [60, 250],
  setOff: [0, 25],
  notice: [60, 300],
} as const;

export const TRICKS = {
  lead: { stat: 'gunnery', needs: 8 },
  returnFire: { stat: 'lookout', needs: 10 },
  dodge: { stat: 'helm', needs: 12 },
  outrun: { stat: 'stormcraft', needs: 10 },
  loops: { stat: 'territory', needs: 8 },
  healUnderFire: { stat: 'nerve', needs: 12 },
} as const satisfies Record<string, { stat: keyof DriverStats; needs: number }>;

export const RETURN_FIRE = { beyond: 90 } as const;
