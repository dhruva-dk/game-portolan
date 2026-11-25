import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, newCareer, type Applied } from '../src/career/apply.ts';
import type { CareerState } from '../src/career/state.ts';

const BASE = newCareer({
  seed: 'fields',
  name: 'Gull Racing',
  livery: { dye: 2, pattern: 1 },
  emblem: 4,
});

const sendRaw = (state: CareerState, command: unknown): Applied =>
  Reflect.apply(apply, undefined, [state, command]);

const person = BASE.people.find((p) => p.contract === null)?.id ?? 0;

test('terms with a field beyond the four are refused as invalid', () => {
  const terms = { wage: 500, seasons: 1, fee: 0, clause: 0 };
  const plain = sendRaw(BASE, { type: 'Offer', team: 0, person, terms });
  assert.notDeepEqual(plain, { ok: false, reason: 'invalid' });
  for (const extra of [{ junk: undefined }, { more: new Map() }, { wage2: 1 }])
    assert.deepEqual(
      sendRaw(BASE, {
        type: 'Offer',
        team: 0,
        person,
        terms: { ...terms, ...extra },
      }),
      { ok: false, reason: 'invalid' }
    );
});

test('a livery with a field beyond dye and pattern is refused as invalid', () => {
  assert.deepEqual(
    sendRaw(BASE, {
      type: 'Repaint',
      team: 0,
      livery: { dye: 3, pattern: 1, shine: new Map() },
      emblem: 4,
    }),
    { ok: false, reason: 'invalid' }
  );
});

test('the state keeps its own copy of a focus, not the command’s object', () => {
  const hired: CareerState = {
    ...BASE,
    teams: BASE.teams.map((t, i) =>
      i === 0
        ? {
            ...t,
            seats: {
              ...t.seats,
              designer:
                BASE.people.find((p) => p.role === 'designer')?.id ?? null,
            },
          }
        : t
    ),
  };
  const focus = { line: 'hull' };
  const sent = sendRaw(hired, { type: 'SetFocus', team: 0, focus });
  assert.ok(sent.ok);
  assert.deepEqual(sent.state.teams[0].focus, { line: 'hull' });
  assert.notEqual(sent.state.teams[0].focus, focus);
  focus.line = 'keel';
  assert.deepEqual(sent.state.teams[0].focus, { line: 'hull' });
  assert.deepEqual(JSON.parse(JSON.stringify(sent.state)), sent.state);
});
