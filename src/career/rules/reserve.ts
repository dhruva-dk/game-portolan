import { CONTRACTS } from '../tuning.ts';

export const leavesReserve = (
  balance: number,
  cost: number,
  billAfter: number,
  races: number = CONTRACTS.reserveRaces
): boolean => balance - cost >= races * billAfter;
