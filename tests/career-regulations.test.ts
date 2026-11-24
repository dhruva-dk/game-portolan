// The Federation and the rivals' rows of sections 8–11 (section 6's table).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Change, Measure } from '../src/office/command.ts';
import { KINDS } from '../src/kinds.ts';
import {
  changed,
  changeOf,
  counted,
  proposalOf,
  proposalPut,
  rivalSide,
  rulesTurned,
  sways,
  swayOf,
} from '../src/career/regulations.ts';
import { lean, rankShare } from '../src/career/measure.ts';
import { decide, mindOf, ROWS } from '../src/career/rivals.ts';
import { dice } from '../src/career/dice.ts';
import { startingRules } from '../src/career/world.ts';
import type { CareerState, Part } from '../src/career/state.ts';
import { TUNING } from '../src/career/tuning.ts';
import { founded, invariants, must, refused, withTeam } from './career-kit.ts';

const ME = () => founded().player!.team;
const A = TUNING.regulations;

/** The founded career with the player's tier's proposal put. */
function put(): { s: CareerState; tier: number; id: number } {
  const s0 = founded();
  const tier = s0.teams[ME()].tier;
  const s = proposalPut(
    { ...s0, day: s0.calendar!.rounds[A.rounds[0]].day - A.open },
    { kind: 'proposal', tier, round: A.rounds[0], day: 0, seq: 0 },
    dice(s0.seed, s0.streams)
  );
  return { s, tier, id: s0.ids.proposal };
}

test("the calendar: each tier's proposals put 12 days before the rounds they are voted before", () => {
  const s = founded();
  for (let tier = 0; tier < s.championships.length; tier++) {
    const days = s.queue
      .filter((e) => e.kind === 'proposal' && e.tier === tier)
      .map((e) => e.day);
    assert.deepEqual(
      days,
      A.rounds.map((r) => s.calendar!.rounds[r].day - A.open)
    );
  }
});

test("a measure's change: in its range, never the rule as it stands; carried into next season's rules", () => {
  const next = startingRules();
  let x = 0.2;
  const rand = () => (x = (x * 3571 + 0.731) % 1);
  for (const m of [
    'spec',
    'storm',
    'ban',
    'pointsPerSinking',
    'seaHeldPoint',
    'prizeSpread',
    'inspection',
  ] as Measure[]) {
    for (let i = 0; i < 20; i++) {
      const c = changeOf(m, next, rand)!;
      assert.equal(c.measure, m);
      const r = changed(next, c);
      assert.notDeepEqual(r, next, `${m} changes nothing`);
      assert.ok(r.storm >= A.paceRange[0] && r.storm <= A.paceRange[1]);
      assert.ok(
        r.prizeSpread >= A.spreadRange[0] && r.prizeSpread <= A.spreadRange[1]
      );
      assert.ok(
        r.inspection >= A.inspectionRange[0] &&
          r.inspection <= A.inspectionRange[1] + 1e-9
      );
      assert.ok(
        r.pointsPerSinking >= A.points[0] && r.pointsPerSinking <= A.points[1]
      );
    }
  }
  assert.deepEqual(
    changed(next, { measure: 'spec', type: 'hull', spec: true }).spec,
    ['hull']
  );
  assert.deepEqual(
    changed(
      { ...next, spec: ['hull'] },
      { measure: 'spec', type: 'hull', spec: false }
    ).spec,
    []
  );
  assert.deepEqual(changed(next, { measure: 'ban', kind: KINDS[0] }).banned, [
    KINDS[0],
  ]);
});

test("a proposal: put by seed, its vote scheduled at its closing; the player's tier is mailed", () => {
  const { s, tier, id } = put();
  const p = proposalOf(s, tier, id)!;
  assert.equal(p.decided, null);
  assert.equal(p.closes, s.day + A.open - 1);
  assert.ok(
    s.queue.some(
      (e) =>
        e.kind === 'vote' &&
        e.tier === tier &&
        e.proposal === id &&
        e.day === p.closes
    )
  );
  assert.ok(s.mail.some((m) => m.kind === 'voteDue'));
  assert.equal(s.ids.proposal, id + 1);
});

test('Vote and Lobby: refusals; a vote cast; a sum lobbied paid and its sway added', () => {
  const { s, tier, id } = put();
  const me = ME();
  refused(s, { kind: 'Vote', proposal: 9999, side: 'for' }, 'proposal');
  refused(s, { kind: 'Vote', proposal: id, side: 'maybe' as 'for' }, 'side');
  refused(
    { ...s, day: proposalOf(s, tier, id)!.closes + 1 },
    { kind: 'Vote', proposal: id, side: 'for' },
    'closed'
  );
  const t = must(s, { kind: 'Vote', proposal: id, side: 'against' });
  assert.equal(proposalOf(t, tier, id)!.votes[me], 'against');
  refused(
    s,
    { kind: 'Lobby', proposal: id, side: 'abstain' as 'for', balance: 100 },
    'side'
  );
  refused(
    s,
    { kind: 'Lobby', proposal: id, side: 'for', balance: 0 },
    'balance'
  );
  refused(
    withTeam(s, me, (c) => ({ ...c, balance: c.debtFloor })),
    { kind: 'Lobby', proposal: id, side: 'for', balance: 100 },
    'balance'
  );
  const u = must(s, {
    kind: 'Lobby',
    proposal: id,
    side: 'for',
    balance: 1000,
  });
  assert.equal(u.teams[me].balance, s.teams[me].balance - 1000);
  assert.equal(proposalOf(u, tier, id)!.lobbied.for, 1000 * A.lobby);
  assert.ok(u.ledger.some((l) => l.kind === 'lobby'));
});

test("sway: a rival's reputation × Politics u, the player's reputation; each side's its backers' and what was lobbied", () => {
  const { s, tier, id } = put();
  const me = ME();
  assert.equal(swayOf(s, me), s.people[s.player!.person].reputation);
  const p = {
    ...proposalOf(s, tier, id)!,
    votes: { [me]: 'for' as const },
    lobbied: { for: 5, against: 7 },
  };
  const w = sways(s, tier, p);
  assert.equal(w.for, 5 + swayOf(s, me));
  assert.equal(w.against, 7);
});

test('the count: rivals vote by their measure, the player abstains if silent, abstainers swayed; carried changes next season only', () => {
  const { s, tier, id } = put();
  const me = ME();
  const p = proposalOf(s, tier, id)!;
  const t = counted(
    { ...s, day: p.closes },
    { kind: 'vote', tier, proposal: id, day: 0, seq: 0 },
    dice(s.seed, s.streams)
  );
  const q = proposalOf(t, tier, id)!;
  assert.notEqual(q.decided, null);
  assert.equal(Object.keys(q.votes).length, s.championships[tier].teams.length);
  assert.equal(q.votes[me], 'abstain');
  for (const team of s.championships[tier].teams)
    if (team !== me && rivalSide(s, team, p.change) !== 'abstain')
      assert.equal(q.votes[team], rivalSide(s, team, p.change));
  const yes = Object.values(q.votes).filter((v) => v === 'for').length,
    no = Object.values(q.votes).filter((v) => v === 'against').length;
  assert.equal(q.decided, yes > no, 'votes cast decide; a tie keeps the rule');
  assert.deepEqual(
    t.championships[tier].rules,
    s.championships[tier].rules,
    "this season's rules stand"
  );
  assert.deepEqual(
    t.championships[tier].next,
    q.decided
      ? changed(s.championships[tier].next, p.change)
      : s.championships[tier].next
  );
  assert.ok(t.mail.some((m) => m.kind === 'voteResult'));
  assert.equal(
    counted(
      t,
      { kind: 'vote', tier, proposal: id, day: 0, seq: 0 },
      dice(s.seed, s.streams)
    ),
    t,
    'counted once'
  );
  const turned = rulesTurned(t);
  assert.deepEqual(
    turned.championships[tier].rules,
    t.championships[tier].next
  );
  assert.equal(turned.championships[tier].proposals.length, 0);
});

test("a rival's measure: strong in a type, against making it spec; poor gunners, for a ban; near even, abstain", () => {
  const s = founded();
  const rival = (ME() + 1) % s.teams.length;
  const strong = withTeam(s, rival, (c) => ({
    ...c,
    parts: c.parts.map(
      (p): Part =>
        p.type === 'sails' ? { ...p, perf: 5000, perfMax: 5000 } : p
    ),
  }));
  assert.equal(rankShare(strong, rival, 'sails'), 0);
  const spec: Change = { measure: 'spec', type: 'sails', spec: true };
  assert.equal(lean(strong, rival, spec), -1);
  assert.equal(rivalSide(strong, rival, spec), 'against');
  assert.equal(lean(strong, rival, { ...spec, spec: false }), 1);
  for (const m of [
    'storm',
    'ban',
    'pointsPerSinking',
    'seaHeldPoint',
    'prizeSpread',
    'inspection',
  ] as Measure[]) {
    const c = changeOf(m, s.championships[0].next, () => 0.3)!;
    const v = lean(s, rival, c);
    assert.ok(v >= -1 && v <= 1, `${m}: ${v}`);
  }
});

test("the rivals' rows: improvement, design, build, sponsors, suppliers and vote, each through the player's functions", () => {
  assert.ok(
    ['improvement', 'design', 'build', 'sponsors', 'suppliers', 'vote'].every(
      (r) => r in ROWS
    )
  );
  let s = founded();
  const rival = s.teams.find(
    (c) => !c.player && c.staff.manager !== null && c.staff.designer !== null
  )!.id;
  s = withTeam(s, rival, (c) => ({ ...c, balance: 50000 }));
  const roll = dice(s.seed, s.streams);
  assert.ok(mindOf(s, rival)!.room > 0);
  const improvement = decide(s, rival, roll, ['improvement']);
  assert.ok(improvement.teams[rival].improvement.length > 0, 'a split set');
  assert.ok(
    improvement.teams[rival].improvement.reduce(
      (a, x) => a + x.perf + x.reliability,
      0
    ) <=
      1 + 1e-9
  );
  const design = decide(s, rival, roll, ['design']);
  assert.ok(design.teams[rival].design !== null, 'a design started');
  assert.ok(design.teams[rival].balance < s.teams[rival].balance);
  const sup = decide(s, rival, roll, ['suppliers']);
  assert.ok(
    sup.teams[rival].suppliers.composites !== null &&
      sup.teams[rival].suppliers.sailmaker !== null
  );
  const off = offerAll(s, rival);
  const pat = decide(off, rival, roll, ['sponsors']);
  assert.ok(
    pat.teams[rival].sponsors.some((p) => p !== null),
    'a sponsor signed'
  );
  const tier = s.teams[rival].tier;
  const v = proposalPut(
    s,
    { kind: 'proposal', tier, round: 3, day: 0, seq: 0 },
    roll
  );
  const voted = decide(v, rival, roll, ['vote']);
  const pid = v.championships[tier].proposals[0].id;
  assert.equal(
    proposalOf(voted, tier, pid)!.votes[rival],
    rivalSide(v, rival, proposalOf(v, tier, pid)!.change)
  );
  for (const t of [improvement, design, sup, pat, voted]) invariants(t);
});

/** A team with offers standing. */
function offerAll(s: CareerState, team: number): CareerState {
  return withTeam(s, team, (c) => ({
    ...c,
    offers: [1, 2].map((i) => ({
      sponsor: {
        id: 9000 + i,
        name: `P${i}`,
        perRace: 100 * i,
        objectives: [],
        bonus: 0,
        races: 4,
        grade: 1,
      },
      expires: s.day + 10,
    })),
  }));
}

test("a rival builds in its personality's order when its room allows", () => {
  let s = founded();
  const rival = s.teams.find(
    (c) =>
      !c.player &&
      c.staff.manager !== null &&
      Object.values(c.buildings).some((b) => b.level < 3)
  )!.id;
  s = withTeam(s, rival, (c) => ({ ...c, balance: 200000 }));
  const t = decide(s, rival, dice(s.seed, s.streams), ['build']);
  assert.ok(
    Object.values(t.teams[rival].buildings).some((b) => b.next !== null),
    'works begun'
  );
  assert.ok(t.queue.some((e) => e.kind === 'building' && e.team === rival));
});
