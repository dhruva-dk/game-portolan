import { SPONSOR_ROSTER } from '../names.ts';
import { moneyTotal } from '../record/pay.ts';
import {
  YOURS,
  type CareerState,
  type Change,
  type Objective,
  type RaceReport,
  type ShipReport,
  type SponsorRow,
} from '../state.ts';
import { LEAGUE } from '../tuning.ts';
import type { Livery } from '../../world/livery.ts';
import type { Sailor } from './ship.ts';

export type TeamMark = {
  team: number;
  name: string;
  emblem: number;
  livery: Livery;
  yours: boolean;
};

export type Fate =
  | { kind: 'afloat' }
  | { kind: 'sunk'; by: TeamMark }
  | { kind: 'storm' };

export type ResultShip = {
  slot: number;
  sailor: Sailor;
  place: number;
  sinkings: number;
  fate: Fate;
};

export type ResultView = {
  ships: ResultShip[];
  of: number;
  shots: number;
  sea: number;
  podium: TeamMark[];
  points: number;
};

export type MoneyMark =
  | { kind: 'place' }
  | { kind: 'sinkings' }
  | { kind: 'sea' }
  | {
      kind: 'sponsor';
      sponsor: number;
      name: string;
      emblem: number;
      objective: Objective;
      met: boolean;
    }
  | { kind: 'wages'; paid: number[] }
  | { kind: 'interest' };

export type MoneyRow = { mark: MoneyMark; amount: number };

export type MoneyView = {
  rows: MoneyRow[];
  total: number;
  balance: Change<number>;
  standing: Change<number> & { moved: number };
};

const percent = (share: number): number => Math.round(share * 100);

export function teamMark(state: CareerState, team: number): TeamMark {
  const held = state.teams[team];
  return {
    team,
    name: held.name,
    emblem: held.emblem,
    livery: held.livery,
    yours: team === YOURS,
  };
}

const sailorOf = (report: RaceReport, slot: number): Sailor =>
  slot === 0
    ? { who: 'you' }
    : report.driver === null
      ? { who: 'uncle' }
      : { who: 'driver', portrait: report.driver };

function fateOf(state: CareerState, ship: ShipReport): Fate {
  if (!ship.sunk) return { kind: 'afloat' };
  return ship.sunkBy === null
    ? { kind: 'storm' }
    : { kind: 'sunk', by: teamMark(state, ship.sunkBy) };
}

export function resultView(state: CareerState): ResultView | null {
  const report = state.lastRace;
  if (report === null) return null;
  return {
    ships: report.ships.map((ship, slot) => ({
      slot,
      sailor: sailorOf(report, slot),
      place: ship.place,
      sinkings: ship.sinkings,
      fate: fateOf(state, ship),
    })),
    of: LEAGUE.teams * LEAGUE.shipsPerTeam,
    shots:
      report.shotsFired === 0
        ? 0
        : percent(report.shotsLanded / report.shotsFired),
    sea: percent(report.sea),
    podium: report.podium.map((team) => teamMark(state, team)),
    points: report.points,
  };
}

const sponsorRow = (row: SponsorRow): MoneyRow => ({
  mark: {
    kind: 'sponsor',
    sponsor: row.sponsor,
    name: SPONSOR_ROSTER[row.sponsor].name,
    emblem: SPONSOR_ROSTER[row.sponsor].emblem,
    objective: row.objective,
    met: row.met,
  },
  amount: row.amount,
});

const wagesMark = (paid: number[]): MoneyMark => ({ kind: 'wages', paid });

const INTEREST: MoneyMark = { kind: 'interest' };

export function moneyView(state: CareerState): MoneyView | null {
  const report = state.lastRace;
  if (report === null) return null;
  const { money } = report;
  const rows: MoneyRow[] = [
    { mark: { kind: 'place' }, amount: money.place },
    { mark: { kind: 'sinkings' }, amount: money.sinkings },
    { mark: { kind: 'sea' }, amount: money.sea },
    ...money.sponsors.map(sponsorRow),
    ...(money.paid.length > 0
      ? [{ mark: wagesMark(money.paid), amount: money.wages }]
      : []),
    ...(money.interest !== 0
      ? [{ mark: INTEREST, amount: money.interest }]
      : []),
  ];
  return {
    rows,
    total: moneyTotal(money),
    balance: report.balance,
    standing: {
      ...report.standing,
      moved: report.standing.before - report.standing.after,
    },
  };
}
