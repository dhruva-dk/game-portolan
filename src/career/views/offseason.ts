import { stars } from '../rules/person.ts';
import {
  LINES,
  ROLES,
  type CareerState,
  type Change,
  type Levels,
  type Line,
  type OffseasonReport,
  type Role,
  type SeasonCard,
} from '../state.ts';
import { STAT_IDS, type StatId } from './card.ts';
import { teamMark, type TeamMark } from './result.ts';

export type TableEntry = { mark: TeamMark; points: number; place: number };

export type TableView = {
  podium: TableEntry[];
  champion: TeamMark;
  you: TableEntry;
  of: number;
  prize: number;
};

export type SeasonStat = {
  stat: StatId;
  value: Change<number>;
  change: number;
};

export type SeasonFace =
  | {
      kind: 'person';
      name: string;
      role: Role;
      portrait: number;
      age: Change<number>;
      stars: Change<number>;
      stats: SeasonStat[];
      racesLeft: number;
      retired: boolean;
    }
  | { kind: 'empty'; role: Role };

export type PeopleView = { seats: SeasonFace[] };

export type WinterLine = { line: Line; bars: Change<number>[] };

export type WinterView = { lines: WinterLine[] };

const PODIUM = 3;

export function tableView(state: CareerState): TableView | null {
  const report = state.lastOffseason;
  if (report === null) return null;
  const entries = report.table.map((row, i) => ({
    mark: teamMark(state, row.team),
    points: row.points,
    place: i + 1,
  }));
  const you = entries.find((entry) => entry.mark.yours);
  if (you === undefined) return null;
  return {
    podium: entries.slice(0, PODIUM),
    champion: entries[0].mark,
    you,
    of: entries.length,
    prize: report.prize,
  };
}

function seasonFace(role: Role, card: SeasonCard | null): SeasonFace {
  if (card === null) return { kind: 'empty', role };
  return {
    kind: 'person',
    name: card.name,
    role: card.role,
    portrait: card.portrait,
    age: card.age,
    stars: { before: stars(card.stats.before), after: stars(card.stats.after) },
    stats: STAT_IDS[card.role].map((stat, i) => {
      const before = card.stats.before[i],
        after = card.stats.after[i];
      return { stat, value: { before, after }, change: after - before };
    }),
    racesLeft: card.racesLeft,
    retired: card.retired,
  };
}

export function peopleView(state: CareerState): PeopleView | null {
  const report = state.lastOffseason;
  if (report === null) return null;
  return { seats: ROLES.map((role) => seasonFace(role, report.seats[role])) };
}

const level = (levels: Change<Levels>, line: Line): Change<number> => ({
  before: Math.round(levels.before[line]),
  after: Math.round(levels.after[line]),
});

const barsOf = (report: OffseasonReport, line: Line): Change<number>[] => [
  level(report.design, line),
  level(report.fitted[0], line),
  level(report.fitted[1], line),
];

export function winterView(state: CareerState): WinterView | null {
  const report = state.lastOffseason;
  if (report === null) return null;
  return { lines: LINES.map((line) => ({ line, bars: barsOf(report, line) })) };
}
