import { perKind, type GunKind } from '../../sim/kinds.ts';
import type { MatchResult, ShipResult } from '../../sim/result.ts';
import { announce } from '../change.ts';
import { seatHolder } from '../lookup.ts';
import {
  advancedUnlock,
  gainRate,
  gainedLevel,
  unlockDone,
} from '../rules/development.ts';
import { standings, teamPoints } from '../rules/standing.ts';
import {
  STATS,
  perLine,
  type CareerState,
  type Line,
  type NewsEvent,
  type Phase,
  type Team,
} from '../state.ts';
import { LEAGUE } from '../tuning.ts';

export const shipOf = (team: number, slot: number): number =>
  team * LEAGUE.shipsPerTeam + slot;

export const teamOfShip = (ship: number): number =>
  Math.floor(ship / LEAGUE.shipsPerTeam);

export const teamShips = (result: MatchResult, team: number): ShipResult[] =>
  result.ships.slice(shipOf(team, 0), shipOf(team + 1, 0));

export const bestPlaceOf = (result: MatchResult, team: number): number =>
  Math.min(...teamShips(result, team).map((ship) => ship.place));

export function placedTeam(result: MatchResult, place: number): number {
  const ship = result.ships.findIndex((s) => s.place === place);
  return teamOfShip(ship);
}

export const racePoints = (result: MatchResult, team: number): number =>
  teamPoints(teamShips(result, team));

export const scoreRace = (
  state: CareerState,
  result: MatchResult
): CareerState => ({
  ...state,
  lastStanding: standings(state),
  points: state.points.map((points, team) => points + racePoints(result, team)),
  bestPlace: state.bestPlace.map((best, team) =>
    Math.min(best, bestPlaceOf(result, team))
  ),
});

type Developed = { team: Team; unlocked: GunKind | null };

function developTeam(state: CareerState, index: number): Developed {
  const team = state.teams[index];
  const designer = seatHolder(state, index, 'designer');
  if (designer === null) return { team, unlocked: null };
  const skill = (line: Line): number =>
    designer.stats[STATS.designer.indexOf(line)];
  const design = perLine((line) =>
    gainedLevel(team.design[line], skill(line), gainRate(team.focus, line))
  );
  const { focus } = team;
  if (focus === null || !('gun' in focus))
    return { team: { ...team, design }, unlocked: null };
  const progress = advancedUnlock(team.unlockProgress[focus.gun], skill('gun'));
  const done = unlockDone(progress);
  return {
    team: {
      ...team,
      design,
      unlockProgress: perKind((kind) =>
        kind === focus.gun ? progress : team.unlockProgress[kind]
      ),
      unlocked: done
        ? team.taste.filter(
            (kind) => kind === focus.gun || team.unlocked.includes(kind)
          )
        : team.unlocked,
      focus: done ? null : focus,
    },
    unlocked: done ? focus.gun : null,
  };
}

export function develop(state: CareerState): CareerState {
  const developed = state.teams.map((_, index) => developTeam(state, index));
  const unlocks = developed.flatMap(({ unlocked }, team): NewsEvent[] =>
    unlocked === null ? [] : [{ kind: 'unlocked', team, gun: unlocked }]
  );
  return announce(
    { ...state, teams: developed.map(({ team }) => team) },
    ...unlocks
  );
}

export const seasonOver = (state: CareerState): boolean =>
  state.race >= LEAGUE.racesPerSeason;

export const enterPhase = (state: CareerState, phase: Phase): CareerState => ({
  ...state,
  phase,
});

export const nextRaceLobby = (state: CareerState): CareerState => ({
  ...state,
  race: state.race + 1,
  phase: 'lobby',
});

export const publishNews = (state: CareerState): CareerState => ({
  ...state,
  news: state.pendingEvents,
  pendingEvents: [],
});
