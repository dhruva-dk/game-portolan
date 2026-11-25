import { apply, newCareer, runPolicy } from '../career/apply.ts';
import type { Command, Role } from '../career/commands.ts';
import { matchSetup } from '../career/fit.ts';
import { TEAM_NAMES } from '../career/names.ts';
import { standInResult } from '../career/standin.ts';
import { YOURS, type CareerState } from '../career/state.ts';
import { willingness } from '../career/hiring/willingness.ts';
import { personOf } from '../career/lookup.ts';
import { standardClause } from '../career/rules/clause.ts';
import { NEGOTIATION } from '../career/tuning.ts';
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

function approached(state: CareerState, roles: readonly Role[]) {
  let now = state;
  for (const role of roles) {
    const person = now.people.find(
      (p) => p.role === role && p.contract !== null && p.contract.team !== YOURS
    );
    if (!person) continue;
    const applied = apply(now, {
      type: 'Approach',
      team: YOURS,
      person: person.id,
    });
    if (applied.ok) now = applied.state;
  }
  return now;
}

export function rehearsed(
  seed: string = REHEARSAL.seed,
  races = 0,
  approach: readonly Role[] = []
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
    if (n === races - 1) state = approached(state, approach);
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

export type Haggle = 'refuse' | 'counter' | 'sign';

const THRESHOLD: Record<Haggle, number> = {
  refuse: -Infinity,
  counter: NEGOTIATION.counters,
  sign: NEGOTIATION.signs,
};

function wageFor(state: CareerState, id: number, want: Haggle): number | null {
  const person = personOf(state, id);
  if (person === null) return null;
  const score = willingness(state, YOURS, person),
    { least, most, step } = NEGOTIATION.wage;
  for (let wage = least; wage <= most; wage += step)
    if (
      score({ wage, seasons: 2, fee: 0, clause: standardClause(wage) }) >=
      THRESHOLD[want]
    )
      return wage;
  return null;
}

export function haggled(
  state: CareerState,
  id: number,
  plan: readonly Haggle[]
): CareerState {
  let now = state;
  for (const want of plan) {
    const wage = wageFor(now, id, want);
    if (wage === null) break;
    const applied = apply(now, {
      type: 'Offer',
      team: YOURS,
      person: id,
      terms: { wage, seasons: 2, fee: 0, clause: standardClause(wage) },
    });
    if (!applied.ok) break;
    now = applied.state;
  }
  return now;
}

export function reported(state: CareerState, id: number): CareerState {
  const applied = apply(state, { type: 'BuyReport', team: YOURS, person: id });
  return applied.ok ? applied.state : state;
}
