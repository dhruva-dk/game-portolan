import { apply, newCareer } from '../../src/career/apply.ts';
import type { Command } from '../../src/career/commands.ts';
import { matchSetup } from '../../src/career/fit.ts';
import { personOf } from '../../src/career/lookup.ts';
import { stars } from '../../src/career/rules/stars.ts';
import { standingOrder, standings } from '../../src/career/rules/standing.ts';
import { standInResult } from '../../src/career/standin.ts';
import {
  LINES,
  ROLES,
  type CareerState,
  type Team,
  YOURS,
} from '../../src/career/state.ts';
import { LEAGUE } from '../../src/career/tuning.ts';
import { createMatch } from '../../src/sim/engine.ts';
import { STILL } from '../../src/sim/hands.ts';
import type { MatchResult } from '../../src/sim/result.ts';
import type { DriverStats, MatchSetup } from '../../src/sim/setup.ts';
import type { Waters } from '../../src/sim/waters.ts';
import { hash } from '../../src/world/random.ts';
import { seedOf } from '../../src/world/seeds.ts';
import { fillMissingSea } from './sea-gap.ts';
import { worldOf } from './world.ts';

export interface CareerScenario {
  kind: 'season' | 'career';
  seed?: string;
  seasons?: number;
  you?: DriverStats;
}

export interface CareerRun {
  seed: string;
  races: number;
  standin: boolean;
  you: DriverStats;
}

export const SEED = '1';

const STAT = 10;

export const YOU: DriverStats = {
  gunnery: STAT,
  helm: STAT,
  nerve: STAT,
  territory: STAT,
  stormcraft: STAT,
  lookout: STAT,
};

const TEAM = {
  name: 'Harness Racing',
  livery: { dye: 3, pattern: 1 },
  emblem: 2,
};

export const startCareer = (seed: string): CareerState =>
  newCareer({ seed, ...TEAM });

function accepted(state: CareerState, command: Command): CareerState {
  const applied = apply(state, command);
  if (!applied.ok)
    throw new Error(
      `${command.type} refused (${applied.reason}) at season ${state.season} race ${state.race}`
    );
  return applied.state;
}

export function firstRace(
  seed: string,
  you: DriverStats = YOU
): { setup: MatchSetup; waters: Waters } {
  const state = accepted(startCareer(seed), { type: 'StartRace', team: YOURS });
  const setup = matchSetup(state, { hands: you });
  return { setup, waters: worldOf(seedOf(setup.planet)).waters };
}

export function sailed(setup: MatchSetup): MatchResult {
  const match = createMatch(setup, worldOf(seedOf(setup.planet)).waters);
  while (!match.done) match.step(STILL);
  return fillMissingSea(match.result());
}

export type Spread = { least: number; median: number; most: number };

export type RaceLine = {
  season: number;
  race: number;
  planet: string;
  places: number[];
  balance: number;
  standing: number;
  ms: number;
};

export type SeasonFigures = {
  season: number;
  standing: number;
  balance: number;
  level: number;
  stars: (number | null)[];
  balances: Spread;
  levels: Spread;
  staff: Spread;
  repossessions: number;
};

export type Told =
  | { kind: 'race'; line: RaceLine }
  | { kind: 'season'; figures: SeasonFigures };

const mean = (xs: readonly number[]): number =>
  xs.reduce((sum, x) => sum + x, 0) / xs.length;

function spread(xs: readonly number[]): Spread {
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    least: sorted[0],
    median: sorted[sorted.length >> 1],
    most: sorted[sorted.length - 1],
  };
}

export const designLevel = (team: Team): number =>
  mean(LINES.map((line) => team.design[line]));

const seatStars = (state: CareerState, team: Team): (number | null)[] =>
  ROLES.map((role) => {
    const id = team.seats[role];
    const person = id === null ? null : personOf(state, id);
    return person === null ? null : stars(person.stats);
  });

const staffStars = (state: CareerState, team: Team): number =>
  mean(seatStars(state, team).map((s) => s ?? 0));

function raceLine(state: CareerState, ms: number): RaceLine {
  const report = state.lastRace;
  if (report === null) throw new Error('a recorded race left no report');
  return {
    season: report.season,
    race: report.race,
    planet: report.planet,
    places: report.ships.map((ship) => ship.place),
    balance: report.balance.after,
    standing: report.standing.after,
    ms,
  };
}

function seasonFigures(
  state: CareerState,
  repossessions: number
): SeasonFigures {
  const yours = state.teams[YOURS];
  return {
    season: state.season,
    standing: standings(state)[YOURS],
    balance: yours.balance,
    level: designLevel(yours),
    stars: seatStars(state, yours),
    balances: spread(state.teams.map((team) => team.balance)),
    levels: spread(state.teams.map(designLevel)),
    staff: spread(state.teams.map((team) => staffStars(state, team))),
    repossessions,
  };
}

export type TableRow = {
  standing: number;
  team: number;
  name: string;
  points: number;
  balance: number;
  level: number;
};

export const table = (state: CareerState): TableRow[] =>
  standingOrder(state).map((team, index) => ({
    standing: index + 1,
    team,
    name: state.teams[team].name,
    points: state.points[team],
    balance: state.teams[team].balance,
    level: designLevel(state.teams[team]),
  }));

export function stateHash(state: CareerState): string {
  let h = 0;
  for (const ch of JSON.stringify(state)) h = hash(h, ch.codePointAt(0) ?? 0);
  return h.toString(16).padStart(8, '0');
}

export const racesOf = (seasons: number): number =>
  seasons * LEAGUE.racesPerSeason;

export function runCareer(
  run: CareerRun,
  tell: (told: Told) => void = () => {}
): CareerState {
  let state = startCareer(run.seed);
  let repossessions = 0;
  for (let n = 0; n < run.races; n++) {
    if (state.phase === 'offseason')
      state = accepted(state, { type: 'FinishOffseason', team: YOURS });
    const began = performance.now();
    state = accepted(state, { type: 'StartRace', team: YOURS });
    const setup = matchSetup(state, { hands: run.you });
    const result = run.standin ? standInResult(setup) : sailed(setup);
    state = accepted(state, { type: 'RecordRace', team: YOURS, result });
    state = accepted(state, { type: 'MarkRead', team: YOURS });
    repossessions += state.news.filter((e) => e.kind === 'repossessed').length;
    tell({ kind: 'race', line: raceLine(state, performance.now() - began) });
    if (state.phase === 'offseason') {
      tell({ kind: 'season', figures: seasonFigures(state, repossessions) });
      repossessions = 0;
    }
  }
  return state;
}
