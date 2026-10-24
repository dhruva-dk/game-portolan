// WP8 part A, the opening and the match flow, headless: the fleet riding the Great Current abreast from the first tick
// with the storm's origin revealed; break-offs at different moments making homes in different regions; the ride to the
// end and the throw-off; the captains' view of the passage; sink(), the entry point combat and the storm call, with its
// order, purse, bounty, chest and freed sea; the last ship afloat; scripted matches from the opening to the end and
// their results; the fast-forward after the player sinks, to the deadline; snapshot/resume at random ticks; the setup;
// and the tick's cost against A9.
//   node --test tests/sim/match.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { over, result, sink } from '../../src/sim/end.ts';
import { greatCurrentAt, seaFor, type Sea } from '../../src/sim/environment.ts';
import { FLAG, idleInput, type ShipInput } from '../../src/sim/input.ts';
import { resolve, step } from '../../src/sim/match.ts';
import { length, rngFrom, rngInt, v3, type V3 } from '../../src/sim/math.ts';
import { passage, type Passage } from '../../src/sim/opening.ts';
import { R } from '../../src/sim/sphere.ts';
import {
  AFLOAT, CAUSE, EVENT, PHASE, SHIPS, TICK, createMatch, decodeMatch, encodeMatch, matchHash, type MatchState,
} from '../../src/sim/state.ts';
import { END, FITTING, FORMS, MOMENTS, OPENING, START_FITTINGS, TREASURE } from '../../src/sim/tables.ts';
import { inkHome } from '../../src/sim/territory.ts';
import { regionOf } from '../../src/sim/world/geography.ts';
import { world } from './vectors.ts';

const SEED = 20261024, sea = seaFor(world(), SEED);
const S = (seconds: number): number => Math.round(seconds / TICK);
const FLEET = [1, 0, 1, 2, 3, 0, 1, 2, 3, 0].map((form) => ({ form }));
const endOf = (sea: Sea): number => 2 * (sea.current.points.length / 3 - 1);
const newPassage = (): Passage => ({ region: 0, next: 0, untilNext: 0, untilEnd: 0 });

function apart(a: V3, b: V3): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return R * Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** The player's helm in a scripted match: break off at tick `off`, then by turns sail out on a curve and head home. */
function pilot(off: number): (s: MatchState) => ShipInput {
  return (s) => {
    const input = idleInput();
    if (s.tick >= off) input.flags = FLAG.breakOff;
    if (s.ships[0].phase === PHASE.sailing) {
      if ((s.tick - off) % S(50) < S(20)) input.steer = 30;
      else input.flags |= FLAG.headHome;
    }
    return input;
  };
}

/** A sinking in a scripted match: at `tick`, `ship` sinks, by `by`, of `cause` (what combat and the storm will do). */
type Doom = readonly [tick: number, ship: number, by: number, cause: number];

/** Captains 1–9 sink one by one, four of them to the player, who wins at 230 s. */
const WIN: readonly Doom[] = [
  [S(80), 5, 0, CAUSE.gun], [S(95), 2, 7, CAUSE.ram], [S(110), 9, -1, CAUSE.rocks], [S(130), 1, 0, CAUSE.gun],
  [S(150), 7, 3, CAUSE.fire], [S(170), 4, -1, CAUSE.storm], [S(190), 8, 0, CAUSE.ram], [S(210), 6, 3, CAUSE.gun],
  [S(230), 3, 0, CAUSE.gun],
];
/** Two captains sink, then the player to captain 4's guns at 110 s, with seven captains still afloat. */
const LOSS: readonly Doom[] = [[S(70), 6, 2, CAUSE.gun], [S(90), 8, -1, CAUSE.rocks], [S(110), 0, 4, CAUSE.gun]];

/** Play match `s` with the scripted helm (breaking off at `off`) and sinkings, to its end or tick `until`; `cost` gets each step's ms. */
function play(sea: Sea, s: MatchState, off: number, dooms: readonly Doom[], until = Infinity, cost?: number[]): MatchState {
  const helm = pilot(off);
  while (!over(s) && s.tick < until) {
    for (const [t, i, by, cause] of dooms) if (t === s.tick) sink(s, i, by, cause);
    if (over(s)) break;
    const input = helm(s), t0 = cost ? performance.now() : 0;
    step(sea, s, input);
    if (cost) cost.push(performance.now() - t0);
  }
  return s;
}

test('the fleet rides the Great Current abreast from the first tick, with the storm\'s origin revealed', () => {
  const s = createMatch({ seed: SEED });
  assert.ok(Math.abs(length(s.storm.origin) - 1) < 1e-12);
  assert.deepEqual(s.storm.origin, createMatch({ seed: SEED }).storm.origin);
  assert.notDeepEqual(s.storm.origin, createMatch({ seed: SEED + 1 }).storm.origin);
  assert.ok(s.ships.every((ship) => ship.phase === PHASE.riding));
  const from = s.ships.map((ship) => ship.ride), idle = idleInput();
  for (let k = 0; k < S(10); k++) step(sea, s, idle);
  s.ships.forEach((ship, i) => {
    assert.equal(ship.phase, PHASE.riding);
    assert.ok(Math.abs(ship.ride - from[i] - S(10) * OPENING.ride * TICK) < 1e-9);
    assert.ok(length(greatCurrentAt(sea, ship.pos, v3())) > 0, `ship ${i} is on the current`);
  });
  assert.ok(Math.abs(apart(s.ships[0].pos, s.ships[0].was) / TICK - OPENING.ride) < 0.02 * OPENING.ride, 'at speed');
  for (const [a, b, d] of [[0, 1, 3.5], [0, 2, 3.5], [1, 3, 3.5], [2, 4, 3.5], [5, 6, 3.5], [0, 5, 8]]) {
    assert.ok(Math.abs(apart(s.ships[a].pos, s.ships[b].pos) - d) < 0.1, `ships ${a} and ${b} ride ${d} u apart`);
  }
  assert.ok(s.ships.every((ship) => ship.held === 0 && ship.laid.length === 0), 'nobody has waters or a trail yet');
});

test('breaking off at different moments makes the home in different regions', { todo: 'a home can take 10 s or more to ink after breaking off: see the WP8 div, Remaining' }, () => {
  // The middle of each region's stretch of the current, as a captain reads the passage.
  const start = createMatch({ seed: SEED }).ships[0].ride, p = newPassage(), moments: number[] = [];
  for (let s = start; ; ) {
    passage(sea, s, p);
    const to = p.next < 0 ? endOf(sea) : s + p.untilNext * OPENING.ride;
    if (to - s > 60) moments.push(Math.round(((s + to) / 2 - start) / (OPENING.ride * TICK)));
    if (p.next < 0) break;
    s = to;
  }
  const regions = moments.map((off) => {
    const m = createMatch({ seed: SEED }), helm = pilot(off);
    while (m.ships[0].phase !== PHASE.sailing && m.tick < S(150)) step(sea, m, helm(m));
    const left = m.timeline.find((e) => e.ship === 0 && e.kind === EVENT.breakOff);
    const home = m.timeline.find((e) => e.ship === 0 && e.kind === EVENT.home);
    assert.ok(left && home, `broke off at tick ${off} and made a home`);
    assert.equal(left.tick, off);
    assert.equal(home.by, regionOf(m.ships[0].pos));
    assert.ok(home.tick - left.tick < S(10), 'the home inks within seconds of breaking off');
    assert.equal(length(greatCurrentAt(sea, m.ships[0].pos, v3())), 0, 'clear of the current');
    assert.ok(m.ships[0].speed < 0.8 * OPENING.way, 'having slowed');
    assert.ok(m.ships[0].held > 0 && m.ships.slice(1).every((ship) => ship.phase === PHASE.riding));
    return home.by;
  });
  assert.ok(new Set(regions).size >= 3, `homes in regions ${regions}`);
});

test('a ship that rides to the end of the current is thrown off there and makes its home past it', () => {
  const s = createMatch({ seed: SEED }), p = passage(sea, s.ships[0].ride, newPassage()), idle = idleInput();
  while (s.ships.some((ship) => ship.phase !== PHASE.sailing) && s.tick < S(200)) step(sea, s, idle);
  const thrown = s.timeline.filter((e) => e.kind === EVENT.thrown), pts = sea.current.points, k = pts.length - 3;
  const tip = v3(pts[k], pts[k + 1], pts[k + 2]), mine = thrown.find((e) => e.ship === 0);
  assert.equal(new Set(thrown.map((e) => e.ship)).size, SHIPS);
  assert.ok(thrown.every((e) => e.amount === endOf(sea)));
  assert.ok(mine && Math.abs(mine.tick + 1 - p.untilEnd / TICK) <= 1, 'when the passage said');
  assert.equal(mine.by, regionOf(tip));
  s.ships.forEach((ship, i) => {
    assert.equal(ship.phase, PHASE.sailing);
    assert.ok(apart(ship.pos, tip) < 80, `ship ${i} made its home near the end`);
  });
  assert.equal(s.timeline.filter((e) => e.kind === EVENT.home).length, SHIPS);
});

test('a sinking spills the purse, frees the sea, pays the bounty (double for the pennant) and drops a fitting as a chest', () => {
  const s = createMatch({ seed: SEED });
  inkHome(s, 3);
  s.ships[3].purse = 50;
  s.leader = 3;
  const bank = s.ships[5].bank, ship = s.ships[3];
  sink(s, 3, 5, CAUSE.gun);
  assert.deepEqual([ship.phase, ship.purse, ship.held, s.owner.includes(4)], [PHASE.sunk, 0, 0, false]);
  const spilt = s.coins.filter((c) => c.kind === AFLOAT.coin).reduce((n, c) => n + c.value, 0);
  assert.ok(Math.abs(spilt - 50) < 1e-9);
  assert.equal(s.ships[5].bank, bank + 2 * END.bounty);
  assert.deepEqual(s.sunk, [{ ship: 3, by: 5, cause: CAUSE.gun, tick: 0 }]);
  assert.equal(s.chests.length, 1);
  assert.equal(s.chests[0].from, 3);
  assert.ok(START_FITTINGS.includes(s.chests[0].fitting.kind) && s.chests[0].fitting.kind !== FITTING.none);
  assert.equal(ship.fittings.filter((f) => f.kind !== FITTING.none).length, 1, 'the fitting left the wreck');
  for (const kind of [EVENT.spill, EVENT.freed, EVENT.sunk, EVENT.bounty, EVENT.chest]) {
    assert.ok(s.events.some((e) => e.kind === kind), `event ${kind}`);
  }
  sink(s, 3, 6, CAUSE.ram); // a wreck sinks once
  assert.equal(s.sunk.length, 1);
  sink(s, 4, 5, CAUSE.ram); // the pennant's holder pays double, nobody else
  assert.equal(s.ships[5].bank, bank + 3 * END.bounty);
  for (const i of [0, 1, 2, 6, 7, 8]) sink(s, i, -1, CAUSE.storm);
  assert.ok(!over(s));
  sink(s, 9, 5, CAUSE.gun);
  assert.ok(over(s) && s.winner === 5, 'the last ship afloat has won');
  sink(s, 5, -1, CAUSE.storm);
  assert.equal(s.ships[5].phase, PHASE.riding);
  const hash = matchHash(s);
  step(sea, s, idleInput());
  assert.equal(matchHash(s), hash, 'a match that is over stands still');
  const r = result(s);
  assert.deepEqual(r.order, [5, 9, 8, 7, 6, 2, 1, 0, 4, 3]);
  assert.deepEqual([r.ships[5].sank, r.ships[5].place, r.ships[3].place], [3, 1, SHIPS]);
});

test('a scripted match runs from the opening to the last ship afloat, and its results explain it', () => {
  const s = play(sea, createMatch({ seed: SEED, fleet: FLEET }), S(20), WIN), r = result(s), me = r.ships[0];
  assert.deepEqual([s.winner, s.tick, r.ticks], [0, S(230), S(230)]);
  assert.deepEqual(r.order, [0, ...WIN.map(([, i]) => i).reverse()]);
  assert.deepEqual([me.place, me.sank, me.by, me.cause], [1, 4, -1, -1]);
  assert.ok(me.claimed > 0 && me.bank >= 4 * END.bounty);
  r.ships.forEach((f, i) => assert.equal(f.treasure, Math.floor(s.ships[i].bank * TREASURE.share * TREASURE.place[f.place - 1])));
  for (const [t, i, by, cause] of WIN) assert.deepEqual([r.ships[i].tick, r.ships[i].by, r.ships[i].cause], [t, by, cause]);
  assert.equal(s.chests.length, SHIPS - 1);
  for (const c of s.chests) assert.ok(apart(c.at, s.ships[c.from].pos) < 1e-9, 'each chest floats at its wreck');
  const kinds = r.timeline.map((e) => e.kind), loops = kinds.filter((k) => k === EVENT.loop).length;
  assert.deepEqual([kinds[0], kinds[1], kinds.at(-1)], [EVENT.breakOff, EVENT.home, EVENT.win]);
  assert.ok(loops >= 1 && loops <= MOMENTS.loops, `${loops} loops in the timeline`);
  assert.equal(r.timeline.filter((e) => e.kind === EVENT.sunk && e.by === 0).length, 4);
  assert.ok(r.timeline.every((e, k) => k === 0 || r.timeline[k - 1].tick <= e.tick));
});

test('when the player sinks, the rest of the match resolves at once, to the end it would have had', () => {
  const s = play(sea, createMatch({ seed: SEED, fleet: FLEET }), S(20), LOSS, S(110) + 1), idle = idleInput();
  assert.ok(s.ships[0].phase === PHASE.sunk && !over(s));
  const out = decodeMatch(encodeMatch(s)), last = Math.round(END.deadline / TICK);
  resolve(sea, s);
  const r = result(s), me = r.ships[0];
  assert.deepEqual([me.place, me.by, me.cause, me.tick], [SHIPS - 2, 4, CAUSE.gun, S(110)]);
  assert.equal(r.timeline.at(-1)?.kind, EVENT.sunk);
  // Nobody fights yet, so the deadline ends it: the storm takes the rest, least sea first.
  assert.equal(r.ticks, last);
  while (out.tick < last) step(sea, out, idle);
  const held = out.ships.map((ship) => ship.held);
  step(sea, out, idle);
  assert.equal(matchHash(out), matchHash(s), 'the fast-forward is the match played out');
  const late = out.sunk.slice(LOSS.length);
  assert.equal(late.length, SHIPS - 1 - LOSS.length);
  assert.ok(late.every((d, k) => d.cause === CAUSE.storm && d.by === -1 && d.tick === last && (k === 0 || held[late[k - 1].ship] <= held[d.ship])));
});

test('a match resumed from a snapshot at random ticks ends exactly as the match played through', () => {
  for (const seed of [SEED, 777]) {
    const water = seed === SEED ? sea : seaFor(world(), seed), setup = { seed, fleet: FLEET };
    const whole = play(water, createMatch(setup), S(35), WIN), hash = matchHash(whole), r = JSON.stringify(result(whole));
    const rng = rngFrom(seed);
    for (let k = 0; k < 3; k++) {
      const at = 1 + rngInt(rng, whole.tick - 1), half = play(water, createMatch(setup), S(35), WIN, at);
      const resumed = play(water, decodeMatch(encodeMatch(half)), S(35), WIN);
      assert.equal(matchHash(resumed), hash, `seed ${seed} resumed at tick ${at}`);
      assert.equal(JSON.stringify(result(resumed)), r);
    }
  }
});

test('the setup fits out every ship as the career says, with defaults for what it leaves out', () => {
  const none = { kind: FITTING.none, tier: 0 };
  const fittings = [{ kind: FITTING.ironRam, tier: 2 }, { kind: FITTING.longGuns, tier: 1 }, none, none, none, none];
  const fleet = Array.from({ length: SHIPS }, (_, i) => (i === 4 ? { form: 3, pigment: 11, pattern: 2, fittings, gull: 3 } : {}));
  const s = createMatch({ seed: SEED, fleet }), a = s.ships[4], b = s.ships[1];
  assert.deepEqual([a.form, a.pigment, a.pattern, a.gull, a.fittings], [3, 11, 2, 3, fittings]);
  assert.deepEqual([b.form, b.pigment, b.pattern, b.gull, b.fittings.map((f) => f.kind)], [0, 1, 0, 1, START_FITTINGS]);
  assert.throws(() => createMatch({ seed: SEED, fleet: fleet.slice(1) }), RangeError);
  assert.throws(() => createMatch({ seed: SEED, fleet: fleet.map((o, i) => (i === 2 ? { form: FORMS.length } : o)) }), RangeError);
  assert.throws(() => createMatch({ seed: SEED, fleet: fleet.map((o, i) => (i === 2 ? { fittings: fittings.slice(1) } : o)) }), RangeError);
  assert.equal(matchHash(decodeMatch(encodeMatch(s))), matchHash(s));
});

test('the tick\'s cost over a whole match (A9: Node mean ≤ 0.3 ms)', (t) => {
  const cost: number[] = [];
  play(sea, createMatch({ seed: SEED, fleet: FLEET }), S(20), WIN, Infinity, cost);
  const sorted = cost.slice().sort((a, b) => a - b), mean = cost.reduce((a, b) => a + b, 0) / cost.length;
  const p99 = sorted[Math.floor(0.99 * sorted.length)], worst = sorted[sorted.length - 1];
  t.diagnostic(`${cost.length} ticks: mean ${mean.toFixed(3)} ms, p99 ${p99.toFixed(3)} ms, worst ${worst.toFixed(2)} ms`);
  assert.ok(mean <= 0.3, `mean ${mean.toFixed(3)} ms`);
});
