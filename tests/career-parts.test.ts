// Parts (Phase B sections 8.1, 8.4, 8.6, 8.7): handling, fitting and the two ships' politics, wear and Feedback,
// the yard, and the season's carry-over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RaceResult } from '../src/race.ts';
import {
  bestFitted,
  carried,
  fitted,
  fullyFitted,
  handlingFactor,
  handlingFrom,
  partsAfterRace,
  shipParts,
  standardPart,
  worn,
} from '../src/career/parts.ts';
import {
  worked,
  yardCheck,
  yardPoints,
  yardSet,
  yardTo,
} from '../src/career/yard.ts';
import { factoryPoints } from '../src/career/rookery.ts';
import { feedbackPoints } from '../src/career/staff.ts';
import { effective } from '../src/career/effective.ts';
import type { GullOf } from '../src/career/roles.ts';
import type { Part } from '../src/career/state.ts';
import { TUNING } from '../src/career/tuning.ts';
import { founded, invariants, must, refused, withCrew } from './career-kit.ts';

const SPEC = {
  top: 10,
  gather: 2,
  turn: 1,
  answer: 0.5,
  hull: 100,
  spread: 0.2,
  reload: 3,
};
const part = (over: Partial<Part>): Part => ({
  ...standardPart(9000, 'sails', null),
  spec: false,
  perfMax: 900,
  reliabilityMax: 0.95,
  ...over,
});

test("handling: each type's factor 1 + 0.15 × perf / 1000 on its handling; keel and mounts lower spread and reload", () => {
  assert.equal(handlingFactor(0), 1);
  assert.equal(handlingFactor(1000), 1 + TUNING.parts.handling);
  const parts = (
    ['sails', 'rigging', 'rudder', 'hull', 'keel', 'mounts'] as const
  ).map((type, i) => part({ id: i, type, perf: 1000 }));
  const h = handlingFrom(SPEC, parts);
  const f = 1.15;
  assert.ok(
    Math.abs(h.top - 10 * f) < 1e-9 &&
      Math.abs(h.gather - 2 * f) < 1e-9 &&
      Math.abs(h.turn - f) < 1e-9 &&
      Math.abs(h.answer - 0.5 * f) < 1e-9
  );
  assert.ok(
    Math.abs(h.hull - 100 * f) < 1e-9 &&
      Math.abs(h.spread - 0.2 * 0.85) < 1e-9 &&
      Math.abs(h.reload - 3 * 0.85) < 1e-9
  );
  assert.deepEqual(
    handlingFrom(SPEC, []),
    SPEC,
    'a missing type counts as performance 0'
  );
});

test("the world: every crew's two ships carry one part of each type", () => {
  const s = founded();
  for (const c of s.crews) assert.ok(fullyFitted(c));
  const me = s.crews[s.player!.crew];
  assert.equal(shipParts(me, 0).length, 6);
});

test('FitPart: refusals, a swap between ships, a spare in with the old part to the spares', () => {
  const s0 = founded();
  const me = s0.player!.crew;
  const c = s0.crews[me];
  const sails0 = c.parts.find((p) => p.ship === 0 && p.type === 'sails')!;
  const sails1 = c.parts.find((p) => p.ship === 1 && p.type === 'sails')!;
  refused(s0, { kind: 'FitPart', part: 999999, ship: 0 }, 'part');
  refused(s0, { kind: 'FitPart', part: sails0.id, ship: null }, 'bare');
  refused(s0, { kind: 'FitPart', part: sails0.id, ship: 2 as 0 }, 'ship');
  refused(s0, { kind: 'FitPart', part: sails0.id, ship: 0 }, 'fitted');
  refused(
    { ...s0, race: { round: 0, started: true, results: [null, null, null] } },
    { kind: 'FitPart', part: sails0.id, ship: 1 },
    'racing'
  );
  const swapped = must(s0, { kind: 'FitPart', part: sails0.id, ship: 1 });
  const after = swapped.crews[me].parts;
  assert.equal(after.find((p) => p.id === sails0.id)!.ship, 1);
  assert.equal(after.find((p) => p.id === sails1.id)!.ship, 0, 'the two swap');
  const spare = part({ id: 50000, type: 'sails', perf: 999, perfMax: 999 });
  const s1 = withCrew(s0, me, (x) => ({ ...x, parts: [...x.parts, spare] }));
  refused(
    withCrew(s1, me, (x) => ({
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
    t.crews[me].parts.find((p) => p.id === sails0.id)!.ship,
    null,
    'the old part goes to the spares'
  );
  assert.ok(fullyFitted(t.crews[me]));
  invariants(t);
});

test("two ships' politics: a second new part in a row to ship one costs ship two's captain morale", () => {
  let s = founded();
  const me = s.player!.crew;
  // a rival crew, whose ship two has a captain
  const rival = (me + 1) % s.crews.length;
  const cap = s.crews[rival].staff.ships[1].captain!;
  s = withCrew(s, rival, (x) => ({
    ...x,
    parts: [
      ...x.parts,
      part({ id: 50001, type: 'keel', perf: 2000, perfMax: 2000 }),
      part({ id: 50002, type: 'keel', perf: 2100, perfMax: 2100 }),
    ],
  }));
  const morale = s.gulls[cap].morale;
  const once = fitted(s, rival, 50001, 0);
  assert.equal(once.crews[rival].lastNew.keel, 0);
  assert.equal(
    once.gulls[cap].morale,
    morale,
    'the first new part costs nothing'
  );
  assert.equal(once.flags[`newPart:${rival}`], s.day);
  const twice = fitted(once, rival, 50002, 0);
  assert.equal(
    twice.gulls[cap].morale,
    Math.max(0, morale - TUNING.parts.newPartMorale)
  );
  const toTwo = fitted(once, rival, 50002, 1);
  assert.equal(
    toTwo.gulls[cap].morale,
    morale,
    'a new part to ship two costs nothing'
  );
  assert.equal(toTwo.crews[rival].lastNew.keel, 1);
});

test("wear: 0.1 a race and 0.05 a fault, × the supplier's wear, never below 0", () => {
  assert.equal(worn(1, 0, 1), 0.9);
  assert.equal(worn(1, 2, 1), 0.8);
  assert.equal(worn(1, 0, 0.5), 0.95);
  assert.equal(worn(0.05, 3, 1), 0);
});

test("after a race: the ships that sailed wear their parts by faults; the captain's Feedback goes to the part furthest below its maximum", () => {
  let s = founded();
  const me = s.player!.crew;
  const rival = (me + 1) % s.crews.length;
  s = { ...s, crews: s.crews.map((c) => ({ ...c, yardDay: s.day })) };
  const c = s.crews[rival];
  const target = c.parts
    .filter((p) => p.ship === 1)
    .sort(
      (a, b) => b.perfMax - b.perf - (a.perfMax - a.perf) || a.id - b.id
    )[0];
  const result: RaceResult = {
    seed: 1,
    league: c.league,
    round: 0,
    order: [7, 8],
    sinkings: [],
    seaHeld: [],
    stops: [],
    hits: [],
    seconds: 600,
    faults: [
      { id: 8, type: 'hull', second: 30 },
      { id: 8, type: 'hull', second: 60 },
    ],
  };
  const t = partsAfterRace(s, rival, [null, 8], result);
  const after = t.crews[rival].parts;
  for (const p of c.parts.filter((x) => x.ship === 0))
    assert.equal(
      after.find((x) => x.id === p.id)!.condition,
      p.condition,
      'ship one did not sail'
    );
  const hull = after.find((x) => x.ship === 1 && x.type === 'hull')!;
  assert.equal(hull.condition, worn(1, 2, 1));
  const cap = s.gulls[c.staff.ships[1].captain!] as GullOf<'captain'>;
  const gain = feedbackPoints(effective(cap, null).feedback);
  const got = after.find((x) => x.id === target.id)!;
  assert.ok(
    Math.abs(got.perf - Math.min(target.perfMax, target.perf + gain)) < 0.11
  );
});

test("the yard: factory points plus each bosun's (Reliability + Performance) / 4", () => {
  const s = founded();
  const c = s.crews[0];
  let want = factoryPoints(c);
  for (const ship of [0, 1] as const) {
    const b = effective(
      s.gulls[c.staff.ships[ship].bosun!] as GullOf<'bosun'>,
      null
    );
    want += (b.reliability + b.perf) / 4;
  }
  assert.ok(Math.abs(yardPoints(s, 0) - want) < 1e-9);
  assert.deepEqual(
    [1, 2, 3].map((level) =>
      factoryPoints({
        ...c,
        buildings: { ...c.buildings, factory: { level, next: null } },
      })
    ),
    [10, 20, 30]
  );
});

test('the yard: condition first (most worn first), then the shares, each up to its maximum; spec parts never', () => {
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
      Math.round((b.reliability + 20 * TUNING.yard.reliability) * 1000) / 1000
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

test('SetYard: each refusal; the work so far reckoned on the old split; over days in closed form', () => {
  const s0 = founded();
  const me = s0.player!.crew;
  const c = s0.crews[me];
  const [p, q] = c.parts.filter((x) => x.ship !== null);
  refused(
    s0,
    { kind: 'SetYard', shares: [{ part: p.id, perf: 1.2, reliability: 0 }] },
    'shares'
  );
  refused(
    s0,
    { kind: 'SetYard', shares: [{ part: 999999, perf: 0.1, reliability: 0 }] },
    'part'
  );
  refused(
    s0,
    {
      kind: 'SetYard',
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
      kind: 'SetYard',
      shares: [
        { part: p.id, perf: 0.6, reliability: 0 },
        { part: q.id, perf: 0.5, reliability: 0 },
      ],
    },
    'over'
  );
  const spec = withCrew(s0, me, (x) => ({
    ...x,
    parts: x.parts.map((y) => (y.id === p.id ? { ...y, spec: true } : y)),
  }));
  refused(
    spec,
    { kind: 'SetYard', shares: [{ part: p.id, perf: 0.5, reliability: 0 }] },
    'spec'
  );
  const set = must(s0, {
    kind: 'SetYard',
    shares: [{ part: p.id, perf: 1, reliability: 0 }],
  });
  const later = { ...set, day: set.day + 3 };
  const t = yardTo(later, me);
  const pts = 3 * yardPoints(later, me);
  const got = t.crews[me].parts.find((x) => x.id === p.id)!;
  assert.ok(
    got.perf > p.perf && got.perf <= Math.min(p.perfMax, p.perf + pts * 2),
    `${p.perf} → ${got.perf}`
  );
  assert.equal(t.crews[me].yardDay, later.day);
  assert.equal(
    yardSet(later, me, []).crews[me].parts.find((x) => x.id === p.id)!.perf,
    got.perf,
    'a new split reckons the old first'
  );
  assert.equal(yardCheck(s0, me, []), null);
});

test('carry-over: spec types standard, designs for next season whole, the rest × 0.6 with risk stripped, the best spare kept', () => {
  let s = founded();
  const rival = (s.player!.crew + 1) % s.crews.length;
  const league = s.crews[rival].league;
  const leagues = [...s.leagues];
  leagues[league] = {
    ...leagues[league],
    rules: { ...leagues[league].rules, spec: ['hull'] },
  };
  s = {
    ...withCrew({ ...s, leagues }, rival, (x) => ({
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
  const c = t.crews[rival];
  assert.ok(
    c.parts
      .filter((p) => p.type === 'hull')
      .every((p) => p.spec && p.perf === TUNING.parts.standard.perf)
  );
  assert.equal(c.parts.filter((p) => p.type === 'hull').length, 2);
  const next = c.parts.find((p) => p.id === 60001)!;
  assert.equal(next.perf, 800, 'a design for next season is carried whole');
  assert.equal(next.forNext, false);
  const keel = c.parts.find((p) => p.id === 60002)!;
  assert.deepEqual(
    [keel.perf, keel.perfMax, keel.risk, keel.condition],
    [420, 480, 0, 1]
  );
  assert.ok(
    !c.parts.some((p) => p.id === 60003),
    'only the best spare of a type is kept'
  );
  assert.ok(fullyFitted(c));
  assert.ok(t.ids.part > s.ids.part);
});

test('a rival fits its best part of each type to ship one and the next to ship two', () => {
  const s = founded();
  const c = s.crews[1];
  const extra = part({ id: 70000, type: 'rudder', perf: 5000, perfMax: 5000 });
  const b = bestFitted({ ...c, parts: [...c.parts, extra] });
  assert.equal(b.parts.find((p) => p.id === 70000)!.ship, 0);
  assert.ok(fullyFitted(b));
});
