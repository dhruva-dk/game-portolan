import { cpuNow } from '../cpu.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sink } from '../../src/sim/end.ts';
import { seaFor } from '../../src/sim/environment.ts';
import { bound, callPrice, gullEyes, gullMarks, gulls } from '../../src/sim/gull.ts';
import { FLAG, idleInput, type ShipInput } from '../../src/sim/input.ts';
import { afloatChest, items, poolTop } from '../../src/sim/items.ts';
import { step } from '../../src/sim/match.ts';
import { addScaled, cross, dot, normalize, v3 } from '../../src/sim/math.ts';
import { R, TERRITORY, cellOf, horizonDistance } from '../../src/sim/sphere.ts';
import {
  CAUSE, EVENT, FLIGHT, PHASE, SHIPS, TICK, createMatch, decodeMatch, encodeMatch, matchHash, type Happening, type MatchState,
  type Outfit,
} from '../../src/sim/state.ts';
import { FITTING, GULL, HOME, PERK } from '../../src/sim/tables.ts';
import { breakTrail } from '../../src/sim/territory.ts';
import { newSight, survey } from '../../src/sim/visibility.ts';
import { scriptedInputs, world } from './vectors.ts';

const SEED = 20261024, sea = seaFor(world(), SEED), SIGHTS = Array.from({ length: SHIPS }, newSight);
const NONE = { kind: FITTING.none, tier: 0 }, TOP = { talons: 4, wings: 4, eye: 4, beak: 3, dive: 3 };
const S = (seconds: number): number => Math.round(seconds / TICK);
const near = (a: number, b: number, eps = 1e-9): void => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const perk = (name: string): number => sea.marks[sea.geo.landmarks.findIndex((l) => l.perk === name)];

const inputs = (player: Partial<ShipInput> = {}, rival: Partial<ShipInput> = {}): ShipInput[] =>
  Array.from({ length: SHIPS }, (_, i) => ({ ...idleInput(), ...(i === 0 ? player : i === 1 ? rival : {}) }));
const IDLE = inputs(), CALL = inputs({ flags: FLAG.callGull });
const DIVE = (aim = -1): ShipInput[] => inputs({ flags: FLAG.dive, aim });

function duel(gull: Outfit['gull'] = {}, rank = 1): MatchState {
  const s = createMatch({ seed: SEED, fleet: Array.from({ length: SHIPS }, (_, i) => (i === 0 ? { gull } : {})), rank });
  s.ships.forEach((ship, i) => {
    ship.phase = i < 2 ? PHASE.sailing : PHASE.sunk;
    ship.speed = 0;
  });
  s.ships[0].bank = 1000;
  return s;
}

function place(s: MatchState, j: number, ahead: number, abeam = 0): void {
  const a = s.ships[0], b = s.ships[j], star = cross(v3(), a.head, a.pos);
  normalize(addScaled(b.pos, addScaled(b.pos, a.pos, a.head, ahead / R), star, abeam / R));
  normalize(addScaled(b.head, a.head, b.pos, -dot(a.head, b.pos)));
}

function tick(s: MatchState, ins: ShipInput[] = IDLE): void {
  s.events.length = 0;
  survey(sea, s, SIGHTS, gullEyes(s));
  items(sea, s, ins, SIGHTS);
  gulls(sea, s, ins, SIGHTS);
  s.tick++;
}

function run(s: MatchState, seconds: number, ins: ShipInput[] = IDLE): Happening[] {
  const seen: Happening[] = [];
  for (let k = 0; k < S(seconds); k++) {
    tick(s, ins);
    seen.push(...s.events);
  }
  return seen;
}

function until(s: MatchState, kind: number, ins: ShipInput[] = IDLE, most = S(60)): number {
  for (let k = 1; k <= most; k++) {
    tick(s, ins);
    if (s.events.some((e) => e.kind === kind)) return k;
  }
  return -1;
}

const FLIGHT_EVENTS: number[] = [EVENT.departed, EVENT.returning, EVENT.landed, EVENT.chestLost];

function fetch(s: MatchState): { ticks: number; kinds: number[] } {
  const kinds: number[] = [];
  for (let k = 1; k <= S(60); k++) {
    tick(s);
    for (const e of s.events) if (e.ship === 0 && FLIGHT_EVENTS.includes(e.kind)) kinds.push(e.kind);
    if (kinds.includes(EVENT.landed) || kinds.includes(EVENT.chestLost)) return { ticks: k, kinds };
  }
  return { ticks: -1, kinds };
}

test('a call costs its price at sea, less in home waters, half holding Spice Harbour; paid from the bank, then the purse', () => {
  const s = duel(), ship = s.ships[0], home = cellOf(TERRITORY, ship.pos), spice = perk('spiceHarbour');
  assert.equal(callPrice(sea, s, 0), GULL.price);
  s.owner[home] = 1;
  near(callPrice(sea, s, 0), GULL.price * HOME.gull);
  s.owner[spice] = 1;
  near(callPrice(sea, s, 0), GULL.price * HOME.gull * PERK.spiceHarbour);
  s.owner[home] = 0;
  near(callPrice(sea, s, 0), GULL.price * PERK.spiceHarbour);
  s.owner[spice] = 0;
  ship.bank = 20;
  ship.purse = 50;
  tick(s, CALL);
  const called = s.events.find((e) => e.kind === EVENT.called);
  assert.equal(called?.amount, GULL.price);
  assert.equal(ship.gull.flight, FLIGHT.out);
  near(ship.bank, 0);
  near(ship.purse, 70 - GULL.price);
  const poor = duel();
  poor.ships[0].bank = GULL.price - 1;
  tick(poor, CALL);
  assert.ok(!poor.events.some((e) => e.kind === EVENT.called));
  assert.notEqual(poor.ships[0].gull.flight, FLIGHT.out);
  assert.equal(poor.ships[0].bank, GULL.price - 1);
});

test('a called chest arrives in GULL.flight s by Wings, twice as fast holding the Sandbar Light: off, away, back, on deck', () => {
  const took: number[] = [];
  for (let wings = 0; wings <= GULL.levels.wings; wings++) {
    for (const sandbar of [false, true]) {
      const s = duel({ wings });
      if (sandbar) s.owner[perk('sandbarLight')] = 1;
      tick(s, CALL);
      const { ticks, kinds } = fetch(s), want = GULL.flight[wings] / (sandbar ? PERK.sandbarLight : 1) / TICK;
      assert.ok(Math.abs(ticks - want) <= 1, `wings ${wings} sandbar ${sandbar}: ${ticks} ticks, not ${want}`);
      assert.deepEqual(kinds, [EVENT.departed, EVENT.returning, EVENT.landed]);
      assert.equal(s.ships[0].offer.length, 3, 'opened on deck');
      assert.ok(s.ships[0].gull.flight <= FLIGHT.wheel, 'back on its perch');
      if (!sandbar) took.push(ticks);
    }
  }
  for (let w = 1; w < took.length; w++) assert.ok(took[w] < took[w - 1], 'each Wings level is faster');
});

test('the chest\'s tier is drawn as the gull sets out, never above its Talons or the rank\'s pool, and shows as it returns', () => {
  for (const rank of [1, 3, 9]) {
    for (let talons = 0; talons <= GULL.levels.talons; talons++) {
      const s = duel({ talons }, rank), g = s.ships[0].gull, most = Math.min(talons, poolTop(rank));
      s.ships[0].bank = 1e9;
      let top = 0;
      for (let n = 0; n < 800; n++) {
        tick(s, CALL);
        assert.ok(g.tier >= 0 && g.tier <= most, `rank ${rank} talons ${talons}: tier ${g.tier}`);
        top = Math.max(top, g.tier);
        g.flight = FLIGHT.mast;
      }
      assert.equal(top, most, `rank ${rank} talons ${talons} reaches its top tier`);
    }
  }
  const s = duel(TOP, 9);
  tick(s, CALL);
  const tier = s.ships[0].gull.tier;
  until(s, EVENT.returning);
  assert.equal(s.events.find((e) => e.kind === EVENT.returning)?.amount, tier);
  assert.equal(s.ships[0].gull.flight, FLIGHT.back);
  assert.equal(s.ships[0].gull.tier, tier);
});

test('a ship sunk before its chest lands loses it to the sea where it went down, and another ship takes it', () => {
  const s = duel();
  place(s, 1, 40);
  tick(s, CALL);
  const tier = s.ships[0].gull.tier;
  run(s, 3);
  sink(s, 0, 1, CAUSE.gun);
  const { kinds } = fetch(s);
  assert.deepEqual(kinds.slice(-1), [EVENT.chestLost]);
  const lost = s.chests.find((c) => c.from === -1 && c.fitting.kind === FITTING.none);
  assert.ok(lost);
  assert.equal(lost.tier, tier);
  near(dot(lost.at, s.ships[0].pos), 1, 1e-12);
  place(s, 1, 0);
  const seen = [...run(s, TICK), ...run(s, 3 * TICK, inputs({}, { chestPick: 0 }))];
  assert.ok(!s.chests.some((c) => c.from === -1 && c.fitting.kind === FITTING.none), 'taken');
  assert.ok(seen.some((e) => e.kind === EVENT.opened && e.ship === 1 && e.by === -1));
});

test('rivals in sight of a gull aloft see it and where it is bound; away over the horizon or on its masthead, nobody does', () => {
  const s = duel(), g = s.ships[0].gull;
  place(s, 1, 30);
  tick(s);
  assert.equal(SIGHTS[1].gulls & 1, 0, 'on its masthead');
  tick(s, CALL);
  const by: Record<number, number[]> = {};
  for (let k = 0; k < S(GULL.flight[0]) - 2; k++) {
    const flight = g.flight;
    tick(s);
    (by[flight] ??= []).push(SIGHTS[1].gulls & 1);
    if (flight === FLIGHT.back) assert.equal(bound(s, 0), s.ships[0].pos);
  }
  for (const f of [FLIGHT.out, FLIGHT.back, FLIGHT.circle]) assert.ok(by[f].every((x) => x === 1), `seen in flight ${f}`);
  assert.ok(by[FLIGHT.away].every((x) => x === 0), 'unseen away');
  const far = duel();
  place(far, 1, 300);
  tick(far, CALL);
  assert.ok(run(far, GULL.flight[0] - 1).length > 0 && SIGHTS[1].gulls === 0, 'too far to see');
});

test('an Eye-trained gull scouts ahead: rivals beyond the deck\'s horizon come into sight, and loot is marked at a growing range', () => {
  const sees = (eye: number, ahead: number): boolean => {
    const s = duel({ eye });
    place(s, 1, ahead);
    tick(s);
    return (SIGHTS[0].ships & 2) !== 0;
  };
  assert.ok(!sees(0, 100) && sees(4, 100));
  for (let eye = 1; eye <= GULL.levels.eye; eye++) {
    const d = GULL.eye.ahead[eye] + horizonDistance(GULL.eye.height[eye]) - 1;
    for (const level of [eye - 1, eye]) {
      const s = duel({ eye: level }), a = s.ships[0], finds: number[] = [], chests: number[] = [];
      afloatChest(s, normalize(addScaled(v3(), a.pos, a.head, d / R)), 0, NONE, 1);
      gullMarks(sea, s, 0, finds, chests);
      assert.equal(chests.length, level === eye ? 1 : 0, `a chest ${d} u ahead, Eye ${level}`);
    }
  }
  const s = duel();
  place(s, 1, 150);
  tick(s);
  place(s, 1, 25);
  tick(s);
  assert.ok(s.events.some((e) => e.kind === EVENT.spotted && e.ship === 0 && e.by === 1), 'it calls at a rival new to sight');
});

test('Beak snatches back its share of a purse spilled at a break into the bank, by level', () => {
  for (let beak = 0; beak <= GULL.levels.beak; beak++) {
    const s = duel({ beak }), a = s.ships[0], c = cellOf(TERRITORY, a.pos);
    a.bank = 0;
    a.purse = 100;
    a.laid.push(c);
    s.trail[c] = 1;
    breakTrail(s, 0, 1, c);
    gulls(sea, s, IDLE, SIGHTS);
    const snatch = s.events.find((e) => e.kind === EVENT.snatch);
    near(a.bank, 100 * GULL.beak[beak]);
    near(s.coins.reduce((n, k) => n + k.value, 0), 100 * (1 - GULL.beak[beak]));
    assert.equal(snatch?.amount ?? 0, a.bank);
    if (snatch) assert.equal(snatch.by, 1);
  }
});

test('Dive strikes the nearest rival on a tap, or the one aimed by hand: checked, revealed, and again only after its cooldown', () => {
  const untrained = duel();
  place(untrained, 1, 20);
  tick(untrained);
  tick(untrained, DIVE());
  assert.ok(!untrained.events.some((e) => e.kind === EVENT.dive));
  let last = Infinity;
  for (let level = 1; level <= GULL.levels.dive; level++) {
    const s = duel({ dive: level }), b = s.ships[1], g = s.ships[0].gull;
    place(s, 1, 20);
    tick(s);
    b.speed = 4;
    tick(s, DIVE());
    assert.equal(s.events.find((e) => e.kind === EVENT.dive)?.by, 1);
    near(b.speed, 4 * GULL.dive.check);
    assert.equal(g.prey, 1);
    tick(s);
    assert.ok((SIGHTS[0].marks & 2) !== 0, 'revealed on its chart');
    run(s, GULL.dive.hold + 0.1);
    assert.ok(g.flight <= FLIGHT.wheel && (SIGHTS[0].marks & 2) === 0, 'the hold ends');
    const again = 1 + S(GULL.dive.hold + 0.1) + until(s, EVENT.dive, DIVE());
    assert.ok(Math.abs(again - S(GULL.dive.cool[level])) <= 2, `level ${level}: again after ${again} ticks`);
    assert.ok(again < last, 'each level cools faster');
    last = again;
  }
  const s = duel({ dive: 1 });
  s.ships[2].phase = PHASE.sailing;
  place(s, 2, 12);
  place(s, 1, 25, 8);
  tick(s);
  tick(s, DIVE());
  assert.equal(s.events.find((e) => e.kind === EVENT.dive)?.by, 2, 'a tap takes the nearest');
  const hand = duel({ dive: 1 });
  hand.ships[2].phase = PHASE.sailing;
  place(hand, 2, 12);
  place(hand, 1, 25, 8);
  tick(hand);
  tick(hand, DIVE(cellOf(TERRITORY, hand.ships[1].pos)));
  assert.equal(hand.events.find((e) => e.kind === EVENT.dive)?.by, 1, 'a drag takes the one aimed at');
});

test('the gull rides the masthead at ease and wheels overhead in danger: a low hull, a rival near', () => {
  const s = duel(), g = s.ships[0].gull, full = s.ships[0].hull;
  place(s, 1, 150);
  tick(s);
  assert.equal(g.flight, FLIGHT.mast);
  s.ships[0].hull = full * 0.3;
  tick(s);
  assert.equal(g.flight, FLIGHT.wheel);
  s.ships[0].hull = full;
  place(s, 1, 20);
  tick(s);
  assert.equal(g.flight, FLIGHT.wheel);
});

test('determinism: one match with gulls called and diving hashes the same twice, and resumes from a snapshot with a gull in flight', () => {
  const play = (): MatchState => {
    const s = createMatch({ seed: SEED, fleet: Array.from({ length: SHIPS }, () => ({ gull: TOP })) });
    s.ships.forEach((ship) => (ship.bank = 500));
    return s;
  };
  const a = play(), b = play(), kinds = new Set<number>();
  for (const input of scriptedInputs(SEED + 2, S(120))) {
    step(sea, a, input);
    step(sea, b, input);
    for (const e of a.events) kinds.add(e.kind);
  }
  assert.equal(matchHash(a), matchHash(b));
  assert.ok(kinds.has(EVENT.called), 'the player called its gull');
  const s = duel({ wings: 1 });
  place(s, 1, 30);
  tick(s, CALL);
  run(s, 4);
  assert.ok(s.ships[0].gull.flight >= FLIGHT.out && s.ships[0].gull.flight <= FLIGHT.circle);
  const r = decodeMatch(encodeMatch(s));
  assert.equal(matchHash(r), matchHash(s));
  run(s, 10);
  run(r, 10);
  assert.equal(matchHash(r), matchHash(s));
  assert.equal(r.ships[0].offer.length, 3);
});

test('the tick\'s cost with every gull trained to the top, scouting, called and diving stays within A9 (Node mean ≤ 0.3 ms)', (t) => {
  const s = createMatch({ seed: SEED, fleet: Array.from({ length: SHIPS }, () => ({ gull: TOP })) }), cost: number[] = [];
  s.ships.forEach((ship) => {
    ship.phase = PHASE.sailing;
    ship.bank = 1e6;
  });
  for (const input of scriptedInputs(SEED + 3, S(30))) {
    const t0 = cpuNow();
    step(sea, s, input);
    cost.push(cpuNow() - t0);
  }
  const warm = cost.slice(60).sort((x, y) => x - y), mean = warm.reduce((x, y) => x + y, 0) / warm.length;
  t.diagnostic(`step mean ${mean.toFixed(3)} ms, p99 ${warm[Math.floor(warm.length * 0.99)].toFixed(3)} ms over ${warm.length} ticks`);
  assert.ok(mean <= 0.3, `mean ${mean} ms`);
});
