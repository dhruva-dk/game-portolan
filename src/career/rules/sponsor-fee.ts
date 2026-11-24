import { SPONSORS } from '../tuning.ts';

export function sponsorFee(reputation: number, factor: number): number {
  const { base, top, from, span, power, step } = SPONSORS;
  const fee = (base + top * ((from - reputation) / span) ** power) * factor;
  return Math.round(fee / step) * step;
}

export const sponsorBonus = (fee: number): number => SPONSORS.bonus * fee;
