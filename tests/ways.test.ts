import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, IN_MATCH, SCREENS, TAPS, WAYS, course, events, way, type Screen, type Trigger } from '../src/ui/ways.ts';

const taps: readonly Trigger[] = TAPS, happenings: readonly Trigger[] = EVENTS;
const ways = (s: Screen) => Object.entries(WAYS[s]) as [Trigger, Screen][];

test('every screen has a way on, and every way leads to a screen by a tap or the match\'s own course', () => {
  for (const s of SCREENS) {
    assert.ok(ways(s).length > 0, `${s} has no way on`);
    for (const [t, to] of ways(s)) {
      assert.ok(taps.includes(t) || happenings.includes(t), `${s}: ${t} is neither a tap nor the match's`);
      assert.ok(SCREENS.includes(to), `${s}: ${t} leads to ${to}`);
    }
  }
});

test('only the match\'s screens are moved on by the match; every other screen waits for her tap', () => {
  for (const s of SCREENS) {
    for (const [t] of ways(s)) if (happenings.includes(t)) assert.ok(IN_MATCH.includes(s), `${s} is moved on by ${t}`);
  }
  // the screens with no tap of hers to leave by are the match's moments that its course ends: the fight, and the
  // camera's beats on her end
  const tapless = SCREENS.filter((s) => !ways(s).some(([t]) => taps.includes(t)));
  assert.deepEqual(tapless, ['match', 'sinking', 'won']);
});

test('the lobby is reached from every screen; every screen from the title', () => {
  const from = (start: Screen) => {
    const seen = new Set<Screen>([start]), queue = [start];
    while (queue.length) for (const [, to] of ways(queue.shift()!)) if (!seen.has(to)) seen.add(to) && queue.push(to);
    return seen;
  };
  for (const s of SCREENS) assert.ok(from(s).has('lobby'), `no way from ${s} to the lobby`);
  assert.deepEqual([...from('title')].sort(), [...SCREENS].sort());
});

test('her result and the folios each have their own drawn way on: home, or closed', () => {
  assert.equal(way('sunk', 'leave'), 'lobby');
  assert.equal(way('sunk', 'watch'), 'spectate');
  assert.equal(way('spectate', 'leave'), 'lobby');
  assert.equal(way('result', 'leave'), 'lobby');
  assert.equal(way('rank', 'close'), 'lobby');
  assert.equal(way('settings', 'close'), 'lobby');
  assert.equal(way('title', 'begin'), 'lobby');
  assert.equal(way('lobby', 'play'), 'match');
  // a tap that is not one of the screen's ways does nothing
  assert.equal(way('match', 'leave'), null);
  assert.equal(way('result', 'watch'), null);
});

test('sunk: the beat on her ship going down, then her result; watching, it waits for the match to end', () => {
  const end = (settled: boolean, over: boolean) => ({ how: 'shot', settled, over });
  assert.deepEqual(events(null), []);
  assert.equal(course('match', events(null)), 'match');
  assert.equal(course('match', events(end(false, false))), 'sinking');
  assert.equal(course('sinking', events(end(false, false))), 'sinking');
  assert.equal(course('sinking', events(end(true, false))), 'sunk');
  // her result waits for her, however long the match goes on
  assert.equal(course('sunk', events(end(true, false))), 'sunk');
  assert.equal(course('spectate', events(end(true, false))), 'spectate');
  // the match over: her result, whether she watched or not
  assert.equal(course('spectate', events(end(true, true))), 'result');
  assert.equal(course('sunk', events(end(true, true))), 'result');
  // sunk as the match ends, the beat first all the same, then straight to the result
  assert.equal(course('match', events(end(false, true))), 'sinking');
  assert.equal(course('sinking', events(end(true, true))), 'result');
  // and once there, it stays till she taps
  assert.equal(course('result', events(end(true, true))), 'result');
});

test('won: the beat circling her, then her result', () => {
  const end = (settled: boolean) => ({ how: 'won', settled, over: true });
  assert.equal(course('match', events(end(false))), 'won');
  assert.equal(course('won', events(end(false))), 'won');
  assert.equal(course('won', events(end(true))), 'result');
  assert.equal(course('result', events(end(true))), 'result');
});

test('outside the match, its course moves nothing', () => {
  for (const s of ['title', 'lobby', 'rank', 'settings'] as const) {
    assert.equal(course(s, events({ how: 'shot', settled: true, over: true })), s);
  }
});
