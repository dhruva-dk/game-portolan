// The career (WP10 part A): pure and deterministic, tiers never lost, the unlock schedule, a league that moves on its
// own, the gull's training and plumage, the save's round trip, and career → match → career end to end.
//   node --test tests/career/career.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPTAINS, TRAITS, captainGull, captainOutfit, draw } from '../../src/career/league.ts';
import { GULL_PRICES, applyResult, buyGull, chooseForm, gullPrice, plumage } from '../../src/career/progress.ts';
import { toSetup } from '../../src/career/setup.ts';
import {
  LEAGUE, RANK, careerHash, decodeCareer, encodeCareer, newCareer, rankDeltas, tierOf, unlockedForms, type Career, type GullLevels,
} from '../../src/career/state.ts';
import { EMBLEMS, PLAYER_EMBLEM } from '../../src/render/ships/emblems.ts';
import { result, sink, type Finish, type MatchResult } from '../../src/sim/end.ts';
import { seaFor } from '../../src/sim/environment.ts';
import { idleInput } from '../../src/sim/input.ts';
import { step } from '../../src/sim/match.ts';
import { rngFloat, rngFrom, rngInt } from '../../src/sim/math.ts';
import { CAUSE, SHIPS, createMatch, matchHash } from '../../src/sim/state.ts';
import { FORM, GULL, TREASURE } from '../../src/sim/tables.ts';
import { NAMED_PIGMENTS } from '../../src/style/palette.ts';
import { world } from '../sim/vectors.ts';

/** A finished match made up on `seed` as result() reports one: a random order (the player at `place` when given), sea, sinkings, banks. */
function madeUp(seed: number, place = 0): MatchResult {
  const rng = rngFrom(seed), order = Array.from({ length: SHIPS }, (_, i) => i), ships = new Array<Finish>(SHIPS);
  for (let i = SHIPS - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (place > 0) {
    const k = order.indexOf(0);
    [order[k], order[place - 1]] = [order[place - 1], order[k]];
  }
  order.forEach((ship, k) => {
    const bank = rngInt(rng, 600);
    ships[ship] = { ship, place: k + 1, tick: 0, by: -1, cause: -1, claimed: rngFloat(rng) * 5000, sank: 0, bank, treasure: Math.floor(bank * TREASURE.share * TREASURE.place[k]) };
  });
  for (let k = 1; k < SHIPS; k++) {
    if (rngFloat(rng) >= 0.5) continue;
    const by = order[rngInt(rng, k)];
    ships[order[k]].by = by;
    ships[order[k]].cause = CAUSE.gun;
    ships[by].sank++;
  }
  return { order, ships, timeline: [], ticks: 0 };
}

const top = (c: Career): number => c.captains.reduce((best, k, i) => (k.points > c.captains[best].points ? i : best), 0);
const levels = (g: GullLevels): number => TRAITS.reduce((a, t) => a + g[t], 0);

test('the league is the thirty captains of the table, in named pigments and their emblems', () => {
  assert.equal(CAPTAINS.length, LEAGUE);
  assert.equal(new Set(CAPTAINS.map((c) => c.name)).size, LEAGUE);
  assert.deepEqual([CAPTAINS[0].name, CAPTAINS[9].name, CAPTAINS[29].name], ['Saetta', 'Rosa dei Venti', 'Sirocchia']);
  CAPTAINS.forEach((c, i) => {
    assert.equal(c.emblem, EMBLEMS[i]);
    for (const p of c.pigments) assert.ok(p in NAMED_PIGMENTS, c.name + ': ' + p);
  });
  assert.equal(EMBLEMS[LEAGUE], PLAYER_EMBLEM);
  for (let t = 0; t < 6; t++) assert.equal(CAPTAINS.filter((c) => c.temperament === t).length, 5);
  assert.deepEqual(RANK.winds, ['Greco', 'Levante', 'Scirocco', 'Ostro', 'Libeccio', 'Ponente', 'Maestro', 'Tramontana']);
});

test('rank points: place, sea and sinkings, a zero-sum match', () => {
  const r = madeUp(1), winner = r.order[0], last = r.order[SHIPS - 1];
  const flat = r.ships.map((s) => ({ ...s, claimed: 100, sank: 0, by: -1 })), p = rankDeltas(flat);
  assert.equal(p[winner], RANK.place);
  assert.equal(p[last], -RANK.place);
  assert.equal(p.reduce((a, b) => a + b, 0), 0);
  const sunk = flat.map((s) => ({ ...s }));
  sunk[last].by = winner;
  sunk[winner].sank = 1;
  const q = rankDeltas(sunk);
  assert.equal(q[winner] - p[winner], RANK.sink);
  assert.equal(q[last] - p[last], -RANK.sink);
  const sea = flat.map((s) => ({ ...s, claimed: s.ship === winner ? 200 : s.ship === last ? 0 : 100 })), e = rankDeltas(sea);
  assert.equal(e[winner] - p[winner], RANK.sea);
  assert.equal(e[last] - p[last], -RANK.sea);
  assert.ok(Math.abs(rankDeltas(r.ships).reduce((a, b) => a + b, 0)) <= SHIPS);
});

test('the same career and result make the same career, leaving the career as it was', () => {
  for (let seed = 1; seed <= 200; seed++) {
    let a = newCareer(seed), b = decodeCareer(encodeCareer(newCareer(seed)));
    for (let m = 0; m < 3; m++) {
      const before = careerHash(a), r = madeUp(seed * 7 + m), next = applyResult(a, r);
      assert.equal(careerHash(a), before);
      b = applyResult(b, r);
      assert.equal(careerHash(next), careerHash(b));
      a = next;
    }
    assert.equal(a.match, 3);
  }
  assert.notEqual(careerHash(newCareer(1)), careerHash(newCareer(2)));
});

test('a tier once reached is never lost, and the points never fall below it', () => {
  for (let seed = 1; seed <= 30; seed++) {
    let c = newCareer(seed), best = 1;
    for (let m = 0; m < 80; m++) {
      c = applyResult(c, madeUp(seed * 1000 + m, m < 40 ? 1 + (m % 3) : SHIPS)); // a climb, then a losing streak
      const { points, tier } = c.player;
      assert.ok(tier >= best && tier >= tierOf(points));
      assert.ok(points >= (tier - 1) * RANK.tier && points <= RANK.top);
      best = tier;
    }
    assert.ok(best >= 3, 'a winning run climbs the rose');
  }
});

test('the unlock schedule: the caravel at Levante, the carrack at Ostro, the galleon at Ponente; the loot pool by tier', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map((t) => unlockedForms(t).length), [1, 2, 2, 3, 3, 4, 4, 4]);
  assert.deepEqual(unlockedForms(6), [FORM.pinnace, FORM.caravel, FORM.carrack, FORM.galleon]);
  assert.deepEqual([0, 99, 100, 399, 400, 799].map((p) => tierOf(p)), [1, 1, 2, 4, 5, 8]);
  let c = newCareer(5);
  assert.throws(() => chooseForm(c, FORM.caravel), RangeError);
  for (let m = 0; c.player.tier < 2; m++) c = applyResult(c, madeUp(m, 1));
  c = chooseForm(c, FORM.caravel);
  const { setup } = toSetup(c, 9);
  assert.equal(setup.rank, 2);
  assert.equal(setup.fleet?.[0].form, FORM.caravel);
  assert.throws(() => chooseForm(c, FORM.carrack), RangeError);
});

test('each match draws the nine captains nearest the player, fitted out by rank and temperament', () => {
  const c = newCareer(3);
  c.player.points = 420;
  const drawn = draw(c), far = (i: number): number => Math.abs(c.captains[i].points - 420), worst = Math.max(...drawn.map(far));
  assert.equal(drawn.length, SHIPS - 1);
  for (let i = 0; i < LEAGUE; i++) if (!drawn.includes(i)) assert.ok(far(i) >= worst);
  const { setup } = toSetup(c, 1);
  assert.equal(setup.fleet?.length, SHIPS);
  drawn.forEach((id, k) => assert.deepEqual(setup.fleet?.[k + 1], captainOutfit(c, id)));
  for (let t = 1; t < 8; t++) {
    for (let temp = 0; temp < 6; temp++) {
      const lo = captainGull(t, temp), hi = captainGull(t + 1, temp);
      for (const trait of TRAITS) assert.ok(hi[trait] >= lo[trait] && hi[trait] <= GULL.levels[trait]);
    }
  }
  assert.ok(levels(captainGull(8, 0)) > levels(captainGull(1, 0)) + 10);
  for (let id = 0; id < LEAGUE; id++) {
    const o = captainOutfit(c, id), open = unlockedForms(tierOf(c.captains[id].points));
    assert.ok(open.includes(o.form ?? -1) && (o.form ?? -1) <= CAPTAINS[id].form);
    if (open.includes(CAPTAINS[id].form)) assert.equal(o.form, CAPTAINS[id].form);
  }
  const kit = (id: number): number => (captainOutfit(c, id).fittings ?? []).reduce((a, f) => a + (f.kind > 0 ? 1 + f.tier : 0), 0);
  const order = Array.from({ length: LEAGUE }, (_, i) => i).sort((a, b) => c.captains[a].points - c.captains[b].points);
  assert.ok(kit(order[LEAGUE - 1]) > kit(order[0]), 'the highest-ranked start with better fittings');
});

test('the league moves on its own: captains rise and fall over 100 rounds', () => {
  let c = newCareer(2026), leader = top(c), leaders = 0;
  const start = c.captains.map((k) => k.points), lo = start.slice(), hi = start.slice();
  for (let m = 0; m < 100; m++) {
    c = applyResult(c, madeUp(m * 31 + 7));
    c.captains.forEach((k, i) => {
      lo[i] = Math.min(lo[i], k.points);
      hi[i] = Math.max(hi[i], k.points);
    });
    if (top(c) !== leader) [leader, leaders] = [top(c), leaders + 1];
  }
  const end = c.captains.map((k) => k.points);
  const spanned = hi.filter((h, i) => h - lo[i] >= RANK.tier).length;
  const rose = end.filter((p, i) => p - start[i] >= RANK.tier).length, fell = end.filter((p, i) => start[i] - p >= RANK.tier).length;
  const winds = new Set(end.map((p) => tierOf(p))).size, stats = JSON.stringify({ spanned, rose, fell, winds, leaders });
  // alive: two thirds of the captains cross a whole tier's span, at least five end a tier up and five a tier down, the
  // table stays spread over six of the eight winds, and the head of the league changes hands
  assert.ok(spanned >= 20 && rose >= 5 && fell >= 5 && winds >= 6 && leaders >= 2, stats);
});

test('the gull trains with treasure, and its plumage records every level', () => {
  let c = newCareer(4), spent = 0;
  assert.throws(() => buyGull(c, 'talons'), RangeError);
  c.player.treasure = 100000;
  for (const t of TRAITS) {
    assert.equal(GULL_PRICES[t].length, GULL.levels[t]);
    for (const p of GULL_PRICES[t]) spent += p;
  }
  assert.equal(plumage(c.player.gull).marks.length, 0);
  for (const t of TRAITS) {
    while (gullPrice(c, t) !== null) {
      assert.equal(plumage(c.player.gull).goldTips, false);
      c = buyGull(c, t);
    }
  }
  assert.equal(c.player.treasure, 100000 - spent);
  for (const t of TRAITS) {
    assert.equal(c.player.gull[t], GULL.levels[t]);
    assert.throws(() => buyGull(c, t), RangeError);
  }
  const { marks, goldTips } = plumage(c.player.gull);
  assert.ok(goldTips);
  assert.equal(marks.length, levels(c.player.gull));
  assert.deepEqual(marks.filter((m) => m.trait === 'talons').map((m) => m.pigment), [0, 1, 2, 3]);
  assert.deepEqual(marks.filter((m) => m.trait === 'beak').map((m) => m.pigment), [0, 1, 3]);
  assert.deepEqual(toSetup(c, 1).setup.fleet?.[0].gull, c.player.gull);
});

test('a career saves and loads bit for bit; a damaged save is refused whole', () => {
  let c = newCareer(8);
  for (let m = 0; m < 5; m++) c = applyResult(c, madeUp(m));
  const bytes = encodeCareer(c), back = decodeCareer(bytes), bad = bytes.slice();
  assert.deepEqual(back, c);
  assert.equal(careerHash(back), careerHash(c));
  assert.throws(() => decodeCareer(bytes.subarray(0, bytes.length - 1)));
  bad[0] ^= 0xff;
  assert.throws(() => decodeCareer(bad));
  assert.throws(() => encodeCareer({ ...c, match: 0.5 }));
});

test('career → match setup → headless match → result → career, the same twice', () => {
  const SEED = 4242, sea = seaFor(world(), SEED);
  const run = () => {
    const career = applyResult(newCareer(11), madeUp(3)), { setup, drawn } = toSetup(career, SEED), state = createMatch(setup);
    assert.equal(state.ships[0].pigment, LEAGUE);
    drawn.forEach((id, k) => {
      assert.equal(state.ships[k + 1].pigment, id);
      assert.equal(state.ships[k + 1].gull.talons, captainOutfit(career, id).gull?.talons);
    });
    const idle = idleInput();
    for (let t = 0; t < 120; t++) step(sea, state, idle);
    for (let i = SHIPS - 1; i >= 1; i--) sink(state, i, i % 3 === 0 ? 0 : -1, i % 3 === 0 ? CAUSE.gun : CAUSE.storm);
    const r = result(state);
    return { career, r, next: applyResult(career, r), hash: matchHash(state) };
  };
  const a = run(), b = run();
  assert.equal(a.hash, b.hash);
  assert.equal(careerHash(a.next), careerHash(b.next));
  assert.equal(a.r.order[0], 0);
  assert.equal(a.next.match, a.career.match + 1);
  assert.equal(a.next.player.treasure, a.career.player.treasure + a.r.ships[0].treasure);
  assert.ok(a.next.player.points > a.career.player.points, 'the winner climbs');
});
