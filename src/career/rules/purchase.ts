import { leavesReserve } from './reserve.ts';

export const affordablePurchase = (
  balance: number,
  cost: number,
  bill: number,
  share: number,
  races: number
): boolean =>
  cost <= share * balance && leavesReserve(balance, cost, bill, races);
