import type { MatchResult, ShipResult } from '../../sim/result.ts';
import { planetName } from '../fit.ts';
import { seatHolder } from '../lookup.ts';
import { meanShare } from '../rules/race-money.ts';
import { standings } from '../rules/standing.ts';
import {
  YOURS,
  type CareerState,
  type MoneyRows,
  type RaceReport,
  type ShipReport,
  type Workshop,
} from '../state.ts';
import { RACE_REPORT } from '../tuning.ts';
import { placedTeam, teamOfShip, teamShips } from './finish.ts';
import { racePoints } from './score.ts';

export type RaceRecord = {
  before: CareerState;
  paid: CareerState;
  after: CareerState;
  result: MatchResult;
  money: MoneyRows;
  repossessed: readonly number[];
};

const shipReport = (ship: ShipResult): ShipReport => ({
  place: ship.place,
  sinkings: ship.sinkings,
  sunk: ship.sunkAt !== null,
  sunkBy: ship.sunkBy === null ? null : teamOfShip(ship.sunkBy),
});

export function workshop(
  before: CareerState,
  after: CareerState
): Workshop | null {
  const { focus, design, unlockProgress } = before.teams[YOURS];
  if (focus === null || seatHolder(before, YOURS, 'designer') === null)
    return null;
  if ('line' in focus)
    return {
      focus,
      before: design[focus.line],
      after: after.teams[YOURS].design[focus.line],
    };
  return {
    focus,
    before: unlockProgress[focus.gun],
    after: after.teams[YOURS].unlockProgress[focus.gun],
  };
}

export function raceReport(record: RaceRecord): RaceReport {
  const { before, paid, after, result, money } = record;
  const repossessed = record.repossessed.includes(YOURS);
  const ships = teamShips(result, YOURS);
  return {
    season: before.season,
    race: before.race,
    planet: planetName(before),
    ships: [shipReport(ships[0]), shipReport(ships[1])],
    driver: seatHolder(before, YOURS, 'driver')?.portrait ?? null,
    shotsFired: ships.reduce((sum, ship) => sum + ship.shotsFired, 0),
    shotsLanded: ships.reduce((sum, ship) => sum + ship.shotsLanded, 0),
    sea: meanShare(result.sea[YOURS]),
    podium: Array.from({ length: RACE_REPORT.podium }, (_, index) =>
      placedTeam(result, index + 1)
    ),
    points: racePoints(result, YOURS),
    money,
    balance: {
      before: before.teams[YOURS].balance,
      after: paid.teams[YOURS].balance,
    },
    standing: {
      before: standings(before)[YOURS],
      after: standings(after)[YOURS],
    },
    workshop: repossessed ? null : workshop(before, after),
    repossessed,
  };
}

export const fileReport = (
  state: CareerState,
  report: RaceReport
): CareerState => ({ ...state, lastRace: report, unread: true });
