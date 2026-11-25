import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/career/apply.ts';
import { matchSetup } from '../src/career/fit.ts';
import { standInResult } from '../src/career/standin.ts';
import { YOURS, type CareerState } from '../src/career/state.ts';
import { FIRST_PLANET, begun, launchOf, recordOf } from '../src/app/launch.ts';
import { sailOrders } from '../src/career/views/lobby.ts';
import { recorded, rehearsed } from '../src/app/rehearse.ts';

const options = {
  seed: 'harbor',
  name: 'Damp Ambition',
  livery: { dye: 0, pattern: 0 },
  emblem: 0,
};

const sent = (state: CareerState, ...commands: ReturnType<typeof sailOrders>) =>
  commands.reduce((now, c) => {
    const applied = apply(now, c);
    assert.ok(applied.ok, c.type);
    return applied.state;
  }, state);

test('with no career, launch builds the first planet and shows New Career', () => {
  assert.deepEqual(launchOf(null), { kind: 'new', planet: FIRST_PLANET });
  assert.equal(FIRST_PLANET, 'portolan');
});

test('a founded career is racing: launch sails race one on its planet', () => {
  const { state } = begun(options);
  const l = launchOf(state);
  assert.equal(l.kind, 'race');
  assert.equal(l.planet, `${options.seed}/1/1`);
});

test('an unread race shows the result flow over the next race’s planet', () => {
  const state = recorded(rehearsed('harbor', 0));
  assert.equal(state.unread, true);
  const l = launchOf(state);
  assert.equal(l.kind, 'flow');
  assert.equal(l.planet, 'harbor/1/2');
});

test('a read race shows the lobby on the next race’s planet; in the off-season, the next season’s first', () => {
  const lobby = launchOf(rehearsed('harbor', 3));
  assert.deepEqual([lobby.kind, lobby.planet], ['lobby', 'harbor/1/4']);
  const winter = rehearsed('harbor', 10);
  assert.equal(winter.phase, 'offseason');
  const l = launchOf(winter);
  assert.deepEqual([l.kind, l.planet], ['lobby', 'harbor/2/1']);
});

test('SAIL starts the race, finishing the off-season first in the off-season stop', () => {
  const lobby = rehearsed('harbor', 3);
  assert.deepEqual(
    sailOrders(lobby).map((c) => c.type),
    ['StartRace']
  );
  assert.equal(sent(lobby, ...sailOrders(lobby)).phase, 'racing');
  const winter = rehearsed('harbor', 10);
  assert.deepEqual(
    sailOrders(winter).map((c) => c.type),
    ['FinishOffseason', 'StartRace']
  );
  const racing = sent(winter, ...sailOrders(winter));
  assert.deepEqual(
    [racing.phase, racing.season, racing.race],
    ['racing', 2, 1]
  );
  assert.equal(launchOf(racing).planet, 'harbor/2/1');
});

test('a finished match records its real result for team 0, and the career is unread', () => {
  const racing = sent(
    rehearsed('harbor', 2),
    ...sailOrders(rehearsed('harbor', 2))
  );
  const result = standInResult(matchSetup(racing, { hands: 'player' }));
  const record = recordOf(result);
  assert.deepEqual(record, { type: 'RecordRace', team: YOURS, result });
  const after = sent(racing, record);
  assert.equal(after.unread, true);
  assert.equal(launchOf(after).kind, 'flow');
});
