import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD, FIGHTS, cardLine, cardLines, learn, recordLine } from '../../src/career/learn.ts';
import { draw } from '../../src/career/league.ts';
import { applyResult } from '../../src/career/progress.ts';
import { GENTLE, toSetup } from '../../src/career/setup.ts';
import { CHART_CELLS, LEAGUE, LEARNING, careerHash, decodeCareer, encodeCareer, newCareer, newHabits, type Career } from '../../src/career/state.ts';
import { LESSON, chartInked, habitsOf, newVoyage, observe, toLetter, type Voyage } from '../../src/career/voyage.ts';
import { GLYPHS } from '../../src/lettering/glyphs.ts';
import { result, sink, type Finish, type MatchResult } from '../../src/sim/end.ts';
import { seaFor, type Sea } from '../../src/sim/environment.ts';
import { idleInput } from '../../src/sim/input.ts';
import { startingFittings } from '../../src/sim/items.ts';
import { step } from '../../src/sim/match.ts';
import { CAUSE, EVENT, PHASE, SHIPS, createMatch, type Expect, type MatchState, type Mind } from '../../src/sim/state.ts';
import { FITTING } from '../../src/sim/tables.ts';
import { REGIONS } from '../../src/sim/world/regions.ts';
import { world } from '../sim/vectors.ts';

function finish(sinks: Record<number, number> = {}): MatchResult {
  const order = [1, 2, 3, 4, 0, 5, 6, 7, 8, 9];
  const ships = Array.from({ length: SHIPS }, (_, ship): Finish => ({
    ship, place: order.indexOf(ship) + 1, tick: 0, by: sinks[ship] ?? -1, cause: ship in sinks ? CAUSE.gun : -1, claimed: 1000, sank: 0, bank: 0, treasure: 0,
  }));
  for (const by of Object.values(sinks)) ships[by].sank++;
  return { order, ships, timeline: [], ticks: 0 };
}

function voyage(h: { breakOff?: number; loop?: number; raids?: number; run?: number; storm?: number; fittings?: number[] }): Voyage {
  const v = newVoyage();
  v.samples = 100;
  if (h.breakOff !== undefined) v.breakOff = h.breakOff;
  if (h.loop !== undefined) [v.sea, v.seaSq] = [Math.round(Math.PI * h.loop * h.loop), Math.round(Math.PI * h.loop * h.loop) ** 2];
  v.raids = h.raids ?? 0;
  if (h.run !== undefined) [v.hits, v.runs, v.runHull] = [1, h.run > 0 ? 1 : 0, h.run];
  if (h.storm !== undefined) [v.storm, v.margin] = [1, h.storm];
  for (const k of h.fittings ?? []) v.fittings[k] = 100;
  return v;
}

const lit = (bytes: Uint8Array): number => {
  let n = 0;
  for (const b of bytes) for (let x = b; x; x &= x - 1) n++;
  return n;
};
const sure = (e: Expect, value: number): boolean => e.confidence >= LEARNING.known && e.value === value;
const knowing = (c: Career, knows: (m: Mind) => boolean): number => (toSetup(c, 1).setup.minds ?? []).filter((m) => m !== null && knows(m)).length;

test('learning moves 40% of the way each match together and fades 15% each match apart', () => {
  assert.deepEqual([LEARNING.learn, LEARNING.fade, LEARNING.known], [40, 15, 500]);
  const h = newHabits(), seen = habitsOf(voyage({ breakOff: 3, loop: 40 })), path: number[] = [];
  for (let k = 0; k < 5; k++) {
    learn(h, seen);
    path.push(h.breakOff[3]);
  }
  assert.deepEqual(path, [400, 640, 784, 870, 922]);
  assert.equal(h.loopU, 40);
  const apart = structuredClone(h), faded: number[] = [];
  for (let k = 0; k < 5; k++) {
    learn(apart, null);
    faded.push(apart.breakOff[3]);
  }
  assert.deepEqual(faded, [784, 667, 567, 482, 410]);
  const changed = habitsOf(voyage({ breakOff: 5, loop: 10 }));
  learn(h, changed);
  learn(h, changed);
  assert.deepEqual([h.breakOff[3], h.breakOff[5], h.loopU], [333, 640, 21]);
});

test('a scripted habit is known within five matches and forgotten within five after the player changes it', () => {
  let c = applyResult(newCareer(7), finish());
  const habit = voyage({ breakOff: 2, loop: 40, raids: 4, run: 70, storm: -10, fittings: [FITTING.longGuns] });
  for (let k = 0; k < 5; k++) c = applyResult(c, finish(), habit);
  assert.ok(knowing(c, (m) => sure(m.breakOff, 2)) >= 5);
  assert.ok(knowing(c, (m) => sure(m.loop, 40) && sure(m.raids, 40) && sure(m.run, 70) && sure(m.storm, -10)) >= 5);
  assert.ok(knowing(c, (m) => m.fittings[0] === FITTING.longGuns) >= 5);
  const changed = voyage({ breakOff: 6, loop: 8, raids: 0, run: 0, storm: 30 });
  for (let k = 0; k < 5; k++) c = applyResult(c, finish(), changed);
  for (const m of c.minds) {
    const h = m.habits;
    assert.ok(h.breakOff[2] < LEARNING.known && h.loop[3] < LEARNING.known && h.raid[2] < LEARNING.known);
    assert.ok(h.run[2] < LEARNING.known && h.storm[0] < LEARNING.known && h.fittings[FITTING.longGuns] < LEARNING.known);
  }
  assert.ok(knowing(c, (m) => sure(m.breakOff, 6) && sure(m.run, 0) && m.fittings.length === 0) >= 5);
  assert.ok(c.profile.breakOff[6] >= LEARNING.known && c.profile.breakOff[2] < LEARNING.known);
});

test('a captain the player sank hunts it harder in their next match together, and its card keeps the record', () => {
  let c = applyResult(newCareer(3), finish());
  const drawn = draw(c), victim = drawn[2], killer = drawn[4], before = c.minds[victim].shared;
  c = applyResult(c, finish({ 3: 0, 0: 5 }));
  const { setup, drawn: next } = toSetup(c, 2);
  assert.ok(next.includes(victim));
  assert.equal(setup.minds?.[next.indexOf(victim) + 1]?.grudge, 1);
  assert.deepEqual([c.minds[victim].shared, c.minds[victim].sank, c.minds[victim].sunk, c.minds[victim].grudge], [before + 1, 0, 1, 1]);
  assert.equal(c.minds[killer].sank, 1);
  assert.equal(cardLine(c, victim), CARD.grudge[0]);
  assert.equal(recordLine(c, killer), CARD.record(1, 0, c.minds[killer].shared));
  c = applyResult(c, finish());
  assert.equal(c.minds[victim].grudge, 0);
  assert.equal(c.minds[victim].sunk, 1);
});

test('a card says each habit learned in one line, the surest first, in letters the hand can write', () => {
  const said: string[] = [];
  const card = (set: (c: Career) => void): string[] => {
    const c = newCareer(1);
    set(c);
    const lines = cardLines(c, 0);
    said.push(...lines);
    return lines;
  };
  REGIONS.forEach((_, r) => assert.equal(card((c) => (c.minds[0].habits.breakOff[r] = 1000))[0], CARD.breakOff(r)));
  for (const key of ['loop', 'raid', 'run', 'storm'] as const) {
    CARD[key].forEach((line, b) => assert.equal(card((c) => (c.minds[0].habits[key][b] = 1000))[0], line));
  }
  for (let k = 1; k < Object.keys(FITTING).length; k++) assert.equal(card((c) => (c.minds[0].habits.fittings[k] = 1000))[0], CARD.fitting(k));
  CARD.grudge.forEach((line, g) => assert.equal(card((c) => Object.assign(c.minds[0], { grudge: g + 1, shared: 1 }))[0], line));
  assert.deepEqual(card(() => {}), [CARD.stranger]);
  assert.deepEqual(
    card((c) => {
      Object.assign(c.minds[0], { shared: 4, sank: 1, sunk: 2 });
      c.minds[0].habits.storm[1] = 700;
      c.minds[0].habits.loop[3] = 900;
      c.minds[0].habits.run[FIGHTS] = LEARNING.known - 1;
    }),
    [CARD.loop[3], CARD.storm[1], 'Sank you 1, sunk by you 2, in 4 matches together.'],
  );
  assert.equal(CARD.breakOff(0).startsWith('Has learned you break off at '), true);
  for (const line of said) for (const ch of line) assert.ok(ch in GLYPHS, `the hand has no ${JSON.stringify(ch)} for “${line}”`);
});

function sail(seed: number): { c0: Career; c1: Career; v: Voyage; drawn: number[] } {
  const c0 = newCareer(seed), { setup, drawn } = toSetup(c0, seed), sea = seaFor(world(), seed), state = createMatch(setup), v = newVoyage();
  const still = idleInput();
  while (state.tick < 30 * 60) {
    step(sea, state, still);
    observe(v, sea, state);
  }
  for (let i = 1; i < SHIPS; i++) sink(state, i, i === 2 ? 0 : -1, CAUSE.gun);
  return { c0, c1: applyResult(c0, result(state), v), v, drawn };
}

test('the career chart inks what the player saw in a headless match, marks its finds and letters the regions it entered', () => {
  const { c0, c1, v, drawn } = sail(77);
  assert.equal(lit(c0.chart.seen), 0);
  assert.ok(chartInked(c0).every((x) => x === 0));
  assert.ok(lit(v.seen) > 0 && lit(v.seen) < CHART_CELLS / 2, `cells seen ${lit(v.seen)}`);
  assert.equal(lit(c1.chart.seen), lit(v.seen));
  assert.ok(chartInked(c1).some((x) => x > 0));
  const letters = toLetter(c0, v);
  assert.ok(letters.length >= 1);
  for (const { region, tick } of letters) assert.deepEqual(c1.chart.named[region], { match: 0, tick });
  assert.equal(toLetter(c1, v).length, 0);
  const found = Array.from(v.found).flatMap((f, k) => (f ? [k] : []));
  assert.deepEqual(toSetup(c1, 78).setup.known, found);
  assert.deepEqual([c1.minds[drawn[1]].sunk, c1.minds[drawn[1]].grudge], [1, 1]);
  assert.equal(careerHash(sail(77).c1), careerHash(c1));
});

test('the first voyage: the nine lowest captains at their gentlest and the first loop charmed; then the player is on its own', () => {
  const c = newCareer(9), { setup, drawn } = toSetup(c, 4);
  const lowest = Array.from({ length: LEAGUE }, (_, i) => i).sort((a, b) => c.captains[a].points - c.captains[b].points || a - b).slice(0, SHIPS - 1);
  assert.deepEqual([...drawn].sort((a, b) => a - b), lowest.sort((a, b) => a - b));
  assert.equal(setup.firstVoyage, true);
  assert.equal(createMatch(setup).charm, true);
  assert.equal(setup.minds?.[0], null);
  for (let k = 1; k < SHIPS; k++) {
    assert.equal(setup.fleet?.[k].gunnery, GENTLE.gunnery);
    assert.deepEqual(setup.fleet?.[k].fittings, startingFittings(1), 'the starting ram and guns, whatever its temperament');
    assert.equal(setup.minds?.[k]?.gentle, true);
  }
  const s2 = toSetup(applyResult(c, finish()), 5).setup;
  assert.equal(s2.firstVoyage, false);
  assert.equal(createMatch(s2).charm, false);
  assert.ok(s2.minds?.slice(1).every((m) => m !== null && !m.gentle));
  const v = newVoyage(), sunk = { phase: PHASE.sunk };
  const at = (tick: number, kinds: number[]): void =>
    observe(v, null as unknown as Sea, { tick, ships: [sunk], events: kinds.map((kind) => ({ kind, ship: 0, by: 1, at: { x: 0, y: 0, z: 1 }, amount: 1, cells: [] })) } as unknown as MatchState);
  at(40, [EVENT.breakOff, EVENT.loop]);
  at(90, [EVENT.called, EVENT.chosen, EVENT.broadside, EVENT.loop]);
  assert.deepEqual([LESSON.breakOff, LESSON.loop, LESSON.gull, LESSON.chest, LESSON.broadside].map((l) => v.lessons[l]), [40, 40, 90, 90, 90]);
  assert.deepEqual([v.lessons[LESSON.steer], v.lessons[LESSON.storm], v.sea], [-1, -1, 2]);
});

test('the same career, result and voyage make the same career; all it has learned saves and loads bit for bit', () => {
  const v = voyage({ breakOff: 1, loop: 25, raids: 2, run: 40, storm: 10, fittings: [FITTING.longGuns] });
  v.seen[5] = 0xff;
  v.found[0] = 1;
  v.entered[1] = 300;
  let c = newCareer(21);
  for (let k = 0; k < 3; k++) c = applyResult(c, finish({ 2: 0, 0: 4 }), v);
  const a = applyResult(c, finish(), v), b = applyResult(c, finish(), v), back = decodeCareer(encodeCareer(a));
  assert.equal(careerHash(a), careerHash(b));
  assert.deepEqual(back, a);
  assert.equal(careerHash(back), careerHash(a));
  assert.deepEqual([back.chart.seen[5], back.chart.found[0], back.chart.named[1].match, back.chart.named[1].tick], [0xff, 1, 0, 300]);
  assert.ok(back.minds.some((m) => m.sunk > 0) && back.minds.some((m) => m.sank > 0));
  assert.ok(back.profile.breakOff[1] >= LEARNING.known && back.profile.fittings[FITTING.longGuns] >= LEARNING.known);
});
