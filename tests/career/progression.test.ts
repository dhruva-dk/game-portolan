import { test } from 'node:test';
import assert from 'node:assert/strict';
import { careerLevel, careerRank, equipAbility, equipCosmetic, newCareer, unlockedAbilities, unlockedCosmetics, wornLook, type Career } from '../../src/career/career.ts';
import { COSMETICS, COSMETIC_KINDS, STARTER_LOOK, cosmetic, cosmeticsOf } from '../../src/career/cosmetics.ts';
import { planMatch } from '../../src/career/fleet.ts';
import { ABILITY_LEVEL, ABILITY_ORDER, levelOf, matchXp, xpAt, xpToNext } from '../../src/career/levels.ts';
import { RANKS, RANK_STEP, TIER, TIERS, rankOf, reachTier, stepOf } from '../../src/career/ranks.ts';
import { applyMatch } from '../../src/career/results.ts';
import { ABILITIES, STARTER_ACTIVE, STARTER_PASSIVE, ability } from '../../src/sim/abilities.ts';
import { hash32, rngFrom } from '../../src/sim/math.ts';
import { scriptedReport, syntheticReport } from './synthetic.ts';

test('ranks: Iron to Diamond in three steps each, then Admiral and Legend, following the rating', () => {
  assert.deepEqual([...TIERS], ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Admiral', 'Legend']);
  assert.equal(RANKS.length, 6 * 3 + 2);
  assert.deepEqual(RANKS.slice(0, 4).map((r) => r.name), ['Iron I', 'Iron II', 'Iron III', 'Bronze I']);
  assert.deepEqual(RANKS.slice(-3).map((r) => r.name), ['Diamond III', 'Admiral', 'Legend']);
  RANKS.forEach((r, i) => {
    assert.equal(r.index, i);
    assert.equal(r.from, i * RANK_STEP);
    assert.equal(stepOf(r.from), i);
    if (i > 0) assert.equal(stepOf(r.from - 1), i - 1);
  });
  assert.equal(stepOf(-300), 0);
  assert.equal(stepOf(99999), RANKS.length - 1);
  assert.deepEqual([rankOf(1250, 0).step.name, rankOf(1250, 0).progress], ['Platinum I', 0.5]);
  assert.equal(rankOf(5000, 0).step.name, 'Legend');
  assert.equal(rankOf(5000, 0).progress, 1);
});

test('a tier once reached is a floor: the step can slip inside it, never below it', () => {
  assert.equal(reachTier(TIER.gold, 400), TIER.gold);
  assert.equal(reachTier(TIER.silver, 1000), TIER.gold);
  const held = rankOf(400, TIER.gold);
  assert.deepEqual([held.step.name, held.floored, held.progress], ['Gold I', true, 0]);
  assert.equal(rankOf(1150, TIER.gold).step.name, 'Gold III');
  assert.equal(rankOf(-200, TIER.legend).step.name, 'Legend');

  // Real careers: synthetic players who climb and then play far worse never fall below a tier they reached.
  for (let seed = 1; seed <= 12; seed++) {
    let c = newCareer(seed), best = 0;
    const rng = rngFrom(hash32(seed, 5));
    for (let m = 0; m < 70; m++) {
      const skill = m < 35 ? 1600 : 200;
      c = applyMatch(c, syntheticReport(rng, planMatch(c), skill)).career;
      const rank = careerRank(c);
      assert.ok(rank.step.tier >= best, `seed ${seed} match ${m}: ${rank.step.name} after reaching tier ${TIERS[best]}`);
      assert.ok(rank.step.index >= stepOf(c.rating), 'the shown rank is never below the rating’s own');
      best = Math.max(best, rank.step.tier);
      assert.equal(c.bestTier, best);
    }
    assert.ok(best >= TIER.platinum, `seed ${seed} climbed to ${TIERS[best]}`);
    assert.ok(stepOf(c.rating) < RANKS.findIndex((r) => r.tier === best), 'the rating itself fell below the floor');
  }
});

test('levels: XP earns levels on a curve that runs to level 40 in roughly a hundred matches, and beyond', () => {
  assert.equal(xpAt(1), 0);
  assert.equal(xpAt(2), xpToNext(1));
  for (let l = 2; l < 40; l++) assert.ok(xpToNext(l) > xpToNext(l - 1), `level ${l} costs more than the last`);
  assert.equal(xpToNext(60), xpToNext(40));
  for (const l of [1, 2, 7, 23, 40, 41, 75]) {
    assert.deepEqual(levelOf(xpAt(l)), { level: l, into: 0, need: xpToNext(l) });
    assert.equal(levelOf(xpAt(l + 1) - 1).level, l);
  }
  const typical = matchXp(8, 20, 1, 400, 380, 0).reduce((a, p) => a + p.amount, 0);
  const matches = xpAt(40) / typical;
  assert.ok(matches >= 60 && matches <= 160, `${matches.toFixed(0)} typical matches to level 40 at ${typical} XP each`);
  const win = matchXp(1, 20, 4, 1500, 660, 2), last = matchXp(20, 20, 0, 0, 30, 0);
  const sum = (p: { amount: number }[]): number => p.reduce((a, x) => a + x.amount, 0);
  assert.ok(sum(win) > 2 * typical && sum(last) > 0 && sum(last) < typical);
  assert.ok(win.every((p) => p.label.length > 0 && Number.isInteger(p.amount) && p.amount > 0));
});

test('levels unlock the 16 abilities: the starter pair at level 1, the rest spread to about level 40', () => {
  assert.equal(ABILITIES.length, 16);
  assert.deepEqual(ABILITY_ORDER.slice(0, 2), [STARTER_ACTIVE, STARTER_PASSIVE]);
  assert.deepEqual(ABILITIES.filter((a) => ABILITY_LEVEL[a.id] === 1).map((a) => a.id).sort(), [STARTER_ACTIVE, STARTER_PASSIVE].sort());
  const levels = ABILITY_ORDER.map((id) => ABILITY_LEVEL[id]);
  assert.equal(new Set(levels.slice(2)).size, 14, 'one new ability at a time');
  assert.ok(levels[levels.length - 1] >= 35 && levels[levels.length - 1] <= 45, `the last at level ${levels[levels.length - 1]}`);
  for (let k = 3; k < levels.length; k++) assert.ok(levels[k] - levels[k - 1] <= 4, 'no long gaps');
  for (let k = 2; k + 1 < levels.length; k += 2) {
    assert.notEqual(ability(ABILITY_ORDER[k]).kind, ability(ABILITY_ORDER[k + 1]).kind, 'actives and passives alternate');
  }
  const c = newCareer(1);
  assert.deepEqual(unlockedAbilities(c).sort(), [STARTER_ACTIVE, STARTER_PASSIVE].sort());
  c.xp = xpAt(40);
  assert.equal(unlockedAbilities(c).length, 16);
});

test('every level from 2 to 40 unlocks something, and ability unlocks arrive in level order over real matches', () => {
  for (let l = 2; l <= 40; l++) {
    const things = ABILITIES.filter((a) => ABILITY_LEVEL[a.id] === l).length
      + COSMETICS.filter((k) => k.unlock.by === 'level' && k.unlock.level === l).length;
    assert.ok(things > 0, `level ${l} unlocks nothing`);
  }
  let c = newCareer(3);
  const rng = rngFrom(7), got: string[] = [];
  for (let m = 0; m < 150 && careerLevel(c) < 40; m++) {
    const out = applyMatch(c, syntheticReport(rng, planMatch(c), 900));
    got.push(...out.changes.unlocked.abilities);
    for (const id of out.changes.unlocked.abilities) assert.ok(ABILITY_LEVEL[id] <= out.changes.level.after.level);
    c = out.career;
  }
  assert.equal(careerLevel(c) >= 40, true, `reached level ${careerLevel(c)}`);
  assert.deepEqual(got, ABILITY_ORDER.slice(2), 'each ability announced once, in unlock order');
});

test('the catalogue: about 100 cosmetics across six kinds, each with an unlock rule, rank unlocks for show', () => {
  assert.ok(COSMETICS.length >= 90 && COSMETICS.length <= 110, `${COSMETICS.length} cosmetics`);
  assert.equal(new Set(COSMETICS.map((k) => k.id)).size, COSMETICS.length);
  assert.equal(new Set(COSMETICS.map((k) => k.name)).size, COSMETICS.length);
  for (const { kind } of COSMETIC_KINDS) {
    const all = cosmeticsOf(kind);
    assert.ok(all.length >= 10, `${all.length} ${kind}`);
    assert.ok(all.some((k) => k.unlock.by === 'level' && k.unlock.level === 1), `a ${kind} to start with`);
    assert.equal(cosmetic(STARTER_LOOK[kind])?.kind, kind);
  }
  for (const k of COSMETICS) {
    assert.ok(k.name.length > 0 && k.hint.length > 0, k.id);
    if (k.unlock.by === 'level') assert.ok(Number.isInteger(k.unlock.level) && k.unlock.level >= 1 && k.unlock.level <= 60, k.id);
    else assert.ok(k.unlock.tier >= TIER.bronze && k.unlock.tier <= TIER.legend, k.id);
    if (k.kind === 'sailColour' || k.kind === 'hullPaint' || k.kind === 'wake') assert.match(k.colour ?? '', /^#[0-9a-f]{6}$/, k.id);
  }
  const ranked = COSMETICS.filter((k) => k.unlock.by === 'rank');
  assert.ok(ranked.length >= 15);
  for (let t = TIER.bronze; t <= TIER.legend; t++) assert.ok(ranked.some((k) => k.unlock.by === 'rank' && k.unlock.tier === t), `something for reaching ${TIERS[t]}`);
  for (const kind of ['sailColour', 'wake'] as const) {
    for (let t = TIER.bronze; t <= TIER.legend; t++) {
      assert.ok(ranked.some((k) => k.kind === kind && k.unlock.by === 'rank' && k.unlock.tier === t), `a ${kind} for ${TIERS[t]}`);
    }
  }
});

test('you equip what you have unlocked, and nothing locked', () => {
  let c: Career = newCareer(8);
  assert.throws(() => equipAbility(c, 'driftMine'), RangeError);
  assert.throws(() => equipCosmetic(c, 'goldenHour'), RangeError);
  assert.throws(() => equipCosmetic(c, 'auroraGreen'), RangeError);
  assert.throws(() => equipCosmetic(c, 'noSuchThing'), RangeError);
  c.xp = xpAt(37);
  c = equipAbility(c, 'driftMine');
  c = equipAbility(c, 'deepHold');
  assert.deepEqual([c.active, c.passive], ['driftMine', 'deepHold']);
  assert.throws(() => equipAbility(c, 'steadyAim'), RangeError);
  assert.throws(() => equipCosmetic(c, 'mangroveTea'), RangeError);
  c = equipCosmetic(c, 'weepingSapphire');
  c = equipCosmetic(c, 'whaleFluke');
  assert.deepEqual([c.look.sailColour, c.look.figurehead], ['weepingSapphire', 'whaleFluke']);
  assert.throws(() => equipCosmetic(c, 'goldenHour'), RangeError);
  c.bestTier = TIER.gold;
  const before = c;
  c = equipCosmetic(c, 'goldenHour');
  assert.equal(before.look.sailColour, 'weepingSapphire', 'equipping leaves the old career as it was');
  assert.equal(c.look.sailColour, 'goldenHour');
  assert.ok(unlockedCosmetics(c).some((k) => k.id === 'gildedWake'));
  assert.ok(!unlockedCosmetics(c).some((k) => k.id === 'platinumComet'));
  const plan = planMatch(c);
  assert.deepEqual([plan.player.active, plan.player.passive, plan.player.look.sailColour], ['driftMine', 'deepHold', 'goldenHour']);
  c.look.wake = 'wakeOfLegends';
  assert.equal(wornLook(c).wake, STARTER_LOOK.wake, 'a locked look is never worn');
});

test('a rank-up unlocks its show-off cosmetics in the match that reaches it', () => {
  let c = newCareer(21);
  c.matches = 20;
  c.rating = 290;
  const out = applyMatch(c, scriptedReport(planMatch(c), 1, { 5: 0, 6: 0, 7: 0 }));
  assert.equal(out.changes.rank.before.step.name, 'Iron III');
  assert.equal(out.changes.rank.after.step.name, 'Bronze I');
  assert.deepEqual([out.changes.rank.change, out.changes.rank.newTier], ['up', true]);
  for (const id of ['bronzeLeaf', 'bronzeRipple']) assert.ok(out.changes.unlocked.cosmetics.includes(id), id);
  assert.ok(!out.changes.unlocked.cosmetics.includes('silverMist'));
  c = out.career;
  assert.equal(careerRank(c).step.tier, TIER.bronze);
  assert.ok(unlockedCosmetics(c).some((k) => k.id === 'bronzeLeaf'));
});
