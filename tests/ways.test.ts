import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, HOME, IN_MATCH, SCREENS, TAPS, WAYS, course, events, way, wayHome, type Leg, type Screen, type Trigger } from '../src/ui/ways.ts';

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

/** The way home begun at 1000 ms, a frame drawn every `every` ms till `until`: each leg come to, and when. */
function walk(every: number, until: number) {
  const home = wayHome(1000), legs: { leg: Leg; at: number }[] = [];
  for (let now = 1000 + every; now <= until; now += every) {
    const leg = home.drawn(now);
    if (leg) legs.push({ leg, at: now });
  }
  return { home, legs };
}

test('home: the parchment covers the match, then the change is made under it', () => {
  const { legs } = walk(10, 1600);
  // covered first, the change only once it is whole
  assert.deepEqual(legs[0], { leg: 'hold', at: 1000 + HOME.cover });
  const home = wayHome(0);
  assert.equal(home.covered(0), 0);
  assert.equal(home.covered(HOME.cover / 2), 0.5);
  assert.equal(home.drawn(HOME.cover - 1), null, 'nothing made while the match still shows');
  assert.equal(home.leg, 'cover');
});

test('home: held at least HOME.hold, and until the lobby\'s frames are drawn; then lifted, then home', () => {
  // frames quick: held the least it is held
  const quick = walk(10, 3000).legs;
  assert.deepEqual(quick.map((l) => l.leg), ['hold', 'lift', 'home']);
  assert.equal(quick[1].at - quick[0].at, HOME.hold);
  assert.equal(quick[2].at - quick[1].at, HOME.lift);
  // frames slow (the lobby long in coming): held till its frames are drawn, however long that is
  const slow = walk(400, 6000).legs;
  assert.equal(slow[1].leg, 'lift');
  assert.equal(slow[1].at - slow[0].at, HOME.frames * 400);
  // never lifted on the clock alone: no frame drawn, it holds
  const home = wayHome(0);
  home.drawn(HOME.cover);
  assert.equal(home.leg, 'hold');
  assert.equal(home.covered(60000), 1);
  for (let k = 1; k < HOME.frames; k++) assert.equal(home.drawn(60000 + k), null, `held with ${k} of the lobby's frames drawn`);
  assert.equal(home.drawn(60000 + HOME.frames), 'lift');
});

test('home: what the parchment covers goes 0 → 1 over the cover, holds, and 1 → 0 over the lift', () => {
  const home = wayHome(0);
  let last = -1;
  for (let now = 0; now <= HOME.cover; now += 10) {
    const c = home.covered(now);
    assert.ok(c >= last && c >= 0 && c <= 1, `covering at ${now}`);
    last = c;
    home.drawn(now);
  }
  assert.equal(home.leg, 'hold');
  for (let k = 0; k < HOME.frames; k++) home.drawn(HOME.cover + HOME.hold + k);
  assert.equal(home.leg, 'lift');
  const lift = HOME.cover + HOME.hold + HOME.frames - 1;
  assert.equal(home.covered(lift), 1);
  assert.equal(home.covered(lift + HOME.lift / 2), 0.5);
  assert.equal(home.drawn(lift + HOME.lift), 'home');
  assert.equal(home.covered(lift + HOME.lift + 1), 0);
  assert.equal(home.drawn(lift + HOME.lift + 100), null, 'home, it is done');
});

test('home: the timings are the owner\'s: a quick cover, at least half a second held, a slower lift', () => {
  assert.ok(HOME.cover >= 200 && HOME.cover <= 300);
  assert.ok(HOME.hold >= 500);
  assert.ok(HOME.lift >= 300 && HOME.lift <= 400);
  assert.ok(HOME.frames >= 1);
});

test('outside the match, its course moves nothing', () => {
  for (const s of ['title', 'lobby', 'settings'] as const) {
    assert.equal(course(s, events({ how: 'shot', settled: true, over: true })), s);
  }
});
