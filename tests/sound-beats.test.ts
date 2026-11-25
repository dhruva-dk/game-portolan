import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, RULES, beatOf, coinTicks } from '../src/ui/base/beat.ts';
import { BEAT } from '../src/ui/base/house.ts';
import { eased } from '../src/ui/base/ticker.ts';
import { seaScreen, teamWon } from '../src/app/heard.ts';

const nowhere = (tap: string): boolean => tap === '';
const inResult = (tap: string): boolean => tap === 'result';

test('each motion with a landing asks for its one beat', () => {
  const asked = (name: string, classes: string[] = [], within = nowhere) =>
    beatOf(name, classes, within)?.beat ?? null;
  assert.equal(asked('refuse'), 'knock');
  assert.equal(asked('stamp', ['stamped']), 'stamp');
  assert.equal(asked('stamp', ['stamp-in']), null);
  assert.equal(asked('stamp', ['stamp']), null);
  assert.equal(asked('sealed', ['sealed']), 'seal');
  assert.equal(asked('puff', ['puff']), 'landed');
  assert.equal(asked('quake', ['quaking']), 'slam');
  assert.equal(asked('tossed', ['tossed']), 'tossed');
  assert.equal(asked('floated', ['floated']), 'built');
  assert.equal(asked('inked-row', ['inked-row']), null);
  assert.equal(asked('inked-row', ['inked-row'], inResult), 'row');
  assert.equal(asked('moved', ['moved']), null);
  assert.equal(asked('moved', ['moved'], inResult), 'standing');
  assert.equal(asked('dealt-card', ['dealt-card']), 'card');
  assert.equal(asked('crowned', ['crowned']), 'laurel');
  assert.equal(asked('frost', ['frost']), 'frost');
  assert.equal(asked('debt-stamp', ['debt-in']), 'debt');
  assert.equal(asked('uncle-in', ['sitter']), 'unroll');
  assert.equal(asked('uncle-out', ['sitter']), 'furl');
  for (const quiet of [
    'pop',
    'leaf',
    'puff-heavy',
    'thrown',
    'heavy',
    'slam',
    'uncle-words',
    'uncle-blink',
    'beckon',
    'debt-throb',
  ])
    assert.equal(asked(quiet, [quiet]), null, quiet);
});

test('a beat lands with its motion: on the stroke of a stamp or a seal, not at its start', () => {
  for (const [name, rule] of Object.entries(RULES)) {
    const at = rule.at ?? 0;
    assert.ok(at >= 0 && at <= 1, name);
  }
  assert.ok((beatOf('stamp', ['stamped'], nowhere)?.at ?? 0) > 0.4);
  assert.ok((beatOf('sealed', [], nowhere)?.at ?? 0) > 0.4);
  assert.ok((beatOf('debt-stamp', [], nowhere)?.at ?? 0) > 0.4);
  assert.equal(beatOf('refuse', [], nowhere)?.at, 0);
});

test('every beat is asked for by some motion, or by the money count and the repaint', () => {
  const ruled = new Set(Object.values(RULES).map((r) => r.beat));
  for (const b of BEATS)
    assert.ok(ruled.has(b) || b === 'coin' || b === 'painted', b);
});

test('the money count ticks a coin as the count moves, never closer than the gap, never more than the most', () => {
  assert.deepEqual(coinTicks(100, 900, 500, 500), []);
  for (const [from, to] of [
    [0, 1],
    [1200, 900],
    [-400, 25000],
    [0, 10 ** 9],
  ]) {
    const ticks = coinTicks(100, 900, from, to);
    assert.ok(
      ticks.length >= 1 && ticks.length <= BEAT.coin.most,
      `${ticks.length}`
    );
    assert.ok(ticks.every((t) => t >= 100 && t <= 1000));
    for (let i = 1; i < ticks.length; i++)
      assert.ok(ticks[i] - ticks[i - 1] >= BEAT.coin.gap - 1e-9, `${ticks}`);
  }
  const ticks = coinTicks(0, 900, 0, 10000);
  assert.equal(ticks.at(-1), 900);
  const shown = ticks.map((t) => eased(t / 900));
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i] > shown[i - 1]);
  assert.ok(
    ticks[1] - ticks[0] < ticks.at(-1)! - ticks.at(-2)!,
    'they slow as the count does'
  );
  assert.ok(coinTicks(0, 120, 0, 10000).length <= 2);
});

test("the sea's screen for the ear: sinking until the buttons are offered, sunk after; Settings from the pause", () => {
  const at = (
    phase: Parameters<typeof seaScreen>[0],
    o: Partial<Parameters<typeof seaScreen>[1]> = {}
  ) => seaScreen(phase, { offered: false, paused: 'playing', ...o });
  assert.equal(at('sailing'), 'match');
  assert.equal(at('sailing', { paused: 'paused' }), 'match');
  assert.equal(at('sailing', { paused: 'settings' }), 'settings');
  assert.equal(at('sunk'), 'sinking');
  assert.equal(at('sunk', { offered: true }), 'sunk');
  assert.equal(at('watching', { offered: true }), 'spectate');
  assert.equal(at('settling', { offered: true }), 'sunk');
  assert.equal(at('over', { offered: true }), 'sunk');
});

test('the salute is for your team taking the race: your ship first, or a teammate first while you watch', () => {
  const placed = (...places: number[]) => places.map((place) => ({ place }));
  const teams = [0, 1, 0, 1, 2];
  assert.equal(teamWon(placed(1, 2, 3, 4, 5), teams, 0), true);
  assert.equal(teamWon(placed(4, 2, 1, 3, 5), teams, 0), true);
  assert.equal(teamWon(placed(2, 1, 3, 4, 5), teams, 0), false);
  assert.equal(teamWon(placed(2, 3, 4, 5, 1), teams, 0), false);
  assert.equal(teamWon([], teams, 0), false);
});
