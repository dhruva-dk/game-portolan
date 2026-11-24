import { RACE_MONEY } from '../tuning.ts';

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
