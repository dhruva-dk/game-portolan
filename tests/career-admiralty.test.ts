// The Admiralty (Phase B section 11) and the rivals' rows of sections 8–11 (section 6's table).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Change, Measure } from '../src/office.ts';
import { KINDS } from '../src/kinds.ts';
import { changed, changeOf, counted, proposalOf, proposalPut, rivalSide, rulesTurned, sways, swayOf } from '../src/career/admiralty.ts';
import { lean, rankShare } from '../src/career/measure.ts';
import { decide, mindOf, ROWS } from '../src/career/rivals.ts';
import { dice } from '../src/career/dice.ts';
import { startingRules } from '../src/career/world.ts';
import type { CareerState, Part } from '../src/career/state.ts';
import { TUNING } from '../src/career/tuning.ts';
import { founded, invariants, must, refused, withCrew } from './career-kit.ts';

const ME = () => founded().player!.crew;
const A = TUNING.admiralty;

/** The founded career with the player's league's proposal put. */
function put(): { s: CareerState; league: number; id: number } {
  const s0 = founded();
  const league = s0.crews[ME()].league;
  const s = proposalPut({ ...s0, day: s0.calendar!.rounds[A.rounds[0]].day - A.open }, { kind: 'proposal', league, round: A.rounds[0], day: 0, seq: 0 }, dice(s0.seed, s0.streams));
  return { s, league, id: s0.ids.proposal };
}

test('the calendar: each league\'s proposals put 12 days before the rounds they are voted before', () => {
  const s = founded();
  for (let league = 0; league < s.leagues.length; league++) {
    const days = s.queue.filter((e) => e.kind === 'proposal' && e.league === league).map((e) => e.day);
    assert.deepEqual(days, A.rounds.map((r) => s.calendar!.rounds[r].day - A.open));
  }
});

test('a measure\'s change: in its range, never the rule as it stands; carried into next season\'s rules', () => {
  const next = startingRules();
  let x = 0.2;
  const rand = () => (x = (x * 3571 + 0.731) % 1);
  for (const m of ['spec', 'storm', 'ban', 'pointsPerSinking', 'seaHeldPoint', 'prizeSpread', 'inspection'] as Measure[]) {
    for (let i = 0; i < 20; i++) {
      const c = changeOf(m, next, rand)!;
      assert.equal(c.measure, m);
      const r = changed(next, c);
      assert.notDeepEqual(r, next, `${m} changes nothing`);
      assert.ok(r.storm.pace >= A.paceRange[0] && r.storm.pace <= A.paceRange[1]);
      assert.ok(r.prizeSpread >= A.spreadRange[0] && r.prizeSpread <= A.spreadRange[1]);
      assert.ok(r.inspection >= A.inspectionRange[0] && r.inspection <= A.inspectionRange[1] + 1e-9);
      assert.ok(r.pointsPerSinking >= A.points[0] && r.pointsPerSinking <= A.points[1]);
    }
  }
  assert.deepEqual(changed(next, { measure: 'spec', type: 'hull', spec: true }).spec, ['hull']);
  assert.deepEqual(changed({ ...next, spec: ['hull'] }, { measure: 'spec', type: 'hull', spec: false }).spec, []);
  assert.deepEqual(changed(next, { measure: 'ban', kind: KINDS[0] }).banned, [KINDS[0]]);
});

test('a proposal: put by seed, its vote scheduled at its closing; the player\'s league is mailed', () => {
  const { s, league, id } = put();
  const p = proposalOf(s, league, id)!;
  assert.equal(p.decided, null);
  assert.equal(p.closes, s.day + A.open - 1);
  assert.ok(s.queue.some((e) => e.kind === 'vote' && e.league === league && e.proposal === id && e.day === p.closes));
  assert.ok(s.mail.some((m) => m.kind === 'voteDue'));
  assert.equal(s.ids.proposal, id + 1);
});

test('Vote and Lobby: refusals; a vote cast; a sum lobbied paid and its sway added', () => {
  const { s, league, id } = put();
  const me = ME();
  refused(s, { kind: 'Vote', proposal: 9999, side: 'for' }, 'proposal');
  refused(s, { kind: 'Vote', proposal: id, side: 'maybe' as 'for' }, 'side');
  refused({ ...s, day: proposalOf(s, league, id)!.closes + 1 }, { kind: 'Vote', proposal: id, side: 'for' }, 'closed');
  const t = must(s, { kind: 'Vote', proposal: id, side: 'against' });
  assert.equal(proposalOf(t, league, id)!.votes[me], 'against');
  refused(s, { kind: 'Lobby', proposal: id, side: 'abstain' as 'for', coin: 100 }, 'side');
  refused(s, { kind: 'Lobby', proposal: id, side: 'for', coin: 0 }, 'coin');
  refused(withCrew(s, me, (c) => ({ ...c, coin: c.debtFloor })), { kind: 'Lobby', proposal: id, side: 'for', coin: 100 }, 'coin');
  const u = must(s, { kind: 'Lobby', proposal: id, side: 'for', coin: 1000 });
  assert.equal(u.crews[me].coin, s.crews[me].coin - 1000);
  assert.equal(proposalOf(u, league, id)!.lobbied.for, 1000 * A.lobby);
  assert.ok(u.ledger.some((l) => l.kind === 'lobby'));
});

test('sway: a rival\'s reputation × Politics u, the player\'s reputation; each side\'s its backers\' and what was lobbied', () => {
  const { s, league, id } = put();
  const me = ME();
  assert.equal(swayOf(s, me), s.gulls[s.player!.gull].reputation);
  const p = { ...proposalOf(s, league, id)!, votes: { [me]: 'for' as const }, lobbied: { for: 5, against: 7 } };
  const w = sways(s, league, p);
  assert.equal(w.for, 5 + swayOf(s, me));
  assert.equal(w.against, 7);
});

test('the count: rivals vote by their measure, the player abstains if silent, abstainers swayed; carried changes next season only', () => {
  const { s, league, id } = put();
  const me = ME();
  const p = proposalOf(s, league, id)!;
  const t = counted({ ...s, day: p.closes }, { kind: 'vote', league, proposal: id, day: 0, seq: 0 }, dice(s.seed, s.streams));
  const q = proposalOf(t, league, id)!;
  assert.notEqual(q.decided, null);
  assert.equal(Object.keys(q.votes).length, s.leagues[league].crews.length);
  assert.equal(q.votes[me], 'abstain');
  for (const crew of s.leagues[league].crews) if (crew !== me && rivalSide(s, crew, p.change) !== 'abstain') assert.equal(q.votes[crew], rivalSide(s, crew, p.change));
  const yes = Object.values(q.votes).filter((v) => v === 'for').length, no = Object.values(q.votes).filter((v) => v === 'against').length;
  assert.equal(q.decided, yes > no, 'votes cast decide; a tie keeps the rule');
  assert.deepEqual(t.leagues[league].rules, s.leagues[league].rules, 'this season\'s rules stand');
  assert.deepEqual(t.leagues[league].next, q.decided ? changed(s.leagues[league].next, p.change) : s.leagues[league].next);
  assert.ok(t.mail.some((m) => m.kind === 'voteResult'));
  assert.equal(counted(t, { kind: 'vote', league, proposal: id, day: 0, seq: 0 }, dice(s.seed, s.streams)), t, 'counted once');
  const turned = rulesTurned(t);
  assert.deepEqual(turned.leagues[league].rules, t.leagues[league].next);
  assert.equal(turned.leagues[league].proposals.length, 0);
});

test('a rival\'s measure: strong in a type, against making it spec; poor gunners, for a ban; near even, abstain', () => {
  const s = founded();
  const rival = (ME() + 1) % s.crews.length;
  const strong = withCrew(s, rival, (c) => ({ ...c, parts: c.parts.map((p): Part => (p.type === 'sails' ? { ...p, perf: 5000, perfMax: 5000 } : p)) }));
  assert.equal(rankShare(strong, rival, 'sails'), 0);
  const spec: Change = { measure: 'spec', type: 'sails', spec: true };
  assert.equal(lean(strong, rival, spec), -1);
  assert.equal(rivalSide(strong, rival, spec), 'against');
  assert.equal(lean(strong, rival, { ...spec, spec: false }), 1);
  for (const m of ['storm', 'ban', 'pointsPerSinking', 'seaHeldPoint', 'prizeSpread', 'inspection'] as Measure[]) {
    const c = changeOf(m, s.leagues[0].next, () => 0.3)!;
    const v = lean(s, rival, c);
    assert.ok(v >= -1 && v <= 1, `${m}: ${v}`);
  }
});

test('the rivals\' rows: yard, design, build, patrons, suppliers and vote, each through the player\'s functions', () => {
  assert.ok(['yard', 'design', 'build', 'patrons', 'suppliers', 'vote'].every((r) => r in ROWS));
  let s = founded();
  const rival = s.crews.find((c) => !c.player && c.staff.manager !== null && c.staff.shipwright !== null)!.id;
  s = withCrew(s, rival, (c) => ({ ...c, coin: 50000 }));
  const roll = dice(s.seed, s.streams);
  assert.ok(mindOf(s, rival)!.room > 0);
  const yard = decide(s, rival, roll, ['yard']);
  assert.ok(yard.crews[rival].yard.length > 0, 'a split set');
  assert.ok(yard.crews[rival].yard.reduce((a, x) => a + x.perf + x.reliability, 0) <= 1 + 1e-9);
  const design = decide(s, rival, roll, ['design']);
  assert.ok(design.crews[rival].design !== null, 'a design started');
  assert.ok(design.crews[rival].coin < s.crews[rival].coin);
  const sup = decide(s, rival, roll, ['suppliers']);
  assert.ok(sup.crews[rival].suppliers.timber !== null && sup.crews[rival].suppliers.canvas !== null);
  const off = offerAll(s, rival);
  const pat = decide(off, rival, roll, ['patrons']);
  assert.ok(pat.crews[rival].patrons.some((p) => p !== null), 'a patron signed');
  const league = s.crews[rival].league;
  const v = proposalPut(s, { kind: 'proposal', league, round: 3, day: 0, seq: 0 }, roll);
  const voted = decide(v, rival, roll, ['vote']);
  const pid = v.leagues[league].proposals[0].id;
  assert.equal(proposalOf(voted, league, pid)!.votes[rival], rivalSide(v, rival, proposalOf(v, league, pid)!.change));
  for (const t of [yard, design, sup, pat, voted]) invariants(t);
});

/** A crew with offers standing. */
function offerAll(s: CareerState, crew: number): CareerState {
  return withCrew(s, crew, (c) => ({ ...c, offers: [1, 2].map((i) => ({ patron: { id: 9000 + i, name: `P${i}`, perRace: 100 * i, objectives: [], bonus: 0, races: 4, tier: 1 }, expires: s.day + 10 })) }));
}

test('a rival builds in its personality\'s order when its room allows', () => {
  let s = founded();
  const rival = s.crews.find((c) => !c.player && c.staff.manager !== null && Object.values(c.buildings).some((b) => b.level < 3))!.id;
  s = withCrew(s, rival, (c) => ({ ...c, coin: 200000 }));
  const t = decide(s, rival, dice(s.seed, s.streams), ['build']);
  assert.ok(Object.values(t.crews[rival].buildings).some((b) => b.next !== null), 'works begun');
  assert.ok(t.queue.some((e) => e.kind === 'building' && e.crew === rival));
});
