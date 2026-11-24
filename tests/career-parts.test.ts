// Parts: what a part gives a race card, fitting and the ships' politics, wear
// and Feedback, the improvement, and the season's carry-over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTS, TEAM, type RaceResult } from '../src/race.ts';
import { ZONES } from '../src/kinds.ts';
import {
  bestFitted,
  carried,
  fitted,
  fittedOf,
  fittedParts,
  partsAfterRace,
  performanceOf,
  standardPart,
  worn,
} from '../src/career/parts.ts';
import { fullyFitted, shipParts } from './career-kit.ts';
import {
  worked,
  improvementCheck,
  improvementPoints,
  improvementSet,
  improvementTo,
} from '../src/career/improvement.ts';
import { factoryPoints } from '../src/career/hq.ts';
import { feedbackPoints } from '../src/career/staff.ts';
import { effective } from '../src/career/effective.ts';
import type { PersonOf } from '../src/career/roles.ts';
import type { Part } from '../src/career/state.ts';
import { TUNING } from '../src/career/tuning.ts';
import { founded, invariants, must, refused, withTeam } from './career-kit.ts';

const part = (over: Partial<Part>): Part => ({
  ...standardPart(9000, 'sails', null),
  spec: false,
  perfMax: 900,
  reliabilityMax: 0.95,
  ...over,
});

test('a part as fitted: performance 1 at the standard part, ± 0.15 over the whole of perf; reliability as worn', () => {
  const P = TUNING.parts;
  assert.equal(performanceOf(P.standard.perf), 1);
  assert.ok(
    Math.abs(performanceOf(1000) - performanceOf(0) - P.handling) < 1e-12
  );
  assert.deepEqual(fittedOf(standardPart(1, 'hull', 0)), {
    performance: 1,
    reliability: 0.5,
  });
  const tired = fittedOf(part({ perf: 700, reliability: 0.8, condition: 0.5 }));
  assert.ok(tired.performance > 1);
  assert.equal(tired.reliability, 0.4, 'reliability × condition');
  const s = founded();
  const c = s.teams[s.player!.team];
  const on = fittedParts(c, 2);
  for (const type of PARTS) {
    const p = c.parts.find((x) => x.ship === 2 && x.type === type)!;
    assert.deepEqual(on[type], fittedOf(p));
  }
  const bare = fittedParts({ ...c, parts: [] }, 0);
  assert.deepEqual(
    bare.sails,
    { performance: performanceOf(0), reliability: 0 },
    'a missing type is a part of no performance that faults at once'
  );
});

test("the world: every team's ships carry one part of each type", () => {
  const s = founded();
  for (const c of s.teams) assert.ok(fullyFitted(c));
  const me = s.teams[s.player!.team];
  assert.equal(shipParts(me, 0).length, 6);
});

test('FitPart: refusals, a swap between ships, a spare in with the old part to the spares', () => {
  const s0 = founded();
  const me = s0.player!.team;
  const c = s0.teams[me];
  const sails0 = c.parts.find((p) => p.ship === 0 && p.type === 'sails')!;
  const sails1 = c.parts.find((p) => p.ship === 1 && p.type === 'sails')!;
  refused(s0, { kind: 'FitPart', part: 999999, ship: 0 }, 'part');
  refused(s0, { kind: 'FitPart', part: sails0.id, ship: null }, 'bare');
  refused(s0, { kind: 'FitPart', part: sails0.id, ship: 4 as 0 }, 'ship');
  refused(s0, { kind: 'FitPart', part: sails0.id, ship: 0 }, 'fitted');
  refused(
    { ...s0, race: { round: 0, started: true, results: [null, null, null] } },
    { kind: 'FitPart', part: sails0.id, ship: 1 },
    'racing'
  );
  const swapped = must(s0, { kind: 'FitPart', part: sails0.id, ship: 1 });
  const after = swapped.teams[me].parts;
  assert.equal(after.find((p) => p.id === sails0.id)!.ship, 1);
  assert.equal(after.find((p) => p.id === sails1.id)!.ship, 0, 'the two swap');
  const spare = part({ id: 50000, type: 'sails', perf: 999, perfMax: 999 });
  const s1 = withTeam(s0, me, (x) => ({ ...x, parts: [...x.parts, spare] }));
  refused(
    withTeam(s1, me, (x) => ({
      ...x,
      parts: x.parts.map((p) =>
        p.id === spare.id ? { ...p, forNext: true } : p
      ),
    })),
    { kind: 'FitPart', part: spare.id, ship: 0 },
    'forNext'
  );
  const t = must(s1, { kind: 'FitPart', part: spare.id, ship: 0 });
  assert.equal(
    t.teams[me].parts.find((p) => p.id === sails0.id)!.ship,
    null,
    'the old part goes to the spares'
  );
  assert.ok(fullyFitted(t.teams[me]));
  invariants(t);
});

test("the ships' politics: a second new part in a row to one ship costs the other ships' drivers morale", () => {
  let s = founded();
  const me = s.player!.team;
  // a rival team: every ship has a driver
  const rival = (me + 1) % s.teams.length;
  const others = s.teams[rival].staff.ships.slice(1).map((h) => h.driver!);
  const first = s.teams[rival].staff.ships[0].driver!;
  s = withTeam(s, rival, (x) => ({
    ...x,
    parts: [
      ...x.parts,
      part({ id: 50001, type: 'keel', perf: 2000, perfMax: 2000 }),
      part({ id: 50002, type: 'keel', perf: 2100, perfMax: 2100 }),
    ],
  }));
  const morale = (state: typeof s) =>
    others.map((id) => state.people[id].morale);
  const once = fitted(s, rival, 50001, 0);
  assert.equal(once.teams[rival].lastNew.keel, 0);
  assert.deepEqual(morale(once), morale(s), 'the first new part costs nothing');
  assert.equal(once.flags[`newPart:${rival}`], s.day);
  const twice = fitted(once, rival, 50002, 0);
  assert.deepEqual(
    morale(twice),
    morale(s).map((m) => Math.max(0, m - TUNING.parts.newPartMorale))
  );
  assert.equal(
    twice.people[first].morale,
    s.people[first].morale,
    'the driver who got it loses none'
  );
  const toTwo = fitted(once, rival, 50002, 1);
  assert.deepEqual(
    morale(toTwo),
    morale(s),
    'a new part to another ship costs nothing'
  );
  assert.equal(toTwo.teams[rival].lastNew.keel, 1);
});

test("wear: 0.1 a race and 0.05 a fault, × the supplier's wear, never below 0", () => {
  assert.equal(worn(1, 0, 1), 0.9);
  assert.equal(worn(1, 2, 1), 0.8);
  assert.equal(worn(1, 0, 0.5), 0.95);
  assert.equal(worn(0.05, 3, 1), 0);
});

test("after a race: the ships that sailed wear their parts by faults; the driver's Feedback goes to the part furthest below its maximum", () => {
  let s = founded();
  const me = s.player!.team;
  const rival = (me + 1) % s.teams.length;
  s = { ...s, teams: s.teams.map((c) => ({ ...c, improvementDay: s.day })) };
  const c = s.teams[rival];
  const target = c.parts
    .filter((p) => p.ship === 1)
    .sort(
      (a, b) => b.perfMax - b.perf - (a.perfMax - a.perf) || a.id - b.id
    )[0];
  const waterline = ZONES.indexOf('waterline');
  const result: RaceResult = {
    seed: 1,
    tier: c.tier,
    round: 0,
    order: [7, 8],
    sinkings: [],
    seaHeld: [],
    pits: [],
    hits: [],
    seconds: 600,
    faults: [
      { id: 8, zone: waterline, level: 1, second: 30 },
      { id: 8, zone: waterline, level: 1, second: 60 },
      { id: 7, zone: waterline, level: 2, second: 60 },
    ],
    hash: '00000000',
  };
  const t = partsAfterRace(s, rival, [null, 8, null, null], result);
  const after = t.teams[rival].parts;
  for (const p of c.parts.filter((x) => x.ship === 0))
    assert.equal(
      after.find((x) => x.id === p.id)!.condition,
      p.condition,
      'ship one did not sail'
    );
  // a fault of the waterline wears the parts that make it (hull and keel), and no other
  for (const type of PARTS) {
    const p = after.find((x) => x.ship === 1 && x.type === type)!;
    const faults = type === 'hull' || type === 'keel' ? 2 : 0;
    assert.equal(p.condition, worn(1, faults, 1), type);
  }
  const cap = s.people[c.staff.ships[1].driver!] as PersonOf<'driver'>;
  const gain = feedbackPoints(effective(cap, null).feedback);
  const got = after.find((x) => x.id === target.id)!;
  assert.ok(
    Math.abs(got.perf - Math.min(target.perfMax, target.perf + gain)) < 0.11
  );
});

test("the improvement: factory points plus each mechanic's (Reliability + Performance) / 4", () => {
  const s = founded();
  const c = s.teams[0];
  let want = factoryPoints(c);
  assert.equal(c.staff.ships.length, TEAM);
  for (const h of c.staff.ships) {
    const b = effective(s.people[h.mechanic!] as PersonOf<'mechanic'>, null);
    want += (b.reliability + b.perf) / 4;
  }
  assert.ok(Math.abs(improvementPoints(s, 0) - want) < 1e-9);
  assert.deepEqual(
    [1, 3, 5].map((level) =>
      factoryPoints({
        ...c,
        buildings: { ...c.buildings, factory: { level, next: null } },
      })
    ),
    [10, 20, 30]
  );
});

test('the improvement: condition first (most worn first), then the shares, each up to its maximum; spec parts never', () => {
  const one = { perf: 1, reliability: 1 };
  const a = part({ id: 1, ship: 0, condition: 0.5, perf: 500 });
  const b = part({ id: 2, ship: 1, condition: 0.9, perf: 500 });
  const sp = { ...standardPart(3, 'hull', 0) };
  // 30 points: 30 restore a's 0.3 of 0.5 needed
  let out = worked(
    [a, b, sp],
    30,
    [{ part: 1, perf: 1, reliability: 0 }],
    () => one
  );
  assert.equal(out[0].condition, 0.8);
  assert.equal(out[1].condition, 0.9, 'the most worn first');
  assert.equal(out[0].perf, 500, 'nothing left for the shares');
  // 100 points: 50 + 10 restore both, 40 split
  out = worked(
    [a, b, sp],
    100,
    [
      { part: 1, perf: 0.5, reliability: 0 },
      { part: 2, perf: 0, reliability: 0.5 },
      { part: 3, perf: 0.5, reliability: 0 },
    ],
    () => one
  );
  assert.deepEqual(
    out.map((p) => p.condition),
    [1, 1, 1]
  );
  assert.equal(out[0].perf, 520);
  assert.equal(
    out[1].reliability,
    Math.min(
      b.reliabilityMax,
      Math.round((b.reliability + 20 * TUNING.improvement.reliability) * 1000) /
        1000
    )
  );
  assert.equal(
    out[2].perf,
    TUNING.parts.standard.perf,
    'a spec part is never improved'
  );
  out = worked([a], 1e6, [{ part: 1, perf: 1, reliability: 0 }], () => one);
  assert.equal(out[0].perf, a.perfMax);
});

test('SetImprovement: each refusal; the work so far reckoned on the old split; over days in closed form', () => {
  const s0 = founded();
  const me = s0.player!.team;
  const c = s0.teams[me];
  const [p, q] = c.parts.filter((x) => x.ship !== null);
  refused(
    s0,
    {
      kind: 'SetImprovement',
      shares: [{ part: p.id, perf: 1.2, reliability: 0 }],
    },
    'shares'
  );
  refused(
    s0,
    {
      kind: 'SetImprovement',
      shares: [{ part: 999999, perf: 0.1, reliability: 0 }],
    },
    'part'
  );
  refused(
    s0,
    {
      kind: 'SetImprovement',
      shares: [
        { part: p.id, perf: 0.1, reliability: 0 },
        { part: p.id, perf: 0.1, reliability: 0 },
      ],
    },
    'twice'
  );
  refused(
    s0,
    {
      kind: 'SetImprovement',
      shares: [
        { part: p.id, perf: 0.6, reliability: 0 },
        { part: q.id, perf: 0.5, reliability: 0 },
      ],
    },
    'over'
  );
  const spec = withTeam(s0, me, (x) => ({
    ...x,
    parts: x.parts.map((y) => (y.id === p.id ? { ...y, spec: true } : y)),
  }));
  refused(
    spec,
    {
      kind: 'SetImprovement',
      shares: [{ part: p.id, perf: 0.5, reliability: 0 }],
    },
    'spec'
  );
  const set = must(s0, {
    kind: 'SetImprovement',
    shares: [{ part: p.id, perf: 1, reliability: 0 }],
  });
  const later = { ...set, day: set.day + 3 };
  const t = improvementTo(later, me);
  const pts = 3 * improvementPoints(later, me);
  const got = t.teams[me].parts.find((x) => x.id === p.id)!;
  assert.ok(
    got.perf > p.perf && got.perf <= Math.min(p.perfMax, p.perf + pts * 2),
    `${p.perf} → ${got.perf}`
  );
  assert.equal(t.teams[me].improvementDay, later.day);
  assert.equal(
    improvementSet(later, me, []).teams[me].parts.find((x) => x.id === p.id)!
      .perf,
    got.perf,
    'a new split reckons the old first'
  );
  assert.equal(improvementCheck(s0, me, []), null);
});

test('carry-over: spec types standard, designs for next season whole, the rest × 0.85 with risk stripped, the best spare kept', () => {
  let s = founded();
  const rival = (s.player!.team + 1) % s.teams.length;
  const tier = s.teams[rival].tier;
  const championships = [...s.championships];
  championships[tier] = {
    ...championships[tier],
    rules: { ...championships[tier].rules, spec: ['hull'] },
  };
  s = {
    ...withTeam({ ...s, championships }, rival, (x) => ({
      ...x,
      parts: [
        ...x.parts,
        part({
          id: 60001,
          type: 'sails',
          perf: 800,
          perfMax: 900,
          forNext: true,
          risk: 0.3,
        }),
        part({
          id: 60002,
          type: 'keel',
          perf: 700,
          perfMax: 800,
          risk: 0.2,
          condition: 0.4,
        }),
        part({ id: 60003, type: 'keel', perf: 600, perfMax: 700 }),
      ],
    })),
  };
  const t = carried(s, rival);
  const c = t.teams[rival];
  assert.ok(
    c.parts
      .filter((p) => p.type === 'hull')
      .every((p) => p.spec && p.perf === TUNING.parts.standard.perf)
  );
  assert.equal(c.parts.filter((p) => p.type === 'hull').length, TEAM);
  const next = c.parts.find((p) => p.id === 60001)!;
  assert.equal(next.perf, 800, 'a design for next season is carried whole');
  assert.equal(next.forNext, false);
  const keel = c.parts.find((p) => p.id === 60002)!;
  assert.deepEqual(
    [keel.perf, keel.perfMax, keel.risk, keel.condition],
    [
      Math.round(700 * TUNING.parts.carry),
      Math.round(800 * TUNING.parts.carry),
      0,
      1,
    ]
  );
  assert.equal(TUNING.parts.carry, 0.85);
  assert.ok(
    !c.parts.some((p) => p.id === 60003),
    'only the best spare of a type is kept'
  );
  assert.ok(fullyFitted(c));
  assert.ok(t.ids.part > s.ids.part);
});

test('a rival fits its best part of each type to its first ship, the next to its second, and so on', () => {
  const s = founded();
  const c = s.teams[1];
  const extra = part({ id: 70000, type: 'rudder', perf: 5000, perfMax: 5000 });
  const b = bestFitted({ ...c, parts: [...c.parts, extra] });
  assert.equal(b.parts.find((p) => p.id === 70000)!.ship, 0);
  const rudders = [0, 1, 2, 3].map(
    (ship) => b.parts.find((p) => p.ship === ship && p.type === 'rudder')!.perf
  );
  assert.deepEqual(
    rudders,
    [...rudders].sort((x, y) => y - x),
    'better parts to the earlier ships'
  );
  assert.ok(fullyFitted(b));
});
