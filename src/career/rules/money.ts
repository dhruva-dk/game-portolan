import type { ShipResult } from '../../sim/result.ts';
import type { Objective } from '../state.ts';
import { CONTRACTS, RACE_MONEY, SEASON_PRIZE, SPONSORS } from '../tuning.ts';

export const placePrize = (place: number): number =>
  Math.round(
    RACE_MONEY.placePrize *
      ((RACE_MONEY.prizeFrom - place) / RACE_MONEY.prizeSpan) **
        RACE_MONEY.prizePower
  );

export const sinkingMoney = (sinkings: number): number =>
  RACE_MONEY.perSinking * sinkings;

export const meanShare = (samples: readonly number[]): number =>
  samples.reduce((sum, share) => sum + share, 0) / samples.length;

export const seaMoney = (samples: readonly number[]): number =>
  Math.round(RACE_MONEY.seaPrize * meanShare(samples));

export const interestOn = (balance: number): number =>
  Math.ceil(RACE_MONEY.interest * Math.max(0, -balance));

export const seasonPrize = (standing: number): number =>
  Math.round(
    SEASON_PRIZE.prize *
      ((SEASON_PRIZE.from - standing) / SEASON_PRIZE.span) ** SEASON_PRIZE.power
  );

export const leavesReserve = (
  balance: number,
  cost: number,
  billAfter: number,
  races: number = CONTRACTS.reserveRaces
): boolean => balance - cost >= races * billAfter;

export const affordablePurchase = (
  balance: number,
  cost: number,
  bill: number,
  share: number,
  races: number
): boolean =>
  cost <= share * balance && leavesReserve(balance, cost, bill, races);

export function sponsorFee(reputation: number, factor: number): number {
  const { base, top, from, span, power, step } = SPONSORS;
  const fee = (base + top * ((from - reputation) / span) ** power) * factor;
  return Math.round(fee / step) * step;
}

export const sponsorBonus = (fee: number): number => SPONSORS.bonus * fee;

export function objectiveMet(
  objective: Objective,
  ships: readonly ShipResult[],
  samples: readonly number[]
): boolean {
  switch (objective) {
    case 'top10':
      return ships.some((ship) => ship.place <= SPONSORS.topPlaces);
    case 'sinkTwo':
      return (
        ships.reduce((sum, ship) => sum + ship.sinkings, 0) >= SPONSORS.sinkings
      );
    case 'sea':
      return meanShare(samples) >= SPONSORS.seaShare;
    case 'bothAfloat':
      return ships.every((ship) => ship.afloatAtPhaseFour);
  }
}
