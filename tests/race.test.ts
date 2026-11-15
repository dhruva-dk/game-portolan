// How a race ends and what it comes to (#58 step 5): over once every ship afloat is of one side (or none is); the
// finishing order; runRace, pure, on a flat sea, and the live path (a wavy sea, her helm in hand, the match's course
// stepped as the referee steps it) agreeing with it; forfeit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RaceCard, RaceResult } from '../src/race.ts';
import { STEP } from '../src/sim/fixed.ts';
import { PLAYER, oneSide, startMatch, stepMatch } from '../src/sim/match.ts';
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { deal } from '../src/play/deal.ts';
import { matchOf, runRace, type Hands } from '../src/play/race.ts';
import { finishing } from '../src/play/result.ts';
import { createState } from '../src/play/state.ts';
import { SEED, createPlanet } from '../src/world/planet.ts';
import { frameAt, type Vec3 } from '../src/world/sphere.ts';
import type { Hull } from '../src/world/swell.ts';

const planet = createPlanet(SEED), depth = (p: Vec3) => -planet.height(p);
const waters = { chart: chart(depth), water: berthing(depth) };
/** A race of ten, its storm four times as quick. */
const card = (seed: number, change: (c: RaceCard) => RaceCard = (c) => c): RaceCard => {
  const c = deal(seed, 10);
  return change({ ...c, rules: { ...c.rules, storm: { pace: 0.25 } } });
};
/** The points a result gives each ship: a point for each sinking credited to her (the card's rules). */
const points = (r: RaceResult) => r.order.map((id) => r.sinkings.filter((s) => s.by === id).length);

test('the finishing order: the afloat first, by sinkings credited, their share, their id; then the sunk, the last first', () => {
  const sunk = [{ id: 3, by: 5, cause: 'shot' as const, time: 1 }, { id: 4, by: 2, cause: 'ram' as const, time: 2 }, { id: 0, by: 5, cause: 'storm' as const, time: 3 }];
  const share = (id: number) => ({ 1: 0.01, 2: 0.02, 5: 0, 6: 0.02 })[id] ?? 0;
  // 5 sank two, 2 one; 6 and 1 none, 6 holding more
  assert.deepEqual(finishing([1, 2, 5, 6], sunk, share), [5, 2, 6, 1, 0, 4, 3]);
  // tied in all but id
  assert.deepEqual(finishing([7, 6], [], () => 0), [6, 7]);
});

test('a race run whole: over with one side afloat, every ship placed once, the hits adding up, the same twice', () => {
  const c = card(31), r = runRace(c, planet, waters);
  assert.deepEqual([...r.order].sort((a, b) => a - b), c.ships.map((s) => s.id));
  const afloat = r.order.slice(0, c.ships.length - r.sinkings.length);
  assert.ok(oneSide(afloat, (id) => id >> 1), `${afloat} afloat`);
  assert.deepEqual(r.order.slice(afloat.length), r.sinkings.map((s) => s.id).reverse());
  assert.ok(r.sinkings.every((s, i) => i === 0 || s.second >= r.sinkings[i - 1].second));
  assert.ok(r.sinkings.every((s) => s.by === null || s.by >> 1 !== s.id >> 1), 'no ship sunk by her own side');
  const sum = (k: 'fired' | 'landed' | 'taken') => r.hits.reduce((a, h) => a + h[k], 0);
  assert.equal(sum('landed'), sum('taken'));
  assert.ok(sum('landed') > 0 && sum('fired') >= sum('landed'), `${sum('fired')} fired, ${sum('landed')} landed`);
  assert.equal(r.seaHeld.length, c.ships.length);
  assert.deepEqual([r.seed, r.league, r.round], [c.seed, c.league, c.round]);
  assert.deepEqual(runRace(c, planet, waters), r, 'the same card, the same result');
});

test("a race's parts fail and its flights work (#58 steps 7, 8): the faults and stops in the result, the same twice", () => {
  // parts worn and unreliable, so some fail within the race
  const c = card(31, (k) => ({ ...k, ships: k.ships.map((s) => ({ ...s, parts: s.parts.map((p) => ({ ...p, reliability: 0.3, condition: 0.72 })) })) }));
  const r = runRace(c, planet, waters);
  assert.ok(r.faults.length > 0, 'parts failed');
  assert.ok(r.faults.every((f) => f.id >= 0 && f.id < c.ships.length && f.second >= 0 && f.second <= r.seconds));
  assert.ok(r.stops.length > 0, `${r.stops.length} jobs begun by the flights`);
  assert.deepEqual(runRace(c, planet, waters), r, 'the same card, the same result');
});

test('the live path, on a wavy sea with her helm in hand, ends as runRace does with her helm replayed', () => {
  const c = card(47);
  // a sea that heaves and rolls (no rule reads it: it only lifts the ships as drawn)
  const wavy: Hull = (at, heading, reach, rail, time) => {
    const w = Math.sin(time * 1.3 + at[0] * 40) * 1.5;
    return { bow: w + 0.3 * reach * heading[1], stern: -w, port: 0.4 * w + rail * 0.01, starboard: -0.4 * w };
  };
  const m = matchOf(c, planet), state = createState(planet, wavy, waters, m);
  state.start(m);
  // her hands: hard over this way and that, now and then a gust or a slot tapped; each step's recorded
  const hands: Hands[] = [];
  const her = (step: number): Hands => {
    const v = state.mine(), f = v && frameAt(v.ship.at), turn = Math.floor(step / 90) % 3 - 1;
    const course = f ? ([f.east[0] * turn + f.north[0], f.east[1] * turn + f.north[1], f.east[2] * turn + f.north[2]] as Vec3) : null;
    return { helm: { course, throttle: v ? 1 : 0 }, gun: { aim: null, fire: false }, ask: { tap: null, arm: step % 200 === 50 ? 0 : null, gust: step % 300 === 120, take: null } };
  };
  let course = startMatch(), step = 0;
  for (; !course.over && step * STEP < 2000; step++) {
    const h = her(step);
    hands.push(h);
    state.advance(h.helm, h.gun, h.ask);
    course = stepMatch(course, { sinkings: state.sinkings(), alive: state.alive(), share: state.share(PLAYER), sideOf: state.sideOf }, STEP);
  }
  const live = state.result();
  assert.ok(live && course.over, 'the live race ended');
  // the referee's course ends the step the result is kept
  assert.equal(live.seconds, state.time());
  const replayed = runRace(c, planet, waters, (k) => hands[k] ?? hands[hands.length - 1]);
  assert.deepEqual(replayed.order, live.order);
  assert.deepEqual(points(replayed), points(live));
  assert.deepEqual(replayed, live);
  // won is the race ended with her afloat
  assert.equal(course.phase === 'won', !live.sinkings.some((s) => s.id === PLAYER));
});

test('forfeit: her ship sunk at second 0 by no one, and last; a bot\'s forfeit is not taken', () => {
  const forfeit = (ids: number[]) => (c: RaceCard): RaceCard => ({ ...c, ships: c.ships.map((s) => (ids.includes(s.id) ? { ...s, forfeit: true } : s)) });
  const r = runRace(card(53, forfeit([PLAYER])), planet, waters);
  assert.deepEqual(r.sinkings[0], { id: PLAYER, by: null, cause: 'forfeit', second: 0 });
  assert.equal(r.order.at(-1), PLAYER);
  assert.ok(r.sinkings.slice(1).every((s) => s.cause !== 'forfeit'));
  const bot = runRace(card(53, forfeit([3])), planet, waters);
  assert.ok(bot.sinkings.every((s) => s.cause !== 'forfeit'));
});
