import { apply, newCareer, runPolicy } from '../career/apply.ts';
import type { Command, Role } from '../career/commands.ts';
import { matchSetup } from '../career/fit.ts';
import { TEAM_NAMES } from '../career/names.ts';
import { standInResult } from '../career/standin.ts';
import {
  YOURS,
  type CareerState,
  type Talk,
  type Terms,
} from '../career/state.ts';
import { talkWith } from '../career/hiring/talks.ts';
import { answerTo, type Answer } from '../career/rules/answer.ts';
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

const HEARD: Record<Haggle, Answer> = {
  refuse: 'refuses',
  counter: 'counters',
  sign: 'signs',
};

const SAID: Record<Haggle, Talk['answer']> = {
  refuse: 'refused',
  counter: 'countered',
  sign: 'signed',
};

function* termsToTry(): Generator<Terms> {
  const { wage, fee, clause } = NEGOTIATION;
  const fees = [0, 1000, 5000, 20000].filter((f) => f <= fee.most),
    clauses = [null, clause.least, 5000, 50000, clause.most];
  for (const seasons of [2, 1, 3] as const)
    for (const f of fees)
      for (const c of clauses)
        for (let w = wage.least; w <= wage.most; w += wage.step)
          yield { wage: w, seasons, fee: f, clause: c ?? standardClause(w) };
}

function haggle(state: CareerState, id: number, want: Haggle): CareerState {
  const person = personOf(state, id);
  if (person === null) throw new Error(`haggled: no person ${id}`);
  const score = willingness(state, YOURS, person);
  for (const terms of termsToTry()) {
    if (answerTo(score(terms)) !== HEARD[want]) continue;
    const applied = apply(state, {
      type: 'Offer',
      team: YOURS,
      person: id,
      terms,
    });
    if (
      applied.ok &&
      talkWith(applied.state.teams[YOURS], id).answer === SAID[want]
    )
      return applied.state;
  }
  throw new Error(`haggled: no terms make ${person.name} answer ${want}`);
}

export const haggled = (
  state: CareerState,
  id: number,
  plan: readonly Haggle[]
): CareerState => plan.reduce((now, want) => haggle(now, id, want), state);

export function reported(state: CareerState, id: number): CareerState {
  const applied = apply(state, { type: 'BuyReport', team: YOURS, person: id });
  return applied.ok ? applied.state : state;
}
