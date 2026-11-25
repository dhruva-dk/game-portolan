import type { MatchResult } from '../../sim/result.ts';
import { announce, named } from '../change.ts';
import { planetName } from '../fit.ts';
import { seatHolder } from '../lookup.ts';
import {
  isStreak,
  leaderAfter,
  lineLeader,
  nextStreak,
} from '../rules/standing.ts';
import {
  LINES,
  YOURS,
  perLine,
  type CareerState,
  type NewsEvent,
  type Owner,
  type Person,
} from '../state.ts';
import { bestPlaceOf, placedTeam, shipOf } from './race.ts';

function winnerHelm(
  before: CareerState,
  team: number,
  slot: number
): Owner | Person | null {
  if (slot === 0) return before.teams[team].owner;
  return seatHolder(before, team, 'driver');
}

function raceWon(
  before: CareerState,
  result: MatchResult,
  team: number
): NewsEvent {
  const ship = result.ships.findIndex((s) => s.place === 1);
  const helm = winnerHelm(before, team, ship - shipOf(team, 0));
  return {
    kind: 'raceWon',
    team,
    ...(helm === null ? {} : named(helm)),
    planet: planetName(before),
  };
}

function streakTold(state: CareerState, won: number): CareerState {
  const winStreak = nextStreak(state.winStreak, won);
  const told = { ...state, winStreak };
  return isStreak(winStreak.n)
    ? announce(told, { kind: 'streak', team: won, n: winStreak.n })
    : told;
}

function lineLeadsTold(state: CareerState): CareerState {
  const lineLeaders = perLine((line) =>
    leaderAfter(state.lineLeaders[line], lineLeader(state.teams, line))
  );
  const changed = LINES.flatMap((line): NewsEvent[] => {
    const team = lineLeaders[line];
    return team === null || team === state.lineLeaders[line]
      ? []
      : [{ kind: 'lineLead', team, line }];
  });
  return announce({ ...state, lineLeaders }, ...changed);
}

export function raceEvents(
  state: CareerState,
  before: CareerState,
  result: MatchResult
): CareerState {
  const winner = placedTeam(result, 1);
  const told = announce(
    state,
    { kind: 'yourFinish', team: YOURS, place: bestPlaceOf(result, YOURS) },
    raceWon(before, result, winner)
  );
  return lineLeadsTold(streakTold(told, winner));
}
