// Ranks: Iron, Bronze, Silver, Gold, Platinum and Diamond, three steps each, then Admiral and Legend.
// Your rank follows the hidden skill rating, one step per RANK_STEP rating points. A tier once reached is
// your floor: the step inside a tier can fall back, but never below that tier's first step.

export const TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Admiral', 'Legend'] as const;
export type TierName = (typeof TIERS)[number];

export const TIER = { iron: 0, bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5, admiral: 6, legend: 7 } as const;

/** Rating points per rank step. Iron I starts at 0; Admiral at 1800; Legend at 2000. */
export const RANK_STEP = 100;

export interface RankStep {
  /** Index in RANKS, 0 (Iron I) to 19 (Legend). */
  index: number;
  tier: number;
  /** 1 to 3 inside the six stepped tiers; 0 for Admiral and Legend, which have one step. */
  step: number;
  name: string;
  /** The rating this step starts at. */
  from: number;
}

const NUMERALS = ['I', 'II', 'III'];

export const RANKS: readonly RankStep[] = [
  ...TIERS.slice(0, 6).flatMap((tier, t) => NUMERALS.map((n, s) => ({ tier: t, step: s + 1, name: `${tier} ${n}` }))),
  { tier: TIER.admiral, step: 0, name: 'Admiral' },
  { tier: TIER.legend, step: 0, name: 'Legend' },
].map((r, index) => ({ ...r, index, from: index * RANK_STEP }));

/** The first step of a tier. */
export const tierStart = (tier: number): number => RANKS.findIndex((r) => r.tier === tier);

/** The rank step a rating earns on its own, before any floor. */
export const stepOf = (rating: number): number => Math.max(0, Math.min(RANKS.length - 1, Math.floor(rating / RANK_STEP)));

export interface Rank {
  step: RankStep;
  /** 0 to 1 toward the next step (Legend stays at 1). */
  progress: number;
  /** True when the floor is holding the rank above what the rating alone would give. */
  floored: boolean;
}

/** Your shown rank: the rating's step, held at or above the first step of the best tier you have reached. */
export function rankOf(rating: number, bestTier: number): Rank {
  const own = stepOf(rating), floor = tierStart(Math.max(0, Math.min(TIERS.length - 1, bestTier)));
  const index = Math.max(own, floor), step = RANKS[index];
  const last = index === RANKS.length - 1;
  const progress = own < floor ? 0 : last ? 1 : Math.max(0, Math.min(1, (rating - step.from) / RANK_STEP));
  return { step, progress, floored: own < floor };
}

/** The best tier after a match: tiers reached are kept. */
export const reachTier = (bestTier: number, rating: number): number => Math.max(bestTier, RANKS[stepOf(rating)].tier);
