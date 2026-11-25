import { apply, newCareer, runPolicy } from '../../src/career/apply.ts';
import type { Command, Refusal } from '../../src/career/commands.ts';
import { matchSetup } from '../../src/career/fit.ts';
import { personOf } from '../../src/career/lookup.ts';
import { stars } from '../../src/career/rules/person.ts';
import { standingOrder, standings } from '../../src/career/rules/standing.ts';
import { standInResult } from '../../src/career/standin.ts';
import {
  LINES,
  ROLES,
  type CareerState,
  type NewsKind,
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
import { worldOf } from './world.ts';

export interface CareerScenario {
  kind: 'season' | 'career';
  seed?: string;
  seasons?: number;
  you?: DriverStats;
  policy?: boolean;
}

export interface CareerRun {
  seed: string;
  races: number;
  standin: boolean;
  you: DriverStats;
  policy?: boolean;
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

const where = (state: CareerState): string =>
  `season ${state.season} ${state.phase === 'offseason' ? 'off-season stop' : `race ${state.race}`}`;

function policyRefused(state: CareerState, refused: readonly Refusal[]): void {
  if (refused.length > 0)
    throw new Error(
      `policy command refused at ${where(state)}: ${refused.map((r) => `${JSON.stringify(r.command)} (${r.reason})`).join('; ')}`
    );
}

function accepted(state: CareerState, command: Command): CareerState {
  const applied = apply(state, command);
  if (!applied.ok)
    throw new Error(
      `${command.type} refused (${applied.reason}) at ${where(state)}`
    );
  policyRefused(state, applied.refused);
  return applied.state;
}

function yourTurn(state: CareerState, run: CareerRun): CareerState {
  if (run.policy === false) return state;
  const played = runPolicy(state, YOURS);
  policyRefused(state, played.refused);
  return played.state;
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
  return match.result();
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

export type Acted = { hired: number[]; built: number[]; signed: number[] };

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
  rivals: number;
  acted: { hired: number; built: number; signed: number };
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
  repossessions: number,
  rivals: number,
  acted: Acted
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
    rivals,
    acted: {
      hired: acted.hired.length,
      built: acted.built.length,
      signed: acted.signed.length,
    },
  };
}

const including = (teams: number[], more: readonly number[]): number[] =>
  [...new Set([...teams, ...more])].sort((a, b) => a - b);

const builders = (before: CareerState, after: CareerState): number[] =>
  after.teams.flatMap((team, index) =>
    JSON.stringify(team.ships) === JSON.stringify(before.teams[index].ships)
      ? []
      : [index]
  );

const teamsTold = (state: CareerState, kinds: readonly NewsKind[]): number[] =>
  state.news.flatMap((event) =>
    kinds.includes(event.kind) && event.team !== undefined ? [event.team] : []
  );

export type TableRow = {
  standing: number;
  team: number;
  name: string;
  points: number;
  balance: number;
  level: number;
  stars: number;
};

export const table = (state: CareerState): TableRow[] =>
  standingOrder(state).map((team, index) => ({
    standing: index + 1,
    team,
    name: state.teams[team].name,
    points: state.points[team],
    balance: state.teams[team].balance,
    level: designLevel(state.teams[team]),
    stars: staffStars(state, state.teams[team]),
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
  let repossessions = 0,
    rivals = 0;
  const acted: Acted = { hired: [], built: [], signed: [] };
  const ashore = (command: Command): void => {
    const before = state;
    state = accepted(yourTurn(state, run), command);
    acted.built = including(acted.built, builders(before, state));
  };
  for (let n = 0; n < run.races; n++) {
    if (state.phase === 'offseason')
      ashore({ type: 'FinishOffseason', team: YOURS });
    const began = performance.now();
    ashore({ type: 'StartRace', team: YOURS });
    const setup = matchSetup(state, { hands: run.you });
    const result = run.standin ? standInResult(setup) : sailed(setup);
    state = accepted(state, { type: 'RecordRace', team: YOURS, result });
    state = accepted(state, { type: 'MarkRead', team: YOURS });
    const taken = state.news.filter((e) => e.kind === 'repossessed');
    repossessions += taken.length;
    rivals += taken.filter((e) => e.team !== YOURS).length;
    acted.hired = including(
      acted.hired,
      teamsTold(state, ['hired', 'poached'])
    );
    acted.signed = including(acted.signed, teamsTold(state, ['sponsorSigned']));
    tell({ kind: 'race', line: raceLine(state, performance.now() - began) });
    if (state.phase === 'offseason') {
      tell({
        kind: 'season',
        figures: seasonFigures(state, repossessions, rivals, acted),
      });
      repossessions = 0;
      rivals = 0;
    }
  }
  return state;
}
