// Money, reputation, marketability, sponsors and inspection.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bonusesPaid,
  perRace,
  prizeAt,
  prizeShares,
  prizes,
  projection,
  raceMoney,
  wages,
} from '../src/career/money.ts';
import {
  anchor,
  teamMarketability,
  teamMove,
  managerMove,
  marketMove,
  marketabilityAfterRace,
  reputationAfterRace,
  reputationAtEnd,
  seasonMove,
  shipMove,
} from '../src/career/reputation.ts';
import {
  objectiveMet,
  offersCome,
  sponsorOffers,
  sponsorsAfterRace,
  sponsorWorth,
  signCheck,
} from '../src/career/sponsors.ts';
import {
  fineFor,
  inspected,
  inspectedCount,
} from '../src/career/inspection.ts';
import { fishIncome, sponsorGrade, upkeep } from '../src/career/hq.ts';
import { racesLeft } from '../src/career/contracts.ts';
import { standingOf } from '../src/career/standings.ts';
import { dice } from '../src/career/dice.ts';
import { fullyFitted } from './career-kit.ts';
import {
  staffOf,
  type CareerState,
  type Sponsor,
} from '../src/career/state.ts';
import { TUNING } from '../src/career/tuning.ts';
import { founded, invariants, must, refused, withTeam } from './career-kit.ts';

const ME = () => founded().player!.team;
const fixed = (id: number, perRace: number, races = 3): Sponsor => ({
  id,
  name: 'Sponsor',
  perRace,
  objectives: [],
  bonus: 0,
  races,
  grade: 1,
});

test("wages: every contract on a team's staff, paid each race with upkeep; fish, fixed sponsors and pay drivers in", () => {
  const s = withTeam(founded(), ME(), (c) => ({
    ...c,
    sponsors: [fixed(1, 500), null, fixed(2, 250)],
  }));
  const me = ME();
  const c = s.teams[me];
  assert.equal(
    wages(s, c),
    staffOf(c).reduce((a, id) => a + (s.people[id].contract?.wage ?? 0), 0)
  );
  const r = perRace(s, me);
  assert.equal(r.upkeep, upkeep(c));
  assert.equal(r.fish, fishIncome(c));
  assert.equal(r.sponsors, 750);
  assert.equal(r.net, r.fish + r.sponsors + r.pay - r.wages - r.upkeep);
  const t = raceMoney(s, me);
  assert.equal(t.teams[me].balance, c.balance + r.net);
  const kinds = t.ledger.slice(s.ledger.length).map((l) => l.kind);
  assert.ok(
    kinds.includes('wages') &&
      kinds.includes('upkeep') &&
      kinds.includes('sponsor')
  );
});

test("wages are owed: paid below the chairman's floor (a spend is refused there, a payment owed is not)", () => {
  const me = ME();
  const s = withTeam(founded(), me, (c) => ({ ...c, balance: c.debtFloor }));
  const r = perRace(s, me);
  if (r.net < 0)
    assert.ok(raceMoney(s, me).teams[me].balance < s.teams[me].debtFloor);
  refused(
    s,
    { kind: 'Build', building: 'factory' },
    s.teams[me].buildings.factory.level >= 3 ? 'top' : 'balance'
  );
});

test("bonuses: a driver's podium bonus and her sinking bonus a ship sunk", () => {
  const s = founded();
  const rival = (ME() + 1) % s.teams.length;
  const cap = s.teams[rival].staff.ships[0].driver!;
  const k = s.people[cap].contract!;
  const t = bonusesPaid(s, rival, [{ person: cap, podium: true, sinkings: 2 }]);
  assert.equal(
    t.teams[rival].balance,
    s.teams[rival].balance - k.podium - 2 * k.sinking
  );
});

test('prize money: weight (n + 1 − place)^spread, shares summing to 1; spread 0 even', () => {
  const sh = prizeShares(40, 1);
  assert.ok(Math.abs(sh.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(Math.abs(sh[0] / sh[39] - 40) < 1e-9);
  assert.ok(prizeShares(40, 0).every((x) => Math.abs(x - 1 / 40) < 1e-12));
  assert.ok(
    prizeShares(40, 2)[0] > sh[0],
    'a steeper spread gives the top more'
  );
  const s = founded();
  assert.ok(prizeAt(s, 0, 1) > prizeAt(s, 0, 20));
  assert.ok(
    prizeAt(s, 0, 1) > prizeAt(s, 2, 1),
    "Tier 1's pool is the largest"
  );
  const t = prizes(s);
  for (const c of s.teams.slice(0, 5))
    assert.equal(
      t.teams[c.id].balance,
      c.balance + prizeAt(s, c.tier, standingOf(s, c.id))
    );
});

test("the ledger's projection: balance + races left × the net a race + the prize at the present place", () => {
  const s = founded();
  const me = ME();
  const p = projection(s, me);
  assert.equal(p.races, racesLeft(s));
  assert.equal(
    p.end,
    Math.round(s.teams[me].balance + p.races * p.perRace.net + p.prize)
  );
});

test("reputation: a team's by points against its tier's mean; a manager's by standing against target; capped", () => {
  assert.equal(teamMove(10, 10), 0);
  assert.equal(teamMove(20, 10), 10 * TUNING.reputation.perPoint);
  assert.equal(teamMove(1000, 0), TUNING.reputation.most);
  assert.equal(managerMove(5, 5), 0);
  assert.ok(managerMove(10, 2) > 0 && managerMove(2, 10) < 0);
  assert.equal(managerMove(40, 1), TUNING.reputation.managerMost);
  assert.equal(
    seasonMove(true, true, false),
    TUNING.reputation.title + TUNING.reputation.promoted
  );
  assert.equal(seasonMove(false, false, true), TUNING.reputation.relegated);
  assert.ok(
    shipMove(10, 5, 1) > shipMove(10, 5, 0),
    "the player's own sinkings move them"
  );
  const s = founded();
  const me = ME();
  const tier = s.teams[me].tier;
  const pts = (team: number) => (team === me ? 30 : 5);
  const t = reputationAfterRace(s, tier, pts, {
    points: 20,
    sinkings: 2,
    podium: true,
  });
  assert.ok(
    t.teams[me].reputation > s.teams[me].reputation,
    "the player's ship feeds the team's reputation"
  );
  const g = t.people[s.player!.person];
  assert.equal(
    t.player!.reputation,
    g.reputation,
    "the player's reputation is their manager's"
  );
  const without = reputationAfterRace(s, tier, pts, null);
  assert.ok(
    g.reputation > without.people[s.player!.person].reputation,
    "and the player's own sailing moves theirs directly"
  );
  const other = s.championships[tier].teams.find((x) => x !== me)!;
  assert.ok(t.teams[other].reputation <= s.teams[other].reputation);
  assert.ok(
    reputationAtEnd(s, me, true, false, false).teams[me].reputation >=
      s.teams[me].reputation
  );
  assert.equal(
    reputationAtEnd(
      withTeam(s, me, (c) => ({ ...c, reputation: 99 })),
      me,
      true,
      true,
      false
    ).teams[me].reputation,
    100
  );
});

test("marketability: a podium and sinkings raise it, it drifts to its anchor; a team's is 0.4 reputation + 0.6 its sailors'", () => {
  const s = founded();
  const rival = (ME() + 1) % s.teams.length;
  const cap = s.people[s.teams[rival].staff.ships[0].driver!];
  const quiet = marketMove(cap, null, s.day);
  const loud = marketMove(
    cap,
    { points: 25, sinkings: 2, podium: true },
    s.day
  );
  assert.ok(loud > quiet);
  assert.ok(
    Math.abs(quiet - anchor(cap, s.day)) <=
      Math.abs(cap.marketability - anchor(cap, s.day)) + 0.1
  );
  const t = marketabilityAfterRace(s, rival, [
    { points: 25, sinkings: 2, podium: true },
    null,
  ]);
  assert.equal(t.people[cap.id].marketability, loud);
  const c = s.teams[rival];
  const m = teamMarketability(s, c);
  assert.ok(m >= 0 && m <= 100);
  const me = ME();
  const t2 = marketabilityAfterRace(s, me, [
    { points: 25, sinkings: 3, podium: true },
    null,
  ]);
  assert.notEqual(
    t2.people[s.player!.person].marketability,
    s.people[s.player!.person].marketability,
    "the player's own marketability moves"
  );
});

test("sponsors: offers by tier at most the landing pad's, sized by marketability; mail; the next scheduled", () => {
  const s = founded();
  const me = ME();
  let x = 0.3;
  const rand = () => (x = (x * 7919 + 0.123) % 1);
  const { offers, next } = sponsorOffers(s, s.teams[me], rand, 6);
  assert.equal(offers.length, 6);
  assert.equal(next, s.ids.sponsor + 6);
  for (const o of offers) {
    assert.ok(o.sponsor.grade <= sponsorGrade(s.teams[me]));
    assert.ok(
      o.sponsor.races >= TUNING.sponsors.races[0] &&
        o.sponsor.races <= TUNING.sponsors.races[1]
    );
    assert.ok(
      (o.sponsor.objectives.length === 0) ===
        (o.sponsor.perRace > 0 || o.sponsor.bonus === 0)
    );
  }
  assert.equal(
    s.queue.filter((e) => e.kind === 'sponsorOffer').length,
    s.teams.length,
    "every team's first offers are scheduled"
  );
  const t = offersCome(
    s,
    { kind: 'sponsorOffer', team: me, day: 0, seq: 0 },
    dice(s.seed, s.streams)
  );
  assert.equal(t.teams[me].offers.length, TUNING.sponsors.offers);
  assert.ok(t.mail.some((m) => m.kind === 'sponsorOffer'));
  assert.ok(
    t.queue.some(
      (e) =>
        e.kind === 'sponsorOffer' &&
        e.team === me &&
        e.day === s.day + TUNING.sponsors.every
    )
  );
});

test('SignSponsor: into a slot, replacing one there; refusals', () => {
  const me = ME();
  const s0 = founded();
  const t0 = offersCome(
    s0,
    { kind: 'sponsorOffer', team: me, day: 0, seq: 0 },
    dice(s0.seed, s0.streams)
  );
  const s = withTeam(t0, me, (c) => ({
    ...c,
    buildings: { ...c.buildings, landingPad: { level: 3, next: null } },
  }));
  const [a, b] = s.teams[me].offers;
  refused(s, { kind: 'SignSponsor', offer: a.sponsor.id, slot: 3 }, 'slot');
  refused(s, { kind: 'SignSponsor', offer: 99999, slot: 0 }, 'offer');
  refused(
    { ...s, day: a.expires + 1 },
    { kind: 'SignSponsor', offer: a.sponsor.id, slot: 0 },
    'lapsed'
  );
  const low = withTeam(s, me, (c) => ({
    ...c,
    buildings: { ...c.buildings, landingPad: { level: 1, next: null } },
    offers: c.offers.map((o) => ({
      ...o,
      sponsor: { ...o.sponsor, grade: 3 },
    })),
  }));
  refused(low, { kind: 'SignSponsor', offer: a.sponsor.id, slot: 0 }, 'tier');
  const t = must(s, { kind: 'SignSponsor', offer: a.sponsor.id, slot: 1 });
  assert.equal(t.teams[me].sponsors[1]!.id, a.sponsor.id);
  assert.ok(!t.teams[me].offers.some((o) => o.sponsor.id === a.sponsor.id));
  const u = must(t, { kind: 'SignSponsor', offer: b.sponsor.id, slot: 1 });
  assert.equal(
    u.teams[me].sponsors[1]!.id,
    b.sponsor.id,
    'a sponsor there is replaced'
  );
  assert.equal(signCheck(u, me, b.sponsor.id, 0)?.code, 'offer');
});

test('objectives: top 10, sink two, three afloat, the most sea; a bonus × weight if met; sponsors leave after their races', () => {
  const r = { best: 9, sinkings: 2, afloat: 3, mostSea: false };
  assert.ok(
    objectiveMet('top10', r) &&
      objectiveMet('sinkTwo', r) &&
      objectiveMet('afloat', r) &&
      !objectiveMet('mostSea', r)
  );
  assert.ok(
    !objectiveMet('top10', { ...r, best: 11 }) &&
      !objectiveMet('top10', { ...r, best: null }) &&
      !objectiveMet('afloat', { ...r, afloat: 2 }) &&
      !objectiveMet('sinkTwo', { ...r, sinkings: 1 })
  );
  const obj: Sponsor = {
    id: 5,
    name: 'Ob',
    perRace: 0,
    objectives: ['top10', 'mostSea'],
    bonus: 1000,
    races: 1,
    grade: 1,
  };
  assert.ok(sponsorWorth(obj) > 0 && sponsorWorth(fixed(1, 300)) === 300);
  const me = ME();
  const s = withTeam(founded(), me, (c) => ({
    ...c,
    sponsors: [obj, fixed(6, 100, 2), null],
  }));
  const t = sponsorsAfterRace(s, me, r, [0, null, null]);
  assert.equal(
    t.teams[me].balance,
    s.teams[me].balance + Math.round(1000 * TUNING.sponsors.objectives.top10)
  );
  assert.equal(t.teams[me].sponsors[0], null, 'its races are done');
  assert.equal(t.teams[me].sponsors[1]!.races, 1);
  assert.ok(
    t.mail.some((m) => m.kind === 'objectiveMet') &&
      t.mail.some((m) => m.kind === 'sponsorLeft')
  );
  const missed = sponsorsAfterRace(s, me, r, [1, null, null]);
  assert.equal(missed.teams[me].balance, s.teams[me].balance);
  assert.ok(missed.mail.some((m) => m.kind === 'objectiveMissed'));
});

test('inspection: a share of the tier, each risky fitted part found by its risk; confiscated, fined, points struck', () => {
  assert.equal(inspectedCount(40, 1 / 3), 13);
  assert.equal(inspectedCount(40, 0), 0);
  let s = founded();
  const me = ME();
  const tier = s.teams[me].tier;
  const championships = [...s.championships];
  championships[tier] = {
    ...championships[tier],
    rules: { ...championships[tier].rules, inspection: 1 },
    standings: championships[tier].standings.map((x) => ({ ...x, points: 20 })),
  };
  s = { ...s, championships };
  const grey = s.teams[me].parts.find(
    (p) => p.ship === 0 && p.type === 'keel'
  )!;
  s = withTeam(s, me, (c) => ({
    ...c,
    improvementDay: s.day,
    parts: c.parts.map((p) =>
      p.id === grey.id ? { ...p, risk: 1, cost: 1000 } : p
    ),
  }));
  const { state, found } = inspected(s, tier, () => 7, dice(s.seed, s.streams));
  const f = found.find((x) => x.team === me)!;
  assert.deepEqual(f.parts, [grey.id]);
  assert.equal(f.fine, fineFor({ ...grey, risk: 1, cost: 1000 }));
  assert.equal(f.fine, 400);
  assert.equal(state.teams[me].balance, s.teams[me].balance - 400);
  assert.equal(
    state.championships[tier].standings.find((x) => x.team === me)!.points,
    13
  );
  assert.ok(!state.teams[me].parts.some((p) => p.id === grey.id));
  assert.ok(fullyFitted(state.teams[me]), 'a stand-in is fitted');
  assert.ok(
    state.mail.some((m) => m.kind === 'inspectionFound') &&
      state.mail.some((m) => m.kind === 'inspectionTier')
  );
  invariants(state);
});

test('sponsors, buildings and designs run for the whole world on Advance (rivals through the same functions)', () => {
  let s: CareerState = founded();
  while (s.race === null) s = must(s, { kind: 'Advance' });
  assert.ok(
    s.teams.filter((c) => !c.player && c.sponsors.some((p) => p !== null))
      .length > 20
  );
  assert.ok(s.teams.filter((c) => !c.player && c.design !== null).length > 20);
  assert.ok(
    s.teams.filter((c) => !c.player && c.suppliers.timber !== null).length > 20
  );
  invariants(s);
});
