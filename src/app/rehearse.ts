import { apply, newCareer, runPolicy } from '../career/apply.ts';
import type { Command } from '../career/commands.ts';
import { matchSetup } from '../career/fit.ts';
import { TEAM_NAMES } from '../career/names.ts';
import { standInResult } from '../career/standin.ts';
import { YOURS, type CareerState } from '../career/state.ts';
import { lobbyView } from '../career/views/lobby.ts';

export const REHEARSAL = {
  seed: 'test',
  livery: { dye: 0, pattern: 0 },
  emblem: 0,
} as const;

function sent(state: CareerState, command: Command): CareerState {
  const applied = apply(state, command);
  if (!applied.ok)
    throw new Error(`${command.type} refused (${applied.reason})`);
  return applied.state;
}

function ashore(state: CareerState, command: Command): CareerState {
  return sent(runPolicy(state, YOURS).state, command);
}

export function dismissed(state: CareerState): CareerState {
  let now = state;
  for (let bubble = lobbyView(now).bubble; bubble !== null; ) {
    now = sent(now, { type: 'MarkSeen', team: YOURS, id: bubble });
    bubble = lobbyView(now).bubble;
  }
  return now;
}

export function rehearsed(
  seed: string = REHEARSAL.seed,
  races = 0
): CareerState {
  let state = newCareer({
    seed,
    name: TEAM_NAMES[0],
    livery: REHEARSAL.livery,
    emblem: REHEARSAL.emblem,
  });
  for (let n = 0; n < races; n++) {
    state = dismissed(state);
    if (state.phase === 'offseason')
      state = ashore(state, { type: 'FinishOffseason', team: YOURS });
    state = ashore(state, { type: 'StartRace', team: YOURS });
    const result = standInResult(matchSetup(state, { hands: 'player' }));
    state = sent(state, { type: 'RecordRace', team: YOURS, result });
    state = sent(state, { type: 'MarkRead', team: YOURS });
  }
  return state;
}

export function wintered(state: CareerState): CareerState {
  return state.phase === 'offseason'
    ? ashore(dismissed(state), { type: 'FinishOffseason', team: YOURS })
    : state;
}

export function owing(state: CareerState, balance: number): CareerState {
  return {
    ...state,
    teams: state.teams.map((t, i) => (i === YOURS ? { ...t, balance } : t)),
  };
}
