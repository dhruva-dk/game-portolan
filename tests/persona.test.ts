import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_BRAIN, variant } from '../src/sim/brain.ts';
import { MIXED, TYPES, dealt, nature } from '../src/sim/persona.ts';
import { DEFAULT_RULES } from '../src/sim/rules.ts';
import { temper } from '../src/sim/temper.ts';

const SEEDS = Array.from({ length: 1200 }, (_, i) => i + 1);
const counts = (xs: readonly string[]) => {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
};

test('in a mixed match a bot is the temper she always was, her persona named by it', () => {
  const names = new Set<string>();
  for (const s of SEEDS.slice(0, 200)) {
    const n = nature(s);
    assert.deepEqual(n.temper, temper(s));
    names.add(n.persona);
  }
  assert.equal(names.size, 6);
});

test('each persona sails one crew, made once, changed from the brain given only where the persona says', () => {
  const by = new Map<string, ReturnType<typeof nature>['brain']>();
  for (const s of SEEDS.slice(0, 200)) {
    const n = nature(s),
      had = by.get(n.persona);
    if (had) assert.equal(n.brain, had, `${n.persona}: made twice`);
    else by.set(n.persona, n.brain);
  }
  const brawler = by.get('brawler')!,
    homesteader = by.get('homesteader')!;
  assert.equal(brawler.helm, DEFAULT_BRAIN.helm);
  assert.equal(brawler.claimer, DEFAULT_BRAIN.claimer);
  assert.ok(brawler.choice.fight > DEFAULT_BRAIN.choice.fight);
  assert.ok(homesteader.choice.claim > DEFAULT_BRAIN.choice.claim);
  assert.ok(homesteader.hunting.earshot < brawler.hunting.earshot);
  const keen = variant({ helm: { ...DEFAULT_BRAIN.helm } }),
    k = nature(SEEDS.find((s) => nature(s).persona === 'brawler')!, keen);
  assert.equal(k.persona, 'brawler');
  assert.equal(k.brain.helm, keen.helm);
  assert.equal(k.brain.choice.fight, brawler.choice.fight);
  const bare = variant({ mind: { cover: 0 } }),
    turtle = SEEDS.find((s) => nature(s).persona === 'turtle')!;
  assert.ok(nature(turtle).brain.mind.cover > DEFAULT_BRAIN.mind.cover);
  assert.equal(nature(turtle, bare).brain.mind.cover, 0);
});

test("a match's mix weighs who sails it", () => {
  const bloodbath = TYPES.find((t) => t.name === 'bloodbath')!,
    cagey = TYPES.find((t) => t.name === 'cagey')!;
  const of = (mix = MIXED.mix) =>
    counts(SEEDS.map((s) => nature(s, DEFAULT_BRAIN, mix).persona));
  const even = of(),
    blood = of(bloodbath.mix),
    calm = of(cagey.mix);
  const fighters = (m: Map<string, number>) =>
    (m.get('brawler') ?? 0) + (m.get('hunter') ?? 0);
  assert.ok(fighters(blood) > 1.6 * fighters(even), `${[...blood]}`);
  assert.ok((calm.get('turtle') ?? 0) > 1.6 * (even.get('turtle') ?? 0));
  assert.ok((calm.get('brawler') ?? 0) < even.get('brawler')!);
});

test('the game deals each type about as often as it says, the same for a seed every time', () => {
  const seen = counts(SEEDS.map((s) => dealt(s).name));
  for (const t of TYPES) {
    const share = (seen.get(t.name) ?? 0) / SEEDS.length;
    assert.ok(Math.abs(share - t.dealt) < 0.05, `${t.name} ${share}`);
  }
  assert.equal(dealt(77), dealt(77));
  assert.equal(MIXED.rules, DEFAULT_RULES);
});

test("a bloodbath's storm closes sooner than a mixed match's, and a cagey one's later; a gold rush lays more", () => {
  const course = (name: string) =>
    TYPES.find((t) => t.name === name)!.rules.storm.phases.reduce(
      (t, p) => t + p.wait + p.close,
      0
    );
  assert.ok(course('bloodbath') < course('mixed'));
  assert.ok(course('cagey') > course('mixed'));
  const rush = TYPES.find((t) => t.name === 'gold rush')!;
  assert.ok(rush.rules.loot.spots > DEFAULT_RULES.loot.spots);
});
