import { announce, named, vacate } from './change.ts';
import { seatHolder, seatStat } from './lookup.ts';
import { wintered, winteredFitted } from './rules/development.ts';
import { seasonPrize } from './rules/money.ts';
import { aged, retires, rookie } from './rules/person.ts';
import { standingOrder, standings } from './rules/standing.ts';
import {
  FIRST_RACE,
  YOURS,
  perLine,
  perRole,
  type CareerState,
  type Levels,
  type NewsEvent,
  type OffseasonReport,
  type Person,
  type SeasonCard,
  type Ship,
} from './state.ts';
import { ECONOMY, STANDING } from './tuning.ts';

const expired = (person: Person): boolean => person.contract?.racesLeft === 0;

export function releaseExpired(state: CareerState): CareerState {
  const leaving = new Set(state.people.filter(expired).map((p) => p.id));
  return {
    ...state,
    people: state.people.map((person) =>
      leaving.has(person.id) ? { ...person, contract: null } : person
    ),
    teams: vacate(state.teams, leaving),
  };
}

export function turnSeason(state: CareerState): CareerState {
  const cleared = {
    ...state,
    previousStanding: standings(state),
    season: state.season + 1,
    race: FIRST_RACE,
    points: state.points.map(() => 0),
    bestPlace: state.bestPlace.map(() => STANDING.noRaceYet),
  };
  return { ...cleared, lastStanding: standings(cleared) };
}

export const seasonEvents = (state: CareerState): CareerState =>
  announce(
    state,
    { kind: 'title', team: standingOrder(state)[0] },
    { kind: 'yourSeason', team: YOURS, place: standings(state)[YOURS] }
  );

const retiredNews = (person: Person): NewsEvent => ({
  kind: 'retired',
  ...(person.contract === null ? {} : { team: person.contract.team }),
  ...named(person),
  age: person.age,
});

const rookieNews = (person: Person): NewsEvent => ({
  kind: 'rookie',
  ...named(person),
  age: person.age,
});

export function ageLeague(state: CareerState): CareerState {
  const older = state.people.map(aged);
  const retired = older.filter(retires);
  const gone = new Set(retired.map((person) => person.id));
  const rookies = retired.map((person, index) =>
    rookie(state.seed, state.nextPersonId + index, person.role)
  );
  return announce(
    {
      ...state,
      people: [...older.filter((person) => !gone.has(person.id)), ...rookies],
      nextPersonId: state.nextPersonId + retired.length,
      teams: vacate(state.teams, gone),
    },
    ...retired.map(retiredNews),
    ...rookies.map(rookieNews)
  );
}

export function payPrizes(state: CareerState): CareerState {
  const final = standings(state);
  return {
    ...state,
    teams: state.teams.map((team, index) => ({
      ...team,
      balance: team.balance + seasonPrize(final[index]),
    })),
  };
}

const winterShip = (
  ship: Ship,
  design: Levels,
  upkeep: number | null
): Ship => ({
  ...ship,
  fitted: perLine((line) =>
    winteredFitted(ship.fitted[line], design[line], upkeep)
  ),
});

export function winter(state: CareerState): CareerState {
  return {
    ...state,
    teams: state.teams.map((team, index) => {
      const upkeep = seatStat(state, index, 'mechanic', 'upkeep');
      return {
        ...team,
        design: perLine((line) => wintered(team.design[line], ECONOMY.winter)),
        ships: [
          winterShip(team.ships[0], team.design, upkeep),
          winterShip(team.ships[1], team.design, upkeep),
        ],
      };
    }),
  };
}

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
