import { seatHolder } from '../lookup.ts';
import { aged, retires } from '../rules/ageing.ts';
import { seasonPrize } from '../rules/season-prize.ts';
import { standingOrder, standings } from '../rules/standing.ts';
import {
  YOURS,
  perRole,
  type CareerState,
  type OffseasonReport,
  type Person,
  type SeasonCard,
} from '../state.ts';

function seasonCard(person: Person): SeasonCard {
  const older = aged(person);
  return {
    name: person.name,
    role: person.role,
    portrait: person.portrait,
    age: { before: person.age, after: older.age },
    stats: { before: person.stats, after: older.stats },
    racesLeft: person.contract?.racesLeft ?? 0,
    retired: retires(older),
  };
}

export function offseasonReport(
  before: CareerState,
  after: CareerState
): OffseasonReport {
  const ships = (state: CareerState) => state.teams[YOURS].ships;
  return {
    table: standingOrder(before).map((team) => ({
      team,
      points: before.points[team],
    })),
    prize: seasonPrize(standings(before)[YOURS]),
    seats: perRole((role) => {
      const person = seatHolder(before, YOURS, role);
      return person === null ? null : seasonCard(person);
    }),
    design: {
      before: before.teams[YOURS].design,
      after: after.teams[YOURS].design,
    },
    fitted: [
      { before: ships(before)[0].fitted, after: ships(after)[0].fitted },
      { before: ships(before)[1].fitted, after: ships(after)[1].fitted },
    ],
  };
}

export const fileOffseasonReport = (
  state: CareerState,
  report: OffseasonReport
): CareerState => ({ ...state, lastOffseason: report });
