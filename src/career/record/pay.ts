import type { MatchResult } from '../../sim/result.ts';
import { employees } from '../lookup.ts';
import {
  interestOn,
  placePrize,
  seaMoney,
  sinkingMoney,
} from '../rules/race-money.ts';
import type { CareerState, MoneyRows, SponsorRow } from '../state.ts';
import { teamShips } from './finish.ts';

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

const sponsorRowsNotYet = (): SponsorRow[] => [];

export const moneyTotal = (rows: MoneyRows): number =>
  rows.place +
  rows.sinkings +
  rows.sea +
  sum(rows.sponsors.map((row) => row.amount)) +
  rows.wages +
  rows.interest;

export const wageBill = (state: CareerState, team: number): number =>
  sum(employees(state, team).map((person) => person.contract?.wage ?? 0));

const charge = (amount: number): number => (amount > 0 ? -amount : 0);

export function teamMoney(
  state: CareerState,
  result: MatchResult,
  team: number
): MoneyRows {
  const ships = teamShips(result, team);
  const earned: MoneyRows = {
    place: sum(ships.map((ship) => placePrize(ship.place))),
    sinkings: sum(ships.map((ship) => sinkingMoney(ship.sinkings))),
    sea: seaMoney(result.sea[team]),
    sponsors: sponsorRowsNotYet(),
    wages: charge(wageBill(state, team)),
    paid: employees(state, team).map((person) => person.portrait),
    interest: 0,
  };
  const then = state.teams[team].balance + moneyTotal(earned);
  return { ...earned, interest: charge(interestOn(then)) };
}

export const raceMoney = (
  state: CareerState,
  result: MatchResult
): MoneyRows[] => state.teams.map((_, team) => teamMoney(state, result, team));

export const payRace = (
  state: CareerState,
  money: readonly MoneyRows[]
): CareerState => ({
  ...state,
  teams: state.teams.map((team, index) => ({
    ...team,
    balance: team.balance + moneyTotal(money[index]),
  })),
});
