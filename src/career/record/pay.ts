import type { MatchResult } from '../../sim/result.ts';
import { announce } from '../change.ts';
import { redrawRepossessed } from '../knowledge/ships.ts';
import { employees } from '../lookup.ts';
import {
  interestOn,
  objectiveMet,
  placePrize,
  seaMoney,
  sinkingMoney,
} from '../rules/money.ts';
import { mapSlots, signed } from '../sponsors.ts';
import { emptyTeam, newYard } from '../start.ts';
import type { CareerState, MoneyRows, SponsorRow, Team } from '../state.ts';
import { REPOSSESSION } from '../tuning.ts';
import { teamShips } from './race.ts';

const sponsorRows = (
  state: CareerState,
  result: MatchResult,
  team: number
): SponsorRow[] =>
  signed(state.teams[team].sponsors).map((sponsor) => {
    const met = objectiveMet(
      sponsor,
      teamShips(result, team),
      result.sea[team]
    );
    return {
      sponsor: sponsor.sponsor,
      objective: sponsor.objective,
      met,
      amount: sponsor.fee + (met ? sponsor.bonus : 0),
    };
  });

export const countDownSponsors = (state: CareerState): CareerState => ({
  ...state,
  teams: state.teams.map((team) => ({
    ...team,
    sponsors: mapSlots(team.sponsors, (sponsor) =>
      sponsor === null || sponsor.racesLeft <= 1
        ? null
        : { ...sponsor, racesLeft: sponsor.racesLeft - 1 }
    ),
  })),
});

const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

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
    sponsors: sponsorRows(state, result, team),
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

type Repossession = { state: CareerState; teams: readonly number[] };

export const isRepossessed = (balance: number): boolean =>
  balance < REPOSSESSION.below;

const reset = (team: Team): Team => ({
  ...team,
  ...emptyTeam(),
  ...newYard(),
  balance: REPOSSESSION.balance,
});

export function repossessTeam(state: CareerState, index: number): CareerState {
  const reclaimed: CareerState = {
    ...state,
    teams: state.teams.map((team, i) => (i === index ? reset(team) : team)),
    people: state.people.map((person) =>
      person.contract?.team === index ? { ...person, contract: null } : person
    ),
  };
  return announce(redrawRepossessed(reclaimed, index), {
    kind: 'repossessed',
    team: index,
  });
}

export function repossess(state: CareerState): Repossession {
  const teams = state.teams.flatMap((team, index) =>
    isRepossessed(team.balance) ? [index] : []
  );
  return { state: teams.reduce(repossessTeam, state), teams };
}

export const countDownContracts = (state: CareerState): CareerState => ({
  ...state,
  people: state.people.map((person) =>
    person.contract === null
      ? person
      : {
          ...person,
          contract: {
            ...person.contract,
            racesLeft: person.contract.racesLeft - 1,
          },
        }
  ),
});
