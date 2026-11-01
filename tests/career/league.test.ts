import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPTAINS, LEAGUE_SIZE, TEMPERAMENTS } from '../../src/career/captains.ts';
import { LEAGUE_SPREAD, newCareer, type Career } from '../../src/career/career.ts';
import { COSMETICS, LOOK_KINDS, cosmetic } from '../../src/career/cosmetics.ts';
import { DRAW, FLEET_SIZE, drawCaptains, planMatch, rivalry } from '../../src/career/fleet.ts';
import { KNOWS_NOTHING } from '../../src/career/habits.ts';
import { RANKS, stepOf } from '../../src/career/ranks.ts';
import { SKILL } from '../../src/career/rating.ts';
import { applyMatch } from '../../src/career/results.ts';
import { ABILITIES, STARTER_ACTIVE, STARTER_PASSIVE, ability } from '../../src/sim/abilities.ts';
import { hash32, rngFrom } from '../../src/sim/math.ts';
import { syntheticReport } from './synthetic.ts';

test('the league: about forty named captains, each with a temperament, a sigil and an active and a passive ability', () => {
  assert.ok(LEAGUE_SIZE >= 36 && LEAGUE_SIZE <= 44, `${LEAGUE_SIZE} captains`);
  assert.equal(new Set(CAPTAINS.map((c) => c.id)).size, LEAGUE_SIZE);
  assert.equal(new Set(CAPTAINS.map((c) => c.name)).size, LEAGUE_SIZE);
  assert.equal(new Set(CAPTAINS.map((c) => c.sigil.id)).size, LEAGUE_SIZE, 'every sail carries its own sigil');
  for (const c of CAPTAINS) {
    assert.ok(c.name.length > 0 && c.meaning.length > 0 && c.sigil.name.length > 0, c.id);
    assert.ok(TEMPERAMENTS.some((t) => t.id === c.temperament), c.id);
    assert.equal(ability(c.active).kind, 'active', c.id);
    assert.equal(ability(c.passive).kind, 'passive', c.id);
    assert.notEqual(cosmetic(c.sigil.id)?.kind, 'emblem', `${c.id}'s sigil is not a player emblem`);
    for (const k of LOOK_KINDS) {
      if (k === 'emblem') assert.equal(c.look.emblem, c.sigil.id);
      else assert.equal(cosmetic(c.look[k])?.kind, k, `${c.id} ${k}`);
    }
  }
  for (const t of TEMPERAMENTS) {
    const n = CAPTAINS.filter((c) => c.temperament === t.id).length;
    assert.ok(n >= 5, `${n} ${t.name}s`);
    for (const lean of [t.fight, t.loot, t.hold, t.hide, t.range]) assert.ok(lean >= 0 && lean <= 1);
  }
  const brought = new Set(CAPTAINS.flatMap((c) => [c.active, c.passive]));
  assert.deepEqual(ABILITIES.filter((a) => !brought.has(a.id)).map((a) => a.id), [], 'every ability is some captain’s');
});

test('a new league spans the ladder from Iron to Legend, in an order the seed shuffles', () => {
  const a = newCareer(1), b = newCareer(2);
  const ratings = a.captains.map((r) => r.rating).sort((x, y) => x - y);
  assert.ok(ratings[0] < RANKS[1].from && ratings[LEAGUE_SIZE - 1] >= RANKS[RANKS.length - 1].from, `${ratings[0]}..${ratings[LEAGUE_SIZE - 1]}`);
  for (let k = 1; k < LEAGUE_SIZE; k++) assert.ok(ratings[k] - ratings[k - 1] <= LEAGUE_SPREAD.step + LEAGUE_SPREAD.jitter);
  assert.notDeepEqual(a.captains.map((r) => r.rating), b.captains.map((r) => r.rating));
  assert.deepEqual(newCareer(1), a);
});

test('each match draws 19 captains near your skill', () => {
  for (const rating of [0, 400, 900, 1300, 1700, 2100]) {
    for (let matches = 1; matches <= 20; matches++) {
      const c = newCareer(rating + 5);
      c.rating = rating;
      c.matches = matches;
      const drawn = drawCaptains(c), far = (i: number): number => Math.abs(c.captains[i].rating - rating);
      assert.equal(drawn.length, FLEET_SIZE);
      assert.equal(new Set(drawn).size, FLEET_SIZE);
      const order = c.captains.map((_, i) => i).sort((x, y) => far(x) - far(y));
      // With no rivals yet, only luck reorders the draw: no drawn captain is much further than the nearest 19.
      const edge = far(order[FLEET_SIZE - 1]);
      for (const i of drawn) assert.ok(far(i) <= edge + 2 * DRAW.jitter, `rating ${rating}: drawn ${far(i)} away, the 19th nearest is ${edge}`);
      const mean = (ids: number[]): number => ids.reduce((s, i) => s + far(i), 0) / ids.length;
      assert.ok(mean(drawn) < mean(c.captains.map((_, i) => i).filter((i) => !drawn.includes(i))));
    }
  }
});

test('the draw changes from match to match, and the same career draws the same fleet', () => {
  const c = newCareer(9);
  c.rating = 1000;
  const fleets = new Set<string>();
  for (let m = 1; m <= 10; m++) {
    c.matches = m;
    fleets.add([...drawCaptains(c)].sort((a, b) => a - b).join());
    assert.deepEqual(planMatch(c), planMatch(c));
  }
  assert.ok(fleets.size >= 5, `${fleets.size} different fleets in 10 matches`);
});

test('rivals are drawn more often', () => {
  const runs = 400;
  let plain = 0, rival = 0;
  for (let m = 1; m <= runs; m++) {
    const c = newCareer(31);
    c.rating = 1100;
    c.matches = m;
    // A captain on the edge of the draw: about the 19th nearest.
    const far = (i: number): number => Math.abs(c.captains[i].rating - c.rating);
    const edge = c.captains.map((_, i) => i).sort((a, b) => far(a) - far(b))[FLEET_SIZE - 1];
    if (drawCaptains(c).includes(edge)) plain++;
    Object.assign(c.captains[edge], { grudge: 2, sank: 1, sunk: 2 });
    assert.ok(rivalry(c.captains[edge]) > 0.9);
    if (drawCaptains(c).includes(edge)) rival++;
  }
  assert.ok(rival >= plain + runs / 4, `on the edge: drawn ${plain} times as a stranger, ${rival} times as a rival, of ${runs}`);
  assert.ok(rival > 0.9 * runs);
});

test('the first match draws gentle captains, softened and with the starter pair; after it, captains sail as themselves', () => {
  const c = newCareer(4), plan = planMatch(c);
  assert.equal(plan.first, true);
  assert.equal(plan.fleet.length, FLEET_SIZE);
  const lowest = c.captains.map((_, i) => i).sort((a, b) => c.captains[a].rating - c.captains[b].rating).slice(0, FLEET_SIZE);
  const drawn = plan.fleet.map((f) => CAPTAINS.findIndex((x) => x.id === f.captain));
  assert.ok(drawn.filter((i) => lowest.includes(i)).length >= FLEET_SIZE - 3, 'mostly the lowest-rated captains');
  for (const f of plan.fleet) {
    assert.equal(f.gentle, true);
    assert.deepEqual([f.active, f.passive], [STARTER_ACTIVE, STARTER_PASSIVE]);
    assert.ok(f.rating <= c.rating - SKILL.edge - SKILL.gentle + SKILL.spread);
    assert.deepEqual(f.knows, KNOWS_NOTHING);
    assert.equal(f.grudge, 0);
  }
  assert.deepEqual([plan.player.active, plan.player.passive], [STARTER_ACTIVE, STARTER_PASSIVE]);
  assert.deepEqual([plan.player.level, plan.player.rank], [1, 'Iron I']);

  const next = applyMatch(c, syntheticReport(rngFrom(4), plan, 500)).career, again = planMatch(next);
  assert.equal(again.first, false);
  for (const f of again.fleet) {
    const cap = CAPTAINS.find((x) => x.id === f.captain)!;
    assert.equal(f.gentle, false);
    assert.deepEqual([f.active, f.passive], [cap.active, cap.passive]);
    assert.equal(f.name, cap.name);
    assert.equal(f.temperament, cap.temperament);
    assert.ok(f.skill >= 0 && f.skill <= 1);
    assert.ok(Math.abs(f.rating - (next.rating - SKILL.edge)) <= SKILL.spread + 1);
    assert.equal(f.rank, RANKS[stepOf(next.captains[CAPTAINS.indexOf(cap)].rating)].name);
  }
});

test('stronger captains sail a little stronger, and a Legend captain flies its show-off wake', () => {
  const c = newCareer(12);
  c.rating = 1500;
  c.matches = 5;
  const plan = planMatch(c);
  const league = (id: string): number => c.captains[CAPTAINS.findIndex((x) => x.id === id)].rating;
  const sorted = [...plan.fleet].sort((a, b) => league(a.captain) - league(b.captain));
  assert.ok(sorted[sorted.length - 1].rating > sorted[0].rating);
  c.captains[0].rating = 2300;
  c.matches = 6;
  c.rating = 2300;
  const legend = planMatch(c).fleet.find((f) => f.captain === CAPTAINS[0].id);
  assert.equal(legend?.look.wake, 'wakeOfLegends');
  assert.ok(COSMETICS.some((k) => k.id === 'wakeOfLegends'));
});

test('the league moves on its own: captains rise and fall over 100 matches, and stay spread over the ladder', () => {
  let c: Career = newCareer(2026);
  const rng = rngFrom(hash32(2026, 1)), start = c.captains.map((r) => r.rating), lo = start.slice(), hi = start.slice();
  for (let m = 0; m < 100; m++) {
    c = applyMatch(c, syntheticReport(rng, planMatch(c), 1000)).career;
    c.captains.forEach((r, i) => {
      lo[i] = Math.min(lo[i], r.rating);
      hi[i] = Math.max(hi[i], r.rating);
    });
  }
  const moved = hi.filter((h, i) => h - lo[i] >= 100).length;
  const tiers = new Set(c.captains.map((r) => RANKS[stepOf(r.rating)].tier)).size;
  assert.ok(moved >= 20, `${moved} captains moved a rank step or more`);
  assert.ok(tiers >= 7, `captains stand in ${tiers} tiers`);
});
