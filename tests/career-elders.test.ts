// Phase B sections 6 and 7: rival managers' decisions through the player's own rules, the elders' confidence, word
// and verdicts, the managers' market, and the player's job offers.
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Personality } from '../src/office.ts';
import type { CareerState } from '../src/career/career.ts';
import { released } from '../src/career/contracts.ts';
import { dice } from '../src/career/dice.ts';
import { afterRace, bestManager, hireManager, managerCandidates, mayOffer, offerJob, sacked, seasonStart, standingOf, verdicts, wordAt } from '../src/career/elders.ts';
import { learned } from '../src/career/knowledge.ts';
import { decide, mindOf, rowsFor, ROWS } from '../src/career/rivals.ts';
import { staffOf } from '../src/career/state.ts';
import { TUNING } from '../src/career/tuning.ts';
import { founded, invariants, must, refused } from './career-kit.ts';

const roll = (s: CareerState) => dice(s.seed, s.streams);
const me = (s: CareerState) => s.player!.crew;

test('each personality runs every hiring row, in its own order; the review is the same rows for every crew', () => {
  const all: Personality[] = ['spender', 'youthBuilder', 'poacher', 'engineer', 'gambler', 'steady'];
  for (const p of all) {
    const rows = rowsFor(p);
    for (const r of ['fill', 'replace', 'renew', 'poach', 'scout'] as const) assert.ok(rows.includes(r), `${p} runs ${r}`);
    const order = TUNING.rivals.personalities[p].order as Readonly<Record<string, number>>;
    for (let i = 1; i < rows.length; i++) assert.ok((order[rows[i - 1]] ?? 0) >= (order[rows[i]] ?? 0));
  }
  assert.deepEqual(Object.keys(ROWS).sort(), ['build', 'design', 'fill', 'patrons', 'poach', 'renew', 'replace', 'scout', 'suppliers', 'vote', 'yard']);
  assert.notDeepEqual(rowsFor('poacher'), rowsFor('steady'));
});

test('a rival with an open post fills it through the player\'s own checks: a talk with a gull its crew knows', () => {
  const s = founded();
  const c = s.crews.find((x) => !x.player && mindOf(s, x.id) !== null)!;
  assert.equal(mindOf(s, me(s)), null, 'the player\'s crew has no rival mind');
  const leaving = c.staff.flight[0];
  // at founding a crew knows only its own: its scouts' reports bring it these
  const free = s.gulls.filter((g) => g.role === 'flight' && g.contract === null && g.retired === null).slice(0, 6);
  assert.equal(decide(released(s, leaving), c.id, roll(s), ['fill']).talks.length, released(s, leaving).talks.length, 'knowing no one, it bids for no one');
  const t = free.reduce((acc, g) => learned(acc, c.id, g.id, null), released(s, leaving));
  const u = decide(t, c.id, roll(t), ['fill']);
  const talks = u.talks.filter((x) => x.crew === c.id);
  const signedNow = staffOf(u.crews[c.id]).length > staffOf(t.crews[c.id]).length;
  assert.ok(talks.length > 0 || signedNow, 'the rival bids for its open post');
  for (const x of talks) {
    assert.equal(x.offer.role, 'flight');
    assert.ok(u.gulls[x.gull].known[c.id] !== undefined, 'it bids only for gulls it knows');
  }
  invariants(u);
});

test('a rival scouts with its free scouts, only through scoutCheck (in Reach, unknown, one job a scout)', () => {
  const s = founded();
  const c = s.crews.find((x) => !x.player && x.staff.scouts.length > 0 && mindOf(s, x.id) !== null)!;
  const u = decide(s, c.id, roll(s), ['scout']);
  const jobs = u.scouting.filter((x) => x.crew === c.id);
  assert.ok(jobs.length > 0 && jobs.length <= c.staff.scouts.length);
  invariants(u);
});

test('the elder\'s word comes as confidence crosses 75, 50 or 25, either way', () => {
  assert.equal(wordAt(80, 70), 75);
  assert.equal(wordAt(70, 80), 75);
  assert.equal(wordAt(60, 55), null);
  assert.equal(wordAt(30, 20), 25);
});

test('a rival manager whose elder\'s confidence falls to nothing is sacked, and the elder hires the best manager who fits', () => {
  const s = founded();
  // the crew last in its league, its target first
  const c = s.crews.filter((x) => !x.player && x.staff.manager !== null).sort((a, b) => standingOf(s, b.id) - standingOf(s, a.id))[0];
  const was = c.staff.manager!;
  const crews = [...s.crews];
  crews[c.id] = { ...c, target: 1, confidence: 0.01 };
  const t = afterRace({ ...s, crews }, c.id, roll(s));
  assert.equal(t.crews[c.id].confidence, TUNING.crew.confidence, 'the new manager starts at the usual confidence');
  assert.notEqual(t.crews[c.id].staff.manager, was);
  assert.notEqual(t.crews[c.id].staff.manager, null);
  assert.equal(t.gulls[was].contract, null, 'the sacked manager is a free agent');
  invariants(t);
});

test('sacked by the elder directly: a rival\'s post filled at once; the best candidate is never the player', () => {
  const s = founded();
  const c = s.crews.find((x) => !x.player && x.staff.manager !== null)!;
  const was = c.staff.manager!;
  const t = sacked(s, c.id, roll(s));
  assert.equal(t.gulls[was].contract, null);
  assert.ok(t.crews[c.id].staff.manager !== null || t.player!.offers.some((o) => o.crew === c.id), 'the post is filled or offered');
  for (const g of managerCandidates(s, c.id)) assert.ok(!g.player);
  assert.ok(!bestManager(s, c.id)?.player);
  invariants(t);
});

test('the player sacked: out of a crew, Advance refused, offers shown (one from League Three), the last cannot be declined', () => {
  const s = founded();
  const crew = me(s);
  const t = sacked(s, crew, roll(s));
  const p = t.player!;
  assert.ok(p.sacked);
  assert.equal(t.crews[crew].player, false);
  assert.ok(t.crews[crew].staff.manager !== p.gull);
  assert.ok(p.offers.some((o) => t.crews[o.crew].league === t.leagues.length - 1));
  assert.ok(t.mail.some((m) => m.kind === 'sacked'));
  invariants(t);
  refused(t, { kind: 'Advance' }, 'sacked');
  let u = t;
  while (u.player!.offers.length > 1) u = must(u, { kind: 'DeclineJob', crew: u.player!.offers[0].crew });
  const last = u.player!.offers[0].crew;
  refused(u, { kind: 'DeclineJob', crew: last }, 'mustTake');
  const v = must(u, { kind: 'TakeJob', crew: last });
  assert.equal(v.player!.sacked, false);
  assert.equal(v.player!.crew, last);
  assert.equal(v.crews[last].staff.manager, v.player!.gull);
  assert.equal(v.crews[last].staff.ships[0].captain, null, 'the player sails ship one');
  invariants(v);
});

test('posts offered to a player with a crew: only from their league or better, two at most standing; any while sacked', () => {
  // the player's crew read as League Two's, so there is a league either side
  const s0 = founded(), mine = 1;
  const s = { ...s0, player: { ...s0.player!, reputation: 100 }, crews: s0.crews.map((c) => (c.player ? { ...c, league: mine } : c)) };
  const above = s.crews.find((c) => c.league < mine)!, same = s.crews.find((c) => c.league === mine && !c.player)!;
  const below = s.crews.find((c) => c.league > mine && !c.player)!;
  assert.ok(mayOffer(s, above.id) && mayOffer(s, same.id));
  assert.equal(mayOffer(s, below.id), false, 'a post below them is no offer');
  assert.equal(mayOffer(s, me(s)), false, 'never their own');
  const two = offerJob(offerJob(s, above.id), same.id);
  assert.equal(mayOffer(two, s.crews.find((c) => c.league <= mine && !c.player && c.id !== above.id && c.id !== same.id)!.id), false, 'two stand already');
  assert.equal(mayOffer(offerJob(s, above.id), above.id), false, 'one offer a crew');
  const out = { ...s, player: { ...s.player!, sacked: true } };
  assert.ok(mayOffer(out, below.id), 'out of a crew, any league offers');
  const low = { ...s, player: { ...s.player!, reputation: 0 } };
  assert.equal(mayOffer(low, above.id), false, 'under the league\'s reputation threshold');
});

test('a crew\'s post offered to a player of enough reputation; TakeJob moves them and the old crew\'s elder hires', () => {
  const s0 = founded();
  const old = me(s0);
  const s = { ...s0, player: { ...s0.player!, reputation: 100 } };
  const c = s.crews.find((x) => !x.player && x.staff.manager !== null && x.league === s.crews[old].league)!;
  const t = hireManager(released(s, c.staff.manager!), c.id, roll(s), true);
  assert.ok(t.player!.offers.some((o) => o.crew === c.id), 'the post is offered to the player');
  assert.ok(t.queue.some((e) => e.kind === 'jobExpires' && e.crew === c.id));
  const u = must(t, { kind: 'TakeJob', crew: c.id });
  assert.equal(u.player!.crew, c.id);
  assert.ok(u.crews[c.id].player && !u.crews[old].player);
  assert.equal(u.player!.offers.length, 0);
  assert.notEqual(u.crews[old].staff.manager, u.player!.gull);
  invariants(u);
  refused(t, { kind: 'TakeJob', crew: old }, 'noOffer');
  const v = must(t, { kind: 'DeclineJob', crew: c.id });
  assert.ok(v.crews[c.id].staff.manager !== null, 'declined, the elder hires elsewhere');
  assert.equal(v.queue.some((e) => e.kind === 'jobExpires' && e.crew === c.id), false);
});

test('at a season\'s start elders add Coin and set targets; at its end a target missed by more than 5 places sacks', () => {
  const s = founded();
  const t = seasonStart(s);
  for (const c of t.crews) assert.ok(c.coin >= s.crews[c.id].coin);
  const league = t.leagues[0];
  const last = [...league.crews].filter((i) => !t.crews[i].player).sort((a, b) => standingOf(t, b) - standingOf(t, a))[0];
  const crews = [...t.crews];
  crews[last] = { ...crews[last], target: 1 };
  const u = { ...t, crews };
  assert.ok(standingOf(u, last) - 1 > TUNING.elder.missedBy);
  const was = u.crews[last].staff.manager;
  const v = verdicts(u, roll(u));
  assert.notEqual(v.crews[last].staff.manager, was);
  invariants(v);
});
