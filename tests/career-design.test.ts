// Components, designing, the headquarters and suppliers (Phase B sections 8.2, 8.3, 8.7, 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPONENTS,
  TYPES,
  component,
  dealtKnown,
  summed,
  tierOpen,
  unknownOpen,
} from '../src/career/components.ts';
import {
  built,
  dealt,
  designCheck,
  drawn,
  pool,
  projection,
  started,
} from '../src/career/design.ts';
import {
  buildCost,
  buildDays,
  designSlots,
  factoryPoints,
  fishIncome,
  loftFactor,
  partBuildDays,
  sponsorGrade,
  upkeep,
  upkeepAt,
} from '../src/career/hq.ts';
import {
  SUPPLIERS,
  TRADES,
  supplierCards,
  suppliersCleared,
  termsFor,
  tradeOf,
} from '../src/career/suppliers.ts';
import { componentsKnown } from '../src/career/staff.ts';
import { dice } from '../src/career/dice.ts';
import { BUILDINGS } from '../src/career/world.ts';
import type { CareerState, Team } from '../src/career/state.ts';
import { TUNING } from '../src/career/tuning.ts';
import { founded, invariants, must, refused, withTeam } from './career-kit.ts';

const ME = () => founded().player!.team;

/** The player's team with every building at a level and a designer who knows every component. */
function ready(level = 3): CareerState {
  const s = founded();
  const me = ME();
  const t = withTeam(s, me, (c) => ({
    ...c,
    balance: 1e6,
    buildings: Object.fromEntries(
      BUILDINGS.map((b) => [b, { level, next: null }])
    ) as Team['buildings'],
  }));
  const w = t.teams[me].staff.designer!;
  const people = [...t.people];
  people[w] = { ...people[w], components: COMPONENTS.map((k) => k.id) };
  return { ...t, people };
}

test('components: 6 types × 3 tiers × 3; a grey one each tier carries risk; tiers unlocked by the test tank or foundry', () => {
  assert.equal(COMPONENTS.length, 54);
  assert.equal(new Set(COMPONENTS.map((k) => k.id)).size, 54);
  for (const type of TYPES)
    for (const tier of [1, 2, 3]) {
      const of = COMPONENTS.filter((k) => k.type === type && k.tier === tier);
      assert.equal(of.length, 3);
      assert.equal(
        of.filter((k) => k.effects.risk > 0).length,
        1,
        `${type} tier ${tier} has one grey component`
      );
    }
  const c = founded().teams[0];
  assert.equal(tierOpen(c.buildings, 'sails'), c.buildings.testTank.level);
  assert.equal(tierOpen(c.buildings, 'hull'), c.buildings.foundry.level);
  assert.equal(component('nothing'), null);
  assert.equal(
    summed(['sails.1.0', 'sails.1.0']).perf,
    2 * component('sails.1.0')!.effects.perf
  );
  assert.ok(
    unknownOpen([], c.buildings).every(
      (id) => component(id)!.tier <= tierOpen(c.buildings, component(id)!.type)
    )
  );
});

test('a designer knows 3 + round(stars) components of tiers 1 and 2, dealt by seed at founding and for new ones', () => {
  let x = 0.1;
  const rand = () => (x = (x * 9301 + 0.49297) % 1);
  const known = dealtKnown(rand, 4);
  assert.equal(known.length, componentsKnown(4));
  assert.ok(known.every((id) => component(id)!.tier <= 2));
  const s = founded();
  for (const g of s.people.filter((y) => y.role === 'designer').slice(0, 30)) {
    assert.ok(
      g.components.length >= 3,
      `designer ${g.id} knows ${g.components.length}`
    );
    assert.ok(
      g.components.every(
        (id) => component(id) !== null && component(id)!.tier <= 2
      )
    );
  }
  assert.deepEqual(
    founded().streams,
    { sponsors: 59, world: 1 },
    'dealt with no stream of their own'
  );
});

test('DealComponents: three cards a slot from the pool, seeded; one redeal a slot; refusals', () => {
  const s = ready();
  const me = ME();
  refused(
    s,
    { kind: 'DealComponents', type: 'anchor' as 'sails', slot: 0 },
    'type'
  );
  refused(
    s,
    { kind: 'DealComponents', type: 'sails', slot: designSlots(s.teams[me]) },
    'slot'
  );
  const t = must(s, { kind: 'DealComponents', type: 'sails', slot: 0 });
  const d = t.teams[me].draft!;
  assert.equal(d.type, 'sails');
  assert.equal(d.deals[0].cards.length, TUNING.design.deal);
  assert.ok(d.deals[0].cards.every((id) => pool(s, me, 'sails').includes(id)));
  assert.deepEqual(d.deals[0].cards, dealt(s, me, 'sails', 0, 0), 'seeded');
  const u = must(t, { kind: 'DealComponents', type: 'sails', slot: 0 });
  assert.equal(u.teams[me].draft!.deals[0].redealt, true);
  refused(u, { kind: 'DealComponents', type: 'sails', slot: 0 }, 'redealt');
  const other = must(u, { kind: 'DealComponents', type: 'hull', slot: 0 });
  assert.equal(
    other.teams[me].draft!.type,
    'hull',
    'a new type is a new draft'
  );
  const none = withTeam(s, me, (c) => ({
    ...c,
    staff: { ...c.staff, designer: null },
  }));
  refused(
    none,
    { kind: 'DealComponents', type: 'sails', slot: 0 },
    'noDesigner'
  );
});

test('the pool: known components of the type, of tiers the buildings unlock', () => {
  const s = ready(1);
  const me = ME();
  assert.ok(
    pool(s, me, 'keel').every(
      (id) => component(id)!.type === 'keel' && component(id)!.tier === 1
    )
  );
  assert.equal(pool(ready(3), me, 'keel').length, 9);
});

test('the projection: best of the type + designer × 8 + components; cost by tier and type; days by Speed and loft', () => {
  const s = ready();
  const me = ME();
  const base = projection(s, me, 'sails', []);
  const plus = projection(s, me, 'sails', ['sails.3.2']);
  const k = component('sails.3.2')!.effects;
  assert.ok(plus.numbers.perf === Math.min(1000, base.numbers.perf + k.perf));
  assert.ok(plus.numbers.risk === k.risk);
  assert.equal(
    plus.cost,
    Math.round(TUNING.design.cost.sails * TUNING.design.tier[2] + k.balance)
  );
  assert.equal(base.cost, TUNING.design.cost.sails);
  assert.equal(base.build, partBuildDays(s.teams[me]));
  assert.ok(
    base.numbers.perfMax >= base.numbers.perf &&
      base.numbers.reliability <= base.numbers.reliabilityMax
  );
  const quick = projection(s, me, 'rigging', ['rigging.1.0']);
  assert.ok(
    quick.days < projection(s, me, 'rigging', []).days,
    'a quick component saves days'
  );
});

test('StartDesign: refusals; paid; drawn by Accuracy; built unfitted with mail; one design at a time', () => {
  let s = ready();
  const me = ME();
  s = must(s, { kind: 'DealComponents', type: 'sails', slot: 0 });
  s = must(s, { kind: 'DealComponents', type: 'sails', slot: 1 });
  const [a, b] = [
    s.teams[me].draft!.deals[0].cards[0],
    s.teams[me].draft!.deals[1].cards.find(
      (x) => x !== s.teams[me].draft!.deals[0].cards[0]
    )!,
  ];
  refused(
    s,
    { kind: 'StartDesign', type: 'sails', components: [a, a], forNext: false },
    'twice'
  );
  refused(
    s,
    {
      kind: 'StartDesign',
      type: 'sails',
      components: ['hull.1.0'],
      forNext: false,
    },
    'card'
  );
  refused(
    s,
    {
      kind: 'StartDesign',
      type: 'sails',
      components: [a, b, 'x', 'y', 'z'],
      forNext: false,
    },
    'slots'
  );
  refused(
    s,
    { kind: 'StartDesign', type: 'sails', components: [a], forNext: true },
    'forNext'
  );
  refused(
    withTeam(s, me, (c) => ({ ...c, balance: c.debtFloor })),
    { kind: 'StartDesign', type: 'sails', components: [a], forNext: false },
    'balance'
  );
  const tier = s.teams[me].tier;
  const championships = [...s.championships];
  championships[tier] = {
    ...championships[tier],
    rules: { ...championships[tier].rules, spec: ['sails'] },
  };
  refused(
    { ...s, championships },
    { kind: 'StartDesign', type: 'sails', components: [a], forNext: false },
    'spec'
  );
  const p = projection(s, me, 'sails', [a, b]);
  const t = must(s, {
    kind: 'StartDesign',
    type: 'sails',
    components: [a, b],
    forNext: false,
  });
  const c = t.teams[me];
  assert.equal(c.balance, s.teams[me].balance - p.cost);
  assert.equal(c.draft, null);
  assert.equal(c.designs, 1);
  assert.equal(c.design!.designed, s.day + p.days);
  assert.ok(
    t.queue.some(
      (e) => e.kind === 'designed' && e.team === me && e.day === s.day + p.days
    )
  );
  refused(
    t,
    { kind: 'StartDesign', type: 'sails', components: [], forNext: false },
    'inHand'
  );
  const u = drawn(
    { ...t, day: c.design!.designed },
    { kind: 'designed', team: me, day: 0, seq: 0 },
    dice(t.seed, t.streams)
  );
  const d = u.teams[me].design!.drawn!;
  assert.ok(d.perf <= d.perfMax && d.perf > 0);
  assert.ok(u.mail.some((m) => m.kind === 'designFinished'));
  assert.ok(u.queue.some((e) => e.kind === 'built' && e.team === me));
  const v = built(
    { ...u, day: c.design!.built },
    { kind: 'built', team: me, day: 0, seq: 0 }
  );
  const part = v.teams[me].parts.find((x) => x.id === u.ids.part)!;
  assert.equal(part.ship, null, 'the player fits it');
  assert.equal(part.perf, d.perf);
  assert.equal(v.teams[me].design, null);
  assert.ok(v.mail.some((m) => m.kind === 'partBuilt'));
  invariants(v);
});

test('a design for next season: from the fifth round; carried whole; never fitted this season', () => {
  const s = { ...ready(), round: 4 };
  const me = ME();
  assert.equal(designCheck(s, me, 'keel', [], true), null);
  const t = started(s, me, 'keel', [], true);
  assert.equal(t.teams[me].design!.forNext, true);
});

test("a rival fits a part it builds where it beats the worse ship's", () => {
  const s = founded();
  const rival = (ME() + 1) % s.teams.length;
  const t = started(
    withTeam(s, rival, (c) => ({ ...c, balance: 1e6 })),
    rival,
    'rudder',
    [],
    false
  );
  const d = t.teams[rival].design!;
  const u = withTeam(t, rival, (c) => ({
    ...c,
    design: { ...d, drawn: { ...d.projected, perf: 999, perfMax: 999 } },
  }));
  const v = built(u, { kind: 'built', team: rival, day: 0, seq: 0 });
  assert.notEqual(
    v.teams[rival].parts.find((p) => p.id === u.ids.part)!.ship,
    null
  );
  invariants(v);
});

test("the headquarters: levels' costs, days and upkeep; each level's effect", () => {
  const c = founded().teams[0];
  for (const b of BUILDINGS) {
    assert.equal(
      buildCost(b, 1),
      0,
      'every team holds each building at level 1'
    );
    for (const l of [2, 3])
      assert.ok(
        buildCost(b, l) > 0 && buildDays(b, l) > 0 && upkeepAt(b, l) >= 0
      );
    assert.ok(
      buildCost(b, 3) > buildCost(b, 2) && upkeepAt(b, 3) >= upkeepAt(b, 1)
    );
  }
  const at = (b: string, level: number): Team => ({
    ...c,
    buildings: { ...c.buildings, [b]: { level, next: null } },
  });
  assert.deepEqual(
    [1, 2, 3].map((l) => factoryPoints(at('factory', l))),
    [10, 20, 30]
  );
  assert.deepEqual(
    [1, 2, 3].map((l) => partBuildDays(at('factory', l))),
    [6, 5, 4]
  );
  assert.deepEqual(
    [1, 2, 3].map((l) => designSlots(at('drawingLoft', l))),
    [2, 3, 4]
  );
  assert.deepEqual(
    [1, 2, 3].map((l) => loftFactor(at('drawingLoft', l))),
    [1, 0.85, 0.7]
  );
  assert.ok(fishIncome(at('fishMarket', 3)) > fishIncome(at('fishMarket', 1)));
  assert.deepEqual(
    [1, 2, 3].map((l) => sponsorGrade(at('landingPad', l))),
    [1, 2, 3]
  );
  assert.equal(
    upkeep(c),
    BUILDINGS.reduce((a, b) => a + upkeepAt(b, c.buildings[b].level), 0)
  );
});

test('Build: refusals; paid; finishes after its days with mail; any number under way', () => {
  const me = ME();
  const s = withTeam(founded(), me, (c) => ({
    ...c,
    balance: 1e6,
    buildings: {
      ...c.buildings,
      factory: { level: 1, next: null },
      foundry: { level: 1, next: null },
      landingPad: { level: 3, next: null },
    },
  }));
  refused(s, { kind: 'Build', building: 'castle' as 'factory' }, 'building');
  refused(s, { kind: 'Build', building: 'landingPad' }, 'top');
  refused(
    withTeam(s, me, (c) => ({ ...c, balance: c.debtFloor })),
    { kind: 'Build', building: 'factory' },
    'balance'
  );
  const t = must(must(s, { kind: 'Build', building: 'factory' }), {
    kind: 'Build',
    building: 'foundry',
  });
  refused(t, { kind: 'Build', building: 'factory' }, 'underWay');
  assert.equal(
    t.teams[me].balance,
    1e6 - buildCost('factory', 2) - buildCost('foundry', 2)
  );
  const done = t.teams[me].buildings.factory.next!.done;
  assert.equal(done, s.day + buildDays('factory', 2));
  const e = t.queue.find(
    (x) => x.kind === 'building' && x.team === me && x.building === 'factory'
  )!;
  assert.equal(e.day, done);
});

test('suppliers: five a trade, three cards dealt by seed; chosen once in the off-season, paid once; terms by type', () => {
  assert.equal(SUPPLIERS.length, 15);
  for (const t of TRADES)
    assert.equal(SUPPLIERS.filter((x) => x.trade === t).length, 5);
  assert.equal(tradeOf('keel'), 'timber');
  assert.equal(tradeOf('rigging'), 'canvas');
  assert.equal(tradeOf('mounts'), 'cordage');
  const s = founded();
  const me = ME();
  const cards = supplierCards(s.seed, me, s.season, 'canvas');
  assert.equal(cards.length, 3);
  assert.deepEqual(cards, supplierCards(s.seed, me, s.season, 'canvas'));
  const out = SUPPLIERS.find(
    (x) => x.trade === 'canvas' && !cards.includes(x)
  )!;
  refused(
    s,
    { kind: 'ChooseSupplier', trade: 'canvas', supplier: out.id },
    'card'
  );
  refused(
    s,
    {
      kind: 'ChooseSupplier',
      trade: 'rope' as 'canvas',
      supplier: cards[0].id,
    },
    'trade'
  );
  refused(
    { ...s, round: 1 },
    { kind: 'ChooseSupplier', trade: 'canvas', supplier: cards[0].id },
    'season'
  );
  const rich = withTeam(s, me, (c) => ({
    ...c,
    balance: 1e5,
    suppliers: { ...c.suppliers, canvas: null },
  }));
  const t = must(rich, {
    kind: 'ChooseSupplier',
    trade: 'canvas',
    supplier: cards[0].id,
  });
  assert.equal(t.teams[me].balance, 1e5 - cards[0].balance);
  assert.deepEqual(termsFor(t.teams[me].suppliers, 'sails'), cards[0].terms);
  refused(
    t,
    { kind: 'ChooseSupplier', trade: 'canvas', supplier: cards[1].id },
    'chosen'
  );
  assert.ok(
    suppliersCleared(t).teams.every((c) => c.suppliers.canvas === null)
  );
  assert.deepEqual(
    termsFor({ timber: null, canvas: null, cordage: null }, 'hull'),
    { start: 0, max: 0, reliability: 0, wear: 1, improvement: 1, cost: 1 }
  );
});
