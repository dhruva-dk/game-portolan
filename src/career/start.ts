import { KINDS, perKind, type GunKind } from '../sim/kinds.ts';
import { DYES, EMBLEMS, PATTERNS, type Livery } from '../world/livery.ts';
import {
  draw,
  knowledgeYear,
  ordered,
  pick,
  uniform,
  whole,
  type Key,
} from './draw.ts';
import { TEAM_NAMES } from './names.ts';
import { ask } from './rules/ask.ts';
import { standardClause } from './rules/clause.ts';
import {
  startBalance,
  startDesign,
  startFitted,
  staffLevel,
  strength,
  unlockCount,
} from './rules/league.ts';
import { lineLeader } from './rules/line-leader.ts';
import { generateOwner } from './rules/owner.ts';
import { generatePerson, type Origin } from './rules/person.ts';
import { shipRange } from './rules/ship-range.ts';
import { drawOffers } from './sponsors/offers.ts';
import { slotsOf } from './sponsors/slots.ts';
import {
  FIRST_RACE,
  FIRST_SEASON,
  ROLES,
  VERSION,
  perLine,
  perRole,
  type CareerState,
  type Levels,
  type Line,
  type Person,
  type Range,
  type Role,
  type Ship,
  type Team,
} from './state.ts';
import {
  HEADCOUNT,
  LEAGUE,
  LEAGUE_START,
  RIVAL_SHIPS,
  STANDING,
  START,
  YOUR_START,
} from './tuning.ts';

export type CareerOptions = {
  seed: string;
  name: string;
  livery: Livery;
  emblem: number;
};

const CANNON: GunKind = 'cannon';

const LIVERIES: readonly Livery[] = DYES.flatMap((_, dye) =>
  PATTERNS.map((_, pattern) => ({ dye, pattern }))
);

const sameLivery = (a: Livery, b: Livery): boolean =>
  a.dye === b.dye && a.pattern === b.pattern;

function distinct<T>(
  items: readonly T[],
  taken: (item: T) => boolean,
  seed: string,
  ...keys: readonly Key[]
): T {
  for (let attempt = 0; ; attempt++) {
    const item = pick(items, seed, ...keys, attempt);
    if (!taken(item)) return item;
  }
}

type Untouched =
  | 'unlockProgress'
  | 'focus'
  | 'scoutSeat'
  | 'approached'
  | 'deals'
  | 'talks'
  | 'sponsors'
  | 'offers';

const emptyTeam = (): Pick<Team, Untouched> => ({
  unlockProgress: perKind(() => 0),
  focus: null,
  scoutSeat: 'designer',
  approached: perRole(() => null),
  deals: perRole(() => null),
  talks: [],
  sponsors: [null, null, null],
  offers: [],
});

const tasteOf = (seed: string, team: number): GunKind[] =>
  ordered(KINDS, (kind) => kind, seed, 'team', team, 'taste');

function yourTeam(options: CareerOptions): Team {
  const level = (): Levels => perLine(() => START.level);
  const ship = (): Ship => ({ fitted: level(), gun: CANNON });
  return {
    ...emptyTeam(),
    name: options.name,
    livery: options.livery,
    emblem: options.emblem,
    taste: tasteOf(options.seed, 0),
    owner: null,
    balance: YOUR_START.balance,
    design: level(),
    unlocked: [CANNON],
    ships: [ship(), ship()],
    seats: perRole(() => null),
  };
}

type Identity = {
  name: string;
  livery: Livery;
  ownerId: number;
  seats: Record<Role, number>;
};

function rivalTeam(seed: string, index: number, identity: Identity): Team {
  const t = strength(index);
  const { jitter } = LEAGUE_START.design;
  const design = perLine((line) =>
    startDesign(
      t,
      uniform(-jitter, jitter, seed, 'team', index, 'design', line)
    )
  );
  const taste = tasteOf(seed, index);
  const others = taste
    .filter((kind) => kind !== CANNON)
    .slice(0, unlockCount(t));
  const unlocked = taste.filter(
    (kind) => kind === CANNON || others.includes(kind)
  );
  const { lo, hi } = LEAGUE_START.fittedShortfall;
  const ship = (slot: number): Ship => ({
    fitted: perLine((line) =>
      startFitted(
        design[line],
        uniform(lo, hi, seed, 'team', index, 'fitted', slot, line)
      )
    ),
    gun: unlocked[0],
  });
  return {
    ...emptyTeam(),
    name: identity.name,
    livery: identity.livery,
    emblem: whole(0, EMBLEMS - 1, seed, 'team', index, 'emblem'),
    taste,
    owner: generateOwner(seed, identity.ownerId),
    balance: startBalance(t),
    design,
    unlocked,
    ships: [ship(0), ship(1)],
    seats: identity.seats,
    sponsors: slotsOf(
      drawOffers({
        seed,
        season: FIRST_SEASON,
        race: FIRST_RACE,
        team: index,
        reputation: index,
        held: [],
        races: LEAGUE_START.sponsorRaces,
      })
    ),
  };
}

function staffMember(
  seed: string,
  id: number,
  role: Role,
  team: number
): Person {
  const origin: Origin = {
    level: staffLevel(strength(team)),
    age: HEADCOUNT.staffAge,
  };
  const person = generatePerson(seed, id, role, origin);
  const wage = ask(person);
  return {
    ...person,
    contract: {
      team,
      wage,
      clause: standardClause(wage),
      racesLeft: pick(
        LEAGUE_START.contractRaces,
        seed,
        'person',
        id,
        'racesLeft'
      ),
    },
  };
}

function shipRanges(
  seed: string,
  team: Team,
  index: number
): Record<Line, Range>[] {
  const year = knowledgeYear({ season: FIRST_SEASON, phase: 'lobby' });
  return team.ships.map((ship, slot) =>
    perLine((line) =>
      shipRange(
        ship.fitted[line],
        RIVAL_SHIPS.width,
        draw(seed, 'line', year, index, slot, line)
      )
    )
  );
}

export function newCareer(options: CareerOptions): CareerState {
  const { seed } = options;
  let nextPersonId = 0;
  const people: Person[] = [];
  const teams: Team[] = [yourTeam(options)];
  for (let index = 1; index < LEAGUE.teams; index++) {
    const name = distinct(
      TEAM_NAMES,
      (n) => teams.some((team, i) => i > 0 && team.name === n),
      seed,
      'team',
      index,
      'name'
    );
    const livery = distinct(
      LIVERIES,
      (l) => teams.some((team) => sameLivery(team.livery, l)),
      seed,
      'team',
      index,
      'livery'
    );
    const ownerId = nextPersonId++;
    const seats = perRole(() => nextPersonId++);
    for (const role of ROLES)
      people.push(staffMember(seed, seats[role], role, index));
    teams.push(rivalTeam(seed, index, { name, livery, ownerId, seats }));
  }
  const origin: Origin = {
    level: HEADCOUNT.freeAgentLevel,
    age: HEADCOUNT.freeAgentAge,
  };
  for (const role of ROLES)
    for (let n = 0; n < HEADCOUNT.freeAgentsPerRole; n++)
      people.push(generatePerson(seed, nextPersonId++, role, origin));
  const standing = teams.map((_, index) =>
    index === 0 ? LEAGUE.teams : index
  );
  return {
    version: VERSION,
    seed,
    season: FIRST_SEASON,
    race: FIRST_RACE,
    phase: 'lobby',
    unread: false,
    teams,
    people,
    nextPersonId,
    points: teams.map(() => 0),
    bestPlace: teams.map(() => STANDING.noRaceYet),
    previousStanding: standing,
    lastStanding: [...standing],
    winStreak: null,
    lineLeaders: perLine((line) => lineLeader(teams, line)),
    knowledge: {
      reports: [],
      lines: teams.map((team, index) =>
        index === 0 ? [] : shipRanges(seed, team, index)
      ),
    },
    lastRace: null,
    lastOffseason: null,
    pendingEvents: [],
    news: [],
    seen: [],
  };
}
