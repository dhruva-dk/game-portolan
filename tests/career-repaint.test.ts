import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, newCareer, type Applied } from '../src/career/apply.ts';
import type { Command, Reason } from '../src/career/commands.ts';
import type { CareerState, Phase } from '../src/career/state.ts';
import { REPAINT } from '../src/career/tuning.ts';
import { DYES, EMBLEMS, PATTERNS, type Livery } from '../src/world/livery.ts';

const YOURS = 0;
const RIVAL = 9;

const BASE = newCareer({
  seed: 'paint',
  name: 'Gull Racing',
  livery: { dye: 2, pattern: 1 },
  emblem: 4,
});

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(Reflect.get(value, key));
  }
  return value;
}

const sendRaw = (state: CareerState, command: unknown): Applied =>
  Reflect.apply(apply, undefined, [state, command]);

function accepted(applied: Applied): CareerState {
  if (!applied.ok) throw new Error(`refused for ${applied.reason}`);
  return applied.state;
}

function refusedUntouched(
  state: CareerState,
  command: unknown,
  reason: Reason
): void {
  const before = structuredClone(state);
  const applied = sendRaw(deepFreeze(structuredClone(state)), command);
  assert.deepEqual(applied, { ok: false, reason }, JSON.stringify(command));
  assert.deepEqual(state, before);
}

const worn = (state: CareerState, livery: Livery): boolean =>
  state.teams.some(
    (team) =>
      team.livery.dye === livery.dye && team.livery.pattern === livery.pattern
  );

function unworn(state: CareerState, skip = 0): Livery {
  let left = skip;
  for (let dye = 0; dye < DYES.length; dye++)
    for (let pattern = 0; pattern < PATTERNS.length; pattern++)
      if (!worn(state, { dye, pattern }) && left-- === 0)
        return { dye, pattern };
  throw new Error('not enough unworn liveries');
}

const FREE = unworn(BASE);

const withBalance = (
  state: CareerState,
  team: number,
  balance: number
): CareerState => ({
  ...state,
  teams: state.teams.map((t, i) => (i === team ? { ...t, balance } : t)),
});

const at = (phase: Phase): CareerState => ({ ...BASE, phase });

const repaint = (team: number, livery: Livery, emblem: number): Command => ({
  type: 'Repaint',
  team,
  livery,
  emblem,
});

test('a repaint costs 1,000', () => {
  assert.equal(REPAINT.cost, 1000);
  const state = withBalance(BASE, YOURS, 5000);
  const next = accepted(apply(state, repaint(YOURS, FREE, 4)));
  assert.equal(next.teams[YOURS].balance, 4000);
});

test('a repaint changes the livery, the emblem and the balance, and nothing else', () => {
  const ashore: Phase[] = ['lobby', 'offseason'];
  for (const phase of ashore) {
    const state = deepFreeze(structuredClone(at(phase)));
    const before = structuredClone(state);
    const next = accepted(apply(state, repaint(YOURS, FREE, 7)));
    assert.deepEqual(state, before, 'the input is not mutated');
    assert.deepEqual(next, {
      ...before,
      teams: before.teams.map((team, t) =>
        t === YOURS
          ? {
              ...team,
              livery: FREE,
              emblem: 7,
              balance: team.balance - REPAINT.cost,
            }
          : team
      ),
    });
    assert.deepEqual(JSON.parse(JSON.stringify(next)), next);
  }
});

test('changing only the emblem or only the livery is a repaint at the full cost', () => {
  const own = BASE.teams[YOURS];
  const emblemOnly = accepted(
    apply(BASE, repaint(YOURS, own.livery, (own.emblem + 1) % EMBLEMS))
  );
  assert.deepEqual(emblemOnly.teams[YOURS].livery, own.livery);
  assert.equal(emblemOnly.teams[YOURS].emblem, (own.emblem + 1) % EMBLEMS);
  assert.equal(emblemOnly.teams[YOURS].balance, own.balance - REPAINT.cost);
  const liveryOnly = accepted(apply(BASE, repaint(YOURS, FREE, own.emblem)));
  assert.deepEqual(liveryOnly.teams[YOURS].livery, FREE);
  assert.equal(liveryOnly.teams[YOURS].balance, own.balance - REPAINT.cost);
});

test('a rival may repaint by the same rules', () => {
  const state = withBalance(BASE, RIVAL, 3000);
  const next = accepted(apply(state, repaint(RIVAL, FREE, 0)));
  assert.deepEqual(next.teams[RIVAL].livery, FREE);
  assert.equal(next.teams[RIVAL].balance, 2000);
  refusedUntouched(state, repaint(RIVAL, BASE.teams[YOURS].livery, 0), 'taken');
});

test('a livery or emblem that does not exist is refused for invalid', () => {
  const cases: unknown[] = [
    { dye: DYES.length, pattern: 0 },
    { dye: -1, pattern: 0 },
    { dye: 0, pattern: PATTERNS.length },
    { dye: 0.5, pattern: 0 },
    { dye: 0 },
    null,
  ];
  for (const livery of cases)
    refusedUntouched(
      BASE,
      { type: 'Repaint', team: YOURS, livery, emblem: 0 },
      'invalid'
    );
  for (const emblem of [EMBLEMS, -1, 1.5, '1'])
    refusedUntouched(
      BASE,
      { type: 'Repaint', team: YOURS, livery: FREE, emblem },
      'invalid'
    );
});

test('a livery another team wears is refused for taken, whatever the emblem', () => {
  const theirs = BASE.teams[RIVAL];
  refusedUntouched(BASE, repaint(YOURS, theirs.livery, theirs.emblem), 'taken');
  refusedUntouched(
    BASE,
    repaint(YOURS, theirs.livery, (theirs.emblem + 1) % EMBLEMS),
    'taken'
  );
  refusedUntouched(
    withBalance(BASE, YOURS, 0),
    repaint(YOURS, theirs.livery, 0),
    'taken'
  );
});

test('the current livery and emblem are refused for same, before funds', () => {
  const own = BASE.teams[YOURS];
  refusedUntouched(BASE, repaint(YOURS, own.livery, own.emblem), 'same');
  refusedUntouched(
    withBalance(BASE, YOURS, 0),
    repaint(YOURS, own.livery, own.emblem),
    'same'
  );
});

test('a balance below 1,000 is refused for funds; exactly 1,000 is enough', () => {
  refusedUntouched(
    withBalance(BASE, YOURS, REPAINT.cost - 1),
    repaint(YOURS, FREE, 1),
    'funds'
  );
  refusedUntouched(
    withBalance(BASE, YOURS, -500),
    repaint(YOURS, FREE, 1),
    'funds'
  );
  const next = accepted(
    apply(withBalance(BASE, YOURS, REPAINT.cost), repaint(YOURS, FREE, 1))
  );
  assert.equal(next.teams[YOURS].balance, 0);
});

test('a repaint is refused outside the lobby and the stop, and from a team out of range', () => {
  refusedUntouched(at('racing'), repaint(YOURS, FREE, 1), 'phase');
  refusedUntouched(BASE, repaint(BASE.teams.length, FREE, 1), 'team');
  refusedUntouched(BASE, repaint(-1, FREE, 1), 'team');
});

test('after any run of repaints no two teams wear the same livery', () => {
  let state = BASE;
  for (let n = 0; n < 12; n++) {
    const team = (n * 7) % state.teams.length;
    const target =
      n % 3 === 0
        ? state.teams[(team + 1) % state.teams.length].livery
        : unworn(state, n % 4);
    const applied = apply(withBalance(state, team, 5000), {
      type: 'Repaint',
      team,
      livery: target,
      emblem: n % EMBLEMS,
    });
    if (applied.ok) state = applied.state;
    else assert.equal(applied.reason, 'taken');
    const keys = state.teams.map((t) => `${t.livery.dye}/${t.livery.pattern}`);
    assert.equal(new Set(keys).size, keys.length);
  }
});
