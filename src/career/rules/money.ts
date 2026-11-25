import type { ShipResult } from '../../sim/result.ts';
import type { Objective, Sponsor } from '../state.ts';
import {
  CONTRACTS,
  ECONOMY,
  LEAGUE,
  RACE_MONEY,
  SHIPS,
  SPONSORS,
  STARS,
} from '../tuning.ts';

const SHIP_COUNT = LEAGUE.teams * LEAGUE.shipsPerTeam;

export const standingMerit = (standing: number): number =>
  (LEAGUE.teams - standing) / (LEAGUE.teams - 1);

export const placeMerit = (place: number): number =>
  (SHIP_COUNT - place) / (SHIP_COUNT - 1);

export const starMerit = (starCount: number): number => starCount / STARS.most;

const LEVEL_SPREAD = ECONOMY.parTop - SHIPS.leastLevel;

export const levelMerit = (level: number): number =>
  (level - SHIPS.leastLevel) / LEVEL_SPREAD;

export const parStars = (merit: number): number => STARS.most * merit;

export const parLevel = (merit: number): number =>
  SHIPS.leastLevel + LEVEL_SPREAD * merit;

export const income = (merit: number): number =>
  ECONOMY.income.floor + ECONOMY.income.rise * merit ** ECONOMY.income.power;

export const STANDINGS: readonly number[] = Array.from(
  { length: LEAGUE.teams },
  (_, index) => index + 1
);

export const leagueIncome = (): number =>
  STANDINGS.reduce((sum, standing) => sum + income(standingMerit(standing)), 0);

export const placePrize = (place: number): number =>
  Math.round(
    (ECONOMY.shares.place * income(placeMerit(place))) / LEAGUE.shipsPerTeam
  );

export const deedPrize = (): number =>
  (ECONOMY.shares.deeds / RACE_MONEY.deeds) * leagueIncome();

export const perSinking = (): number =>
  Math.round(deedPrize() / (SHIP_COUNT - 1));

export const sinkingMoney = (sinkings: number): number =>
  perSinking() * sinkings;

export const meanShare = (samples: readonly number[]): number =>
  samples.reduce((sum, share) => sum + share, 0) / samples.length;

export const seaMoney = (samples: readonly number[]): number =>
  Math.round(deedPrize() * meanShare(samples));

export const interestOn = (balance: number): number =>
  Math.ceil(RACE_MONEY.interest * Math.max(0, -balance));

export const seasonPrize = (standing: number): number =>
  Math.round(
    ECONOMY.shares.season *
      LEAGUE.racesPerSeason *
      income(standingMerit(standing))
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

const meritSum = (): number =>
  STANDINGS.reduce((sum, standing) => sum + standingMerit(standing), 0);

export function sponsorFee(reputation: number, wealth: number): number {
  const { slots, bonus, step } = SPONSORS;
  const fee =
    (ECONOMY.shares.sponsors / slots / (1 + bonus * ECONOMY.met)) *
    income(standingMerit(reputation)) *
    wealth;
  return Math.round(fee / step) * step;
}

export const sponsorBonus = (fee: number): number => SPONSORS.bonus * fee;

const parPlace = (reputation: number): number =>
  LEAGUE.shipsPerTeam * reputation - 1;

export const parSinkings = (merit: number): number =>
  ((SHIP_COUNT - 1) * merit) / meritSum();

export const parSea = (merit: number): number => (100 * merit) / meritSum();

export function objectiveTarget(
  objective: Objective,
  reputation: number
): number | null {
  const merit = standingMerit(reputation);
  switch (objective) {
    case 'place':
      return Math.ceil(parPlace(reputation));
    case 'sinkings':
      return Math.max(1, Math.round(parSinkings(merit)));
    case 'sea':
      return Math.max(1, Math.round(parSea(merit)));
    case 'bothAfloat':
      return null;
  }
}

export function objectiveMet(
  goal: Pick<Sponsor, 'objective' | 'target'>,
  ships: readonly ShipResult[],
  samples: readonly number[]
): boolean {
  const { objective, target } = goal;
  switch (objective) {
    case 'place':
      return target !== null && ships.some((ship) => ship.place <= target);
    case 'sinkings':
      return (
        target !== null &&
        ships.reduce((sum, ship) => sum + ship.sinkings, 0) >= target
      );
    case 'sea':
      return target !== null && meanShare(samples) >= target / 100;
    case 'bothAfloat':
      return ships.every((ship) => ship.afloatAtPhaseFour);
  }
}
