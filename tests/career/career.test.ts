import { test } from 'node:test';
import assert from 'node:assert/strict';
import { careerHash, careerLevel, newCareer, type Career } from '../../src/career/career.ts';
import { planMatch } from '../../src/career/fleet.ts';
import { MATCH_XP, levelOf } from '../../src/career/levels.ts';
import { careerStats, chartOf, regionsCharted, standingOf } from '../../src/career/record.ts';
import { applyMatch } from '../../src/career/results.ts';
import { loadCareer, memoryStore, saveCareer } from '../../src/career/save.ts';
import { rngFrom } from '../../src/sim/math.ts';
import { REGION_COUNT, REGIONS } from '../../src/sim/world/index.ts';
import { scriptedReport, syntheticReport } from './synthetic.ts';

test('applyMatch leaves the career it was given as it was, and the same match makes the same career', () => {
  for (let seed = 1; seed <= 40; seed++) {
    let c = newCareer(seed);
    const rng = rngFrom(seed);
    for (let m = 0; m < 4; m++) {
      const before = careerHash(c), report = syntheticReport(rng, planMatch(c), 700);
      const a = applyMatch(c, report), b = applyMatch(c, report);
      assert.equal(careerHash(c), before);
      assert.equal(careerHash(a.career), careerHash(b.career));
      assert.deepEqual(a.changes, b.changes);
      c = a.career;
    }
    assert.equal(c.matches, 4);
  }
  assert.notEqual(careerHash(newCareer(1)), careerHash(newCareer(2)));
});

test('the changes: XP in parts, levels gained, rank and rating before and after, and the stats', () => {
  let c = newCareer(6);
  const rng = rngFrom(6);
  let wins = 0, top5 = 0, kills = 0;
  for (let m = 0; m < 30; m++) {
    const report = syntheticReport(rng, planMatch(c), 1000), me = report.ships[0], { career, changes } = applyMatch(c, report);
    assert.equal(changes.place, me.place);
    assert.equal(changes.kills, me.kills);
    assert.equal(changes.xp.total, changes.xp.parts.reduce((a, p) => a + p.amount, 0));
    assert.equal(career.xp - c.xp, changes.xp.total);
    assert.ok(changes.xp.parts.some((p) => p.label === 'Played' && p.amount === MATCH_XP.played));
    assert.equal(changes.xp.parts.some((p) => p.label === 'Victory'), me.place === 1);
    assert.deepEqual(changes.level.before, levelOf(c.xp));
    assert.deepEqual(changes.level.after, levelOf(career.xp));
    assert.deepEqual(changes.level.gained, Array.from({ length: changes.level.after.level - changes.level.before.level }, (_, k) => changes.level.before.level + k + 1));
    assert.deepEqual(changes.rating, { before: c.rating, after: career.rating });
    assert.deepEqual(changes.rank.before, standingOf(c).rank);
    assert.deepEqual(changes.rank.after, standingOf(career).rank);
    const dir = Math.sign(changes.rank.after.step.index - changes.rank.before.step.index);
    assert.equal(changes.rank.change, dir > 0 ? 'up' : dir < 0 ? 'down' : 'same');
    wins += me.place === 1 ? 1 : 0;
    top5 += me.place <= 5 ? 1 : 0;
    kills += me.kills;
    c = career;
  }
  assert.deepEqual(careerStats(c), { matches: 30, wins, top5, kills, damage: c.damage, survived: c.survived, bestPlace: c.bestPlace });
  assert.ok(c.damage > 0 && c.survived > 0 && c.bestPlace >= 1);
  assert.ok(careerLevel(c) >= 10, `level ${careerLevel(c)} after 30 matches`);
});

test('the chart fills in with the regions you sail, and new waters earn XP once', () => {
  let c = newCareer(2);
  assert.equal(regionsCharted(c), 0);
  assert.deepEqual(chartOf(c).map((r) => r.name), REGIONS.map((r) => r.name));
  let out = applyMatch(c, scriptedReport(planMatch(c), 7, {}, null, [3, 4, 3, 99, -1]));
  assert.deepEqual(out.changes.newRegions, [3, 4]);
  assert.ok(out.changes.xp.parts.some((p) => p.label === 'New waters charted' && p.amount === 2 * MATCH_XP.newRegion));
  c = out.career;
  assert.deepEqual([c.chart[3], c.chart[4], regionsCharted(c)], [1, 1, 2]);
  out = applyMatch(c, scriptedReport(planMatch(c), 7, {}, null, [4, 5]));
  assert.deepEqual(out.changes.newRegions, [5]);
  c = out.career;
  assert.deepEqual([c.chart[4], c.chart[5]], [2, 1]);
  const rng = rngFrom(9);
  for (let m = 0; m < 60; m++) c = applyMatch(c, syntheticReport(rng, planMatch(c), 800)).career;
  assert.equal(regionsCharted(c), REGION_COUNT, 'enough matches chart the whole planet');
});

test('a report that cannot be this match is refused', () => {
  const c = newCareer(1), plan = planMatch(c), good = scriptedReport(plan, 3);
  assert.doesNotThrow(() => applyMatch(c, good));
  const bad = [
    { ...good, captains: good.captains.slice(1) },
    { ...good, captains: ['nobody', ...good.captains.slice(1)] },
    { ...good, captains: [good.captains[1], ...good.captains.slice(1)] },
    { ...good, ships: good.ships.map((s, i) => (i === 0 ? { ...s, place: 0 } : s)) },
    { ...good, ships: good.ships.map((s, i) => (i === 0 ? { ...s, sunkBy: 20 } : s)) },
  ];
  for (const r of bad) assert.throws(() => applyMatch(c, r), RangeError);
});

test('the loop: plan, play, apply, save, load — forty matches, and the career carries on between sessions', () => {
  const store = memoryStore(), rng = rngFrom(40);
  let { career } = loadCareer(store, 40);
  const seen: Career[] = [];
  for (let m = 0; m < 40; m++) {
    const plan = planMatch(career);
    assert.equal(plan.fleet.length, 19);
    career = applyMatch(career, syntheticReport(rng, plan, 1300, { drop: m % 5, runAt: 30, storm: 5, range: 90, weapon: 1 })).career;
    saveCareer(store, career);
    const back = loadCareer(store, 1);
    assert.equal(back.status, 'loaded');
    assert.equal(careerHash(back.career), careerHash(career));
    career = back.career;
    seen.push(career);
  }
  assert.equal(career.matches, 40);
  assert.ok(seen[39].rating > seen[0].rating);
});
