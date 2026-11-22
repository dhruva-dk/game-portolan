// Money, reputation, marketability, patrons and inspection (Phase B sections 8.5, 10).
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
  crewMarketability,
  crewMove,
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
  patronOffers,
  patronsAfterRace,
  patronWorth,
  signCheck,
} from '../src/career/patrons.ts';
import {
  fineFor,
  inspected,
  inspectedCount,
} from '../src/career/inspection.ts';
import { fishCoin, patronTier, upkeep } from '../src/career/rookery.ts';
import { racesLeft } from '../src/career/contracts.ts';
import { standingOf } from '../src/career/elders.ts';
import { dice } from '../src/career/dice.ts';
import { fullyFitted } from '../src/career/parts.ts';
import { staffOf, type CareerState, type Patron } from '../src/career/state.ts';
import { TUNING } from '../src/career/tuning.ts';
import { founded, invariants, must, refused, withCrew } from './career-kit.ts';

const ME = () => founded().player!.crew;
const fixed = (id: number, perRace: number, races = 3): Patron => ({
  id,
  name: 'Patron',
  perRace,
  objectives: [],
  bonus: 0,
  races,
  tier: 1,
});

test("wages: every contract on a crew's staff, paid each race with upkeep; fish, fixed patrons and pay captains in", () => {
  const s = withCrew(founded(), ME(), (c) => ({
    ...c,
    patrons: [fixed(1, 500), null, fixed(2, 250)],
  }));
  const me = ME();
  const c = s.crews[me];
  assert.equal(
    wages(s, c),
    staffOf(c).reduce((a, id) => a + (s.gulls[id].contract?.wage ?? 0), 0)
  );
  const r = perRace(s, me);
  assert.equal(r.upkeep, upkeep(c));
  assert.equal(r.fish, fishCoin(c));
  assert.equal(r.patrons, 750);
  assert.equal(r.net, r.fish + r.patrons + r.pay - r.wages - r.upkeep);
  const t = raceMoney(s, me);
  assert.equal(t.crews[me].coin, c.coin + r.net);
  const kinds = t.ledger.slice(s.ledger.length).map((l) => l.kind);
  assert.ok(
    kinds.includes('wages') &&
      kinds.includes('upkeep') &&
      kinds.includes('patron')
  );
});

test("wages are owed: paid below the elder's floor (a spend is refused there, a payment owed is not)", () => {
  const me = ME();
  const s = withCrew(founded(), me, (c) => ({ ...c, coin: c.debtFloor }));
  const r = perRace(s, me);
  if (r.net < 0)
    assert.ok(raceMoney(s, me).crews[me].coin < s.crews[me].debtFloor);
  refused(
    s,
    { kind: 'Build', building: 'factory' },
    s.crews[me].buildings.factory.level >= 3 ? 'top' : 'coin'
  );
});

test("bonuses: a captain's podium bonus and her sinking bonus a ship sunk", () => {
  const s = founded();
  const rival = (ME() + 1) % s.crews.length;
  const cap = s.crews[rival].staff.ships[0].captain!;
  const k = s.gulls[cap].contract!;
  const t = bonusesPaid(s, rival, [{ gull: cap, podium: true, sinkings: 2 }]);
  assert.equal(
    t.crews[rival].coin,
    s.crews[rival].coin - k.podium - 2 * k.sinking
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
  assert.ok(prizeAt(s, 0, 1) > prizeAt(s, 0, 40));
  assert.ok(
    prizeAt(s, 0, 1) > prizeAt(s, 2, 1),
    "League One's pool is the largest"
  );
  const t = prizes(s);
  for (const c of s.crews.slice(0, 5))
    assert.equal(
      t.crews[c.id].coin,
      c.coin + prizeAt(s, c.league, standingOf(s, c.id))
    );
});

test("the ledger's projection: coin + races left × the net a race + the prize at the present place", () => {
  const s = founded();
  const me = ME();
  const p = projection(s, me);
  assert.equal(p.races, racesLeft(s));
  assert.equal(
    p.end,
    Math.round(s.crews[me].coin + p.races * p.perRace.net + p.prize)
  );
});

test("reputation: a crew's by points against its league's mean; a manager's by standing against target; capped", () => {
  assert.equal(crewMove(10, 10), 0);
  assert.equal(crewMove(20, 10), 10 * TUNING.reputation.perPoint);
  assert.equal(crewMove(1000, 0), TUNING.reputation.most);
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
  const league = s.crews[me].league;
  const pts = (crew: number) => (crew === me ? 30 : 5);
  const t = reputationAfterRace(s, league, pts, {
    points: 20,
    sinkings: 2,
    podium: true,
  });
  assert.ok(
    t.crews[me].reputation > s.crews[me].reputation,
    "the player's ship feeds the crew's reputation"
  );
  const g = t.gulls[s.player!.gull];
  assert.equal(
    t.player!.reputation,
    g.reputation,
    "the player's reputation is their manager's"
  );
  const without = reputationAfterRace(s, league, pts, null);
  assert.ok(
    g.reputation > without.gulls[s.player!.gull].reputation,
    "and the player's own sailing moves theirs directly"
  );
  const other = s.leagues[league].crews.find((x) => x !== me)!;
  assert.ok(t.crews[other].reputation <= s.crews[other].reputation);
  assert.ok(
    reputationAtEnd(s, me, true, false, false).crews[me].reputation >=
      s.crews[me].reputation
  );
  assert.equal(
    reputationAtEnd(
      withCrew(s, me, (c) => ({ ...c, reputation: 99 })),
      me,
      true,
      true,
      false
    ).crews[me].reputation,
    100
  );
});

test("marketability: a podium and sinkings raise it, it drifts to its anchor; a crew's is 0.4 reputation + 0.6 its sailors'", () => {
  const s = founded();
  const rival = (ME() + 1) % s.crews.length;
  const cap = s.gulls[s.crews[rival].staff.ships[0].captain!];
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
  assert.equal(t.gulls[cap.id].marketability, loud);
  const c = s.crews[rival];
  const m = crewMarketability(s, c);
  assert.ok(m >= 0 && m <= 100);
  const me = ME();
  const t2 = marketabilityAfterRace(s, me, [
    { points: 25, sinkings: 3, podium: true },
    null,
  ]);
  assert.notEqual(
    t2.gulls[s.player!.gull].marketability,
    s.gulls[s.player!.gull].marketability,
    "the player's own marketability moves"
  );
});

test("patrons: offers by tier at most the landing pad's, sized by marketability; mail; the next scheduled", () => {
  const s = founded();
  const me = ME();
  let x = 0.3;
  const rand = () => (x = (x * 7919 + 0.123) % 1);
  const { offers, next } = patronOffers(s, s.crews[me], rand, 6);
  assert.equal(offers.length, 6);
  assert.equal(next, s.ids.patron + 6);
  for (const o of offers) {
    assert.ok(o.patron.tier <= patronTier(s.crews[me]));
    assert.ok(
      o.patron.races >= TUNING.patrons.races[0] &&
        o.patron.races <= TUNING.patrons.races[1]
    );
    assert.ok(
      (o.patron.objectives.length === 0) ===
        (o.patron.perRace > 0 || o.patron.bonus === 0)
    );
  }
  assert.equal(
    s.queue.filter((e) => e.kind === 'patronOffer').length,
    s.crews.length,
    "every crew's first offers are scheduled"
  );
  const t = offersCome(
    s,
    { kind: 'patronOffer', crew: me, day: 0, seq: 0 },
    dice(s.seed, s.streams)
  );
  assert.equal(t.crews[me].offers.length, TUNING.patrons.offers);
  assert.ok(t.mail.some((m) => m.kind === 'patronOffer'));
  assert.ok(
    t.queue.some(
      (e) =>
        e.kind === 'patronOffer' &&
        e.crew === me &&
        e.day === s.day + TUNING.patrons.every
    )
  );
});

test('SignPatron: into a slot, replacing one there; refusals', () => {
  const me = ME();
  const s0 = founded();
  const t0 = offersCome(
    s0,
    { kind: 'patronOffer', crew: me, day: 0, seq: 0 },
    dice(s0.seed, s0.streams)
  );
  const s = withCrew(t0, me, (c) => ({
    ...c,
    buildings: { ...c.buildings, landingPad: { level: 3, next: null } },
  }));
  const [a, b] = s.crews[me].offers;
  refused(s, { kind: 'SignPatron', offer: a.patron.id, slot: 3 }, 'slot');
  refused(s, { kind: 'SignPatron', offer: 99999, slot: 0 }, 'offer');
  refused(
    { ...s, day: a.expires + 1 },
    { kind: 'SignPatron', offer: a.patron.id, slot: 0 },
    'lapsed'
  );
  const low = withCrew(s, me, (c) => ({
    ...c,
    buildings: { ...c.buildings, landingPad: { level: 1, next: null } },
    offers: c.offers.map((o) => ({ ...o, patron: { ...o.patron, tier: 3 } })),
  }));
  refused(low, { kind: 'SignPatron', offer: a.patron.id, slot: 0 }, 'tier');
  const t = must(s, { kind: 'SignPatron', offer: a.patron.id, slot: 1 });
  assert.equal(t.crews[me].patrons[1]!.id, a.patron.id);
  assert.ok(!t.crews[me].offers.some((o) => o.patron.id === a.patron.id));
  const u = must(t, { kind: 'SignPatron', offer: b.patron.id, slot: 1 });
  assert.equal(
    u.crews[me].patrons[1]!.id,
    b.patron.id,
    'a patron there is replaced'
  );
  assert.equal(signCheck(u, me, b.patron.id, 0)?.code, 'offer');
});

test('objectives: top 10, sink two, both afloat, the most sea; a bonus × weight if met; patrons leave after their races', () => {
  const r = { best: 9, sinkings: 2, afloat: 2, mostSea: false };
  assert.ok(
    objectiveMet('top10', r) &&
      objectiveMet('sinkTwo', r) &&
      objectiveMet('afloat', r) &&
      !objectiveMet('mostSea', r)
  );
  assert.ok(
    !objectiveMet('top10', { ...r, best: 11 }) &&
      !objectiveMet('top10', { ...r, best: null })
  );
  const obj: Patron = {
    id: 5,
    name: 'Ob',
    perRace: 0,
    objectives: ['top10', 'mostSea'],
    bonus: 1000,
    races: 1,
    tier: 1,
  };
  assert.ok(patronWorth(obj) > 0 && patronWorth(fixed(1, 300)) === 300);
  const me = ME();
  const s = withCrew(founded(), me, (c) => ({
    ...c,
    patrons: [obj, fixed(6, 100, 2), null],
  }));
  const t = patronsAfterRace(s, me, r, [0, null, null]);
  assert.equal(
    t.crews[me].coin,
    s.crews[me].coin + Math.round(1000 * TUNING.patrons.objectives.top10)
  );
  assert.equal(t.crews[me].patrons[0], null, 'its races are done');
  assert.equal(t.crews[me].patrons[1]!.races, 1);
  assert.ok(
    t.mail.some((m) => m.kind === 'objectiveMet') &&
      t.mail.some((m) => m.kind === 'patronLeft')
  );
  const missed = patronsAfterRace(s, me, r, [1, null, null]);
  assert.equal(missed.crews[me].coin, s.crews[me].coin);
  assert.ok(missed.mail.some((m) => m.kind === 'objectiveMissed'));
});

test('inspection: a share of the league, each risky fitted part found by its risk; confiscated, fined, points struck', () => {
  assert.equal(inspectedCount(40, 1 / 3), 13);
  assert.equal(inspectedCount(40, 0), 0);
  let s = founded();
  const me = ME();
  const league = s.crews[me].league;
  const leagues = [...s.leagues];
  leagues[league] = {
    ...leagues[league],
    rules: { ...leagues[league].rules, inspection: 1 },
    standings: leagues[league].standings.map((x) => ({ ...x, points: 20 })),
  };
  s = { ...s, leagues };
  const grey = s.crews[me].parts.find(
    (p) => p.ship === 0 && p.type === 'keel'
  )!;
  s = withCrew(s, me, (c) => ({
    ...c,
    yardDay: s.day,
    parts: c.parts.map((p) =>
      p.id === grey.id ? { ...p, risk: 1, cost: 1000 } : p
    ),
  }));
  const { state, found } = inspected(
    s,
    league,
    () => 7,
    dice(s.seed, s.streams)
  );
  const f = found.find((x) => x.crew === me)!;
  assert.deepEqual(f.parts, [grey.id]);
  assert.equal(f.fine, fineFor({ ...grey, risk: 1, cost: 1000 }));
  assert.equal(f.fine, 400);
  assert.equal(state.crews[me].coin, s.crews[me].coin - 400);
  assert.equal(
    state.leagues[league].standings.find((x) => x.crew === me)!.points,
    13
  );
  assert.ok(!state.crews[me].parts.some((p) => p.id === grey.id));
  assert.ok(fullyFitted(state.crews[me]), 'a stand-in is fitted');
  assert.ok(
    state.mail.some((m) => m.kind === 'inspectionFound') &&
      state.mail.some((m) => m.kind === 'inspectionLeague')
  );
  invariants(state);
});

test('patrons, buildings and designs run for the whole world on Advance (rivals through the same functions)', () => {
  let s: CareerState = founded();
  while (s.race === null) s = must(s, { kind: 'Advance' });
  assert.ok(
    s.crews.filter((c) => !c.player && c.patrons.some((p) => p !== null))
      .length > 40
  );
  assert.ok(s.crews.filter((c) => !c.player && c.design !== null).length > 40);
  assert.ok(
    s.crews.filter((c) => !c.player && c.suppliers.timber !== null).length > 40
  );
  invariants(s);
});
