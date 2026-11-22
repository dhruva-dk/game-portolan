// Stars, growth, age, retirement, morale, form, traits and injury (Phase B sections 2.2 and 2.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { random } from '../src/world/random.ts';
import {
  age,
  grown,
  potential,
  retireChance,
  retires,
  stars,
  starsOf,
  YEAR,
} from '../src/career/stars.ts';
import * as morale from '../src/career/morale.ts';
import { formReach, formShift, shifted } from '../src/career/form.ts';
import {
  TRAITS,
  clashes,
  modifier,
  trait,
  traitsFor,
  turned,
  type Setting,
} from '../src/career/traits.ts';
import {
  effective,
  marketability,
  mentors,
  payIncome,
  wageTrait,
} from '../src/career/effective.ts';
import { drawWants, askSeasons, askWage } from '../src/career/asks.ts';
import { makePerson } from '../src/career/recruit.ts';
import { TUNING } from '../src/career/tuning.ts';
import type { Person, PersonOf } from '../src/career/roles.ts';
import type { DriverStats } from '../src/race.ts';

const driver = (
  seed: number,
  starsNow: number,
  years: number
): PersonOf<'driver'> =>
  makePerson(
    { id: 0, role: 'driver', stars: starsNow, years, day: 0, colony: 0 },
    random(seed),
    new Set()
  ) as PersonOf<'driver'>;
const flat = (v: number): DriverStats => ({
  gunnery: v,
  helm: v,
  seamanship: v,
  nerve: v,
  consistency: v,
  stormcraft: v,
  stamina: v,
  feedback: v,
  lookout: v,
});

test('stars are the mean of the role stats / 4, in halves, 0 to 5; potential is the same at the ceiling', () => {
  assert.equal(starsOf(flat(10)), 2.5);
  assert.equal(starsOf(flat(20)), 5);
  assert.equal(starsOf(flat(0)), 0);
  assert.equal(starsOf(flat(11)), 3, '2.75 rounds to 3');
  assert.equal(starsOf(flat(10.9)), 2.5, '2.725 rounds to 2.5');
  const g = { ...driver(1, 2, 19), stats: flat(8), ceiling: flat(16) };
  assert.equal(stars(g), 2);
  assert.equal(potential(g), 4);
});

test('age: a year a season; peak ages by role', () => {
  const g = { born: -30 * YEAR - 1 };
  assert.equal(age(g, 0), 30);
  assert.equal(age(g, YEAR - 1), 31);
  assert.equal(YEAR, 170);
  for (let s = 0; s < 40; s++) {
    const c = driver(s, 3, 20);
    assert.ok(c.peak >= 26 && c.peak <= 31);
  }
  const designer = makePerson(
    { id: 0, role: 'designer', stars: 3, years: 30, day: 0, colony: 0 },
    random(2),
    new Set()
  );
  assert.ok(designer.peak >= 35 && designer.peak <= 45);
});

test('growth: below peak toward the ceiling, by improvability and school; past peak down by 0.3 + 0.2 a year', () => {
  const young: Person = {
    ...driver(3, 2, 20),
    peak: 28,
    improvability: 0.8,
    stats: flat(8),
    ceiling: flat(16),
  };
  const school = { school: 1, mentor: false, sailingSchool: 0 };
  const g1 = grown(young, 20, 0, school);
  for (const [k, v] of Object.entries(g1.stats)) {
    assert.ok(v > 8 && v < 16, `${k} grows toward its ceiling: ${v}`);
    assert.ok(
      Math.abs(v - (8 + 0.35 * 0.8 * 8)) <=
        0.35 * 0.8 * 8 * TUNING.growth.spread + 0.06,
      `${k}: ${v}`
    );
  }
  const better = grown(young, 20, 0, { ...school, school: 3 });
  assert.ok(
    stars(better) >= stars(g1) &&
      Object.values(better.stats).reduce((a, b) => a + b) >
        Object.values(g1.stats).reduce((a, b) => a + b),
    'a better school grows more'
  );
  const lazy = grown({ ...young, improvability: 0.2 }, 20, 0, school);
  assert.ok(
    Object.values(lazy.stats).reduce((a, b) => a + b) <
      Object.values(g1.stats).reduce((a, b) => a + b),
    'improvability grows more'
  );
  const mentored = grown(young, 20, 0, { ...school, mentor: true });
  assert.ok(
    Object.values(mentored.stats).reduce((a, b) => a + b) >
      Object.values(g1.stats).reduce((a, b) => a + b),
    'a Mentor lifts a young driver'
  );
  const notYoung = grown(young, 25, 0, { ...school, mentor: true });
  assert.equal(
    Object.values(notYoung.stats).reduce((a, b) => a + b),
    Object.values(grown(young, 25, 0, school).stats).reduce((a, b) => a + b),
    'not at 22 or over'
  );
  const stamina = grown(young, 20, 0, { ...school, sailingSchool: 3 });
  assert.ok(
    Math.abs(stamina.stats.stamina - g1.stats.stamina - 0.6) < 0.11,
    'the sailing school adds Stamina a level'
  );
  const old = { ...young, peak: 28, stats: flat(15), ceiling: flat(15) };
  const at = (years: number) =>
    Object.values(grown(old, years, 0, school).stats).reduce((a, b) => a + b) /
    9;
  assert.ok(at(30) < 15, 'past peak they decline');
  assert.ok(at(34) < at(30), 'faster each year past');
  assert.ok(Math.abs(at(30) - (15 - (0.3 + 0.2 * 2))) < 0.3);
  assert.equal(
    grown(young, 20, 0, school).stats.helm,
    grown(young, 20, 0, school).stats.helm,
    'deterministic by seed'
  );
});

test("retirement: 0 at the role's first age, rising to 1 at its last", () => {
  const ranges = TUNING.ages.retire;
  for (const [role, [first, last]] of Object.entries(ranges) as [
    keyof typeof ranges,
    readonly [number, number],
  ][]) {
    assert.equal(retireChance(role, first - 1), 0);
    assert.equal(retireChance(role, first), 0);
    assert.ok(
      retireChance(role, (first + last) / 2) > 0.4 &&
        retireChance(role, (first + last) / 2) < 0.6
    );
    assert.equal(retireChance(role, last), 1);
    assert.equal(retireChance(role, last + 3), 1);
  }
  assert.deepEqual([...ranges.driver], [34, 40]);
  assert.deepEqual([...ranges.chairman], [70, 80]);
  assert.equal(retires('driver', 40, random(1)), true);
  assert.equal(retires('driver', 30, random(1)), false);
});

test('morale: starts at 60; each move points the right way; it shifts effective stats by (morale − 50) / 50', () => {
  assert.equal(TUNING.morale.start, 60);
  assert.equal(driver(1, 3, 25).morale, 60);
  assert.ok(morale.resultMove(5, 2) > 0 && morale.resultMove(5, 9) < 0);
  assert.equal(morale.resultMove(1, 40), -6);
  assert.equal(morale.resultMove(40, 1), 6);
  assert.equal(morale.statusMove(true, true), 2);
  assert.equal(morale.statusMove(true, false), -2);
  assert.equal(morale.statusMove(false, false), 0);
  assert.equal(morale.silenceMove(), -10);
  assert.equal(morale.renewalMove(), 10);
  assert.ok(morale.wageMove(120, 100) > 0 && morale.wageMove(80, 100) < 0);
  assert.equal(morale.wageMove(1000, 100), 2);
  assert.ok(morale.bondMove(3) > morale.bondMove(1));
  assert.equal(morale.moraleShift(100), 1);
  assert.equal(morale.moraleShift(0), -1);
  assert.equal(morale.moraleShift(50), 0);
  assert.equal(morale.wantsOut(24), true);
  assert.equal(morale.wantsOut(25), false);
  assert.equal(morale.renewalAsk(81), 0.9);
  assert.equal(morale.renewalAsk(80), 1);
  assert.equal(morale.moraleIn(130), 100);
  const g = { ...driver(4, 3, 25), traits: [], stats: flat(10) };
  assert.equal(effective({ ...g, morale: 100 }, null).helm, 11);
  assert.equal(effective({ ...g, morale: 0 }, null).helm, 9);
});

test("form: one draw shifts a driver's stats by up to ±3 × (1 − u Consistency)", () => {
  assert.equal(formReach(0), 3);
  assert.equal(formReach(20), 0);
  assert.ok(formReach(15) < formReach(5));
  const rand = random(8);
  let lo = 0,
    hi = 0;
  for (let i = 0; i < 500; i++) {
    const f = formShift(10, rand);
    lo = Math.min(lo, f);
    hi = Math.max(hi, f);
    assert.ok(Math.abs(f) <= 1.5);
  }
  assert.ok(lo < -1 && hi > 1, 'it moves both ways');
  assert.equal(formShift(20, random(1)), 0);
  assert.deepEqual(shifted(flat(19.5), 1.2).helm, 20);
  assert.equal(shifted(flat(10), -1.25).helm, 8.8);
});

test('injury: about 4% of sinkings, for 1 to 3 races; an unfit driver cannot be picked', () => {
  const rand = random(77);
  let hurt = 0;
  for (let i = 0; i < 20000; i++) {
    const r = morale.injury(rand);
    if (r > 0) {
      hurt++;
      assert.ok(r >= 1 && r <= 3);
    }
  }
  assert.ok(hurt > 600 && hurt < 1000, `${hurt} of 20000`);
  assert.equal(morale.unfit({ unfit: 2 }), true);
  assert.equal(morale.unfit({ unfit: 0 }), false);
});

const setting = (over: Partial<Setting> = {}): Setting => ({
  pace: 1,
  round: 4,
  rules: {
    spec: ['sails'],
    storm: 1,
    banned: ['mortar'],
    pointsPerSinking: 1,
    seaHeldPoint: true,
    prizeSpread: 1,
    inspection: 1 / 3,
  },
  grid: [1, 2, 3],
  grudge: null,
  daysLeft: 300,
  age: 25,
  tier: 1,
  ...over,
});

test('traits: about thirty, as data, with the required ones doing what they say', () => {
  assert.ok(
    TRAITS.length >= 28 && TRAITS.length <= 36,
    `${TRAITS.length} traits`
  );
  assert.equal(new Set(TRAITS.map((t) => t.id)).size, TRAITS.length);
  for (const id of [
    'stormSpecialist',
    'hothead',
    'crowdFavourite',
    'payDriver',
    'homebody',
    'mentor',
    'showboat',
    'ironLungs',
    'grudgeHolder',
  ])
    trait(id);
  assert.throws(() => trait('nope'));
  assert.equal(
    modifier(['stormSpecialist'], setting({ pace: 0.9 })).stats.stormcraft,
    2
  );
  assert.equal(
    modifier(['stormSpecialist'], setting({ pace: 1 })).stats.stormcraft,
    undefined
  );
  assert.deepEqual(modifier(['hothead'], setting()).stats, {
    nerve: 2,
    consistency: -2,
  });
  assert.equal(modifier(['crowdFavourite'], null).marketability, 20);
  assert.equal(modifier(['homebody'], null).wants, 'home');
  assert.equal(
    modifier(['grudgeHolder'], setting({ grudge: 2 })).stats.nerve,
    2
  );
  assert.equal(
    modifier(['grudgeHolder'], setting({ grudge: 9 })).stats.nerve,
    undefined,
    'only against a team on the grid'
  );
  assert.equal(modifier(['contractYear'], setting({ daysLeft: 30 })).all, 1);
  assert.equal(modifier(['fastStarter'], setting({ round: 0 })).stats.helm, 1);
  assert.equal(
    modifier(['engineersEye'], setting()).stats.feedback,
    undefined,
    'a spec type takes it away'
  );
  // in a race: Storm Specialist on a slow-storm planet
  const g = {
    ...driver(5, 3, 25),
    traits: ['stormSpecialist', 'hothead'],
    stats: flat(10),
    morale: 50,
  };
  const s = effective(g, setting({ pace: 0.85 }));
  assert.equal(s.stormcraft, 12);
  assert.equal(s.nerve, 12);
  assert.equal(s.consistency, 8);
  assert.equal(effective(g, null).stormcraft, 10, 'unconditional only');
});

test('traits: Pay Driver brings TUNING.traits.pay × marketability a race; Crowd Favourite lifts marketability; wage traits move the ask; Mentor', () => {
  const base = { ...driver(6, 3, 25), traits: [], marketability: 50 };
  assert.equal(payIncome(base), 0);
  assert.equal(
    payIncome({ ...base, traits: ['payDriver'] }),
    Math.round(TUNING.traits.pay * 50)
  );
  assert.equal(marketability({ ...base, traits: ['crowdFavourite'] }), 70);
  assert.equal(
    marketability({ ...base, marketability: 95, traits: ['crowdFavourite'] }),
    100
  );
  assert.ok(
    wageTrait({ ...base, traits: ['mercenary'] }) > 1 &&
      wageTrait({ ...base, traits: ['loyal'] }) < 1
  );
  assert.ok(askWage({ ...base, traits: ['mercenary'] }, 1) > askWage(base, 1));
  assert.equal(mentors([{ ...base, traits: ['mentor'] }]), true);
  assert.equal(mentors([base]), false);
});

test('traits: each role draws only its own, never two that clash, at most three; a season turns them by seed', () => {
  for (const t of traitsFor('scout')) assert.ok(t.roles.includes('scout'));
  assert.ok(clashes('loyal', 'mercenary'));
  const rand = random(12);
  let held: string[] = [];
  let changed = 0;
  for (let season = 0; season < 400; season++) {
    const next = turned('driver', held, rand);
    if (next.join() !== held.join()) changed++;
    held = next;
    assert.ok(held.length <= 3);
    assert.equal(new Set(held).size, held.length);
    for (const a of held) for (const b of held) assert.ok(!clashes(a, b));
    for (const id of held) assert.ok(trait(id).roles.includes('driver'));
  }
  assert.ok(changed > 20, 'traits come and go');
});

test('wants: three, no repeats; the young lean to status and ambition, the old to security and money; Homebody wants home first', () => {
  const tally = (years: number) => {
    const rand = random(years);
    const n: Record<string, number> = {};
    for (let i = 0; i < 2000; i++)
      for (const w of drawWants('driver', years, [], rand))
        n[w] = (n[w] ?? 0) + 1;
    return n;
  };
  const young = tally(19),
    old = tally(36);
  assert.ok(young.status > old.status && young.ambition > old.ambition);
  assert.ok(old.security > young.security && old.money > young.money);
  const w = drawWants('mechanic', 30, ['homebody'], random(1));
  assert.equal(w[0], 'home');
  assert.equal(new Set(w).size, 3);
  assert.ok(
    !drawWants('mechanic', 20, [], random(2)).includes('status'),
    "status is a driver's want"
  );
  assert.equal(askSeasons(20), 1);
  assert.equal(askSeasons(36), 3);
});

test('the ask rises with stars and tier and marketability', () => {
  const g = driver(7, 3, 25);
  assert.ok(askWage(g, 0) > askWage(g, 1) && askWage(g, 1) > askWage(g, 2));
  assert.ok(
    askWage({ ...g, stats: flat(16) }, 1) > askWage({ ...g, stats: flat(8) }, 1)
  );
  assert.ok(
    askWage({ ...g, marketability: 90 }, 1) >
      askWage({ ...g, marketability: 10 }, 1)
  );
});
