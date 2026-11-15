// Phase B sections 6 and 7: rival managers' decisions through the player's own rules, the elders' confidence, word
// and verdicts, the managers' market, and the player's job offers.
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Personality } from '../src/office.ts';
import type { CareerState } from '../src/career/career.ts';
import { released } from '../src/career/contracts.ts';
import { dice } from '../src/career/dice.ts';
import { afterRace, bestManager, hireManager, managerCandidates, managersRenewed, mayOffer, offerJob, sacked, sacksAtEnd, seasonStart, served, standingOf, verdicts, wordAt } from '../src/career/elders.ts';
import { learned } from '../src/career/knowledge.ts';
import { confidenceCarried, confidenceMove } from '../src/career/leadership.ts';
import { YEAR } from '../src/career/stars.ts';
import { random } from '../src/world/random.ts';
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

/** A founded world half a season or more on: every manager there at founding has served their grace. */
const pastGrace = (): CareerState => ({ ...founded(), day: Math.ceil(TUNING.elder.grace * YEAR) });

/** A state with one crew's fields changed. */
const withCrewSet = (s: CareerState, crew: number, set: Partial<CareerState['crews'][number]>): CareerState => {
  const crews = [...s.crews];
  crews[crew] = { ...crews[crew], ...set };
  return { ...s, crews };
};

/** The rival crew last in its league (all level at founding: the highest id of its league). */
const lastRival = (s: CareerState) => s.crews.filter((x) => !x.player && x.staff.manager !== null).sort((a, b) => standingOf(s, b.id) - standingOf(s, a.id))[0];

test('a rival manager whose elder\'s confidence falls to nothing is sacked, and the elder hires the best manager who fits', () => {
  const s = pastGrace();
  // the crew last in its league, its target first
  const c = lastRival(s);
  const was = c.staff.manager!;
  const t = afterRace(withCrewSet(s, c.id, { target: 1, confidence: 0.01 }), c.id, roll(s));
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

test('at a season\'s start elders add Coin and set targets; at its end a target missed by more than 5 places sacks, if confidence is low', () => {
  const s = pastGrace();
  const t = seasonStart(s);
  for (const c of t.crews) assert.ok(c.coin >= s.crews[c.id].coin);
  const league = t.leagues[0];
  const last = [...league.crews].filter((i) => !t.crews[i].player).sort((a, b) => standingOf(t, b) - standingOf(t, a))[0];
  const u = withCrewSet(t, last, { target: 1, confidence: TUNING.elder.verdict - 1 });
  assert.ok(standingOf(u, last) - 1 > TUNING.elder.missedBy);
  const was = u.crews[last].staff.manager;
  const v = verdicts(u, roll(u));
  assert.notEqual(v.crews[last].staff.manager, was);
  invariants(v);
  const trusted = withCrewSet(t, last, { target: 1, confidence: TUNING.elder.verdict });
  assert.equal(verdicts(trusted, roll(trusted)).crews[last].staff.manager, was, 'an elder who still trusts them keeps them');
});

test('a new manager has half a season\'s grace: not sacked at confidence 0 or by the verdict until it has passed', () => {
  const s = pastGrace();
  const c = lastRival(s);
  const was = c.staff.manager!;
  const gulls = [...s.gulls];
  gulls[was] = { ...gulls[was], contract: { ...gulls[was].contract!, signed: s.day - 1 } };
  const fresh = withCrewSet({ ...s, gulls }, c.id, { target: 1, confidence: 0.01 });
  assert.ok(standingOf(fresh, c.id) - 1 > TUNING.elder.missedBy);
  assert.equal(served(fresh, fresh.crews[c.id]), false);
  assert.equal(afterRace(fresh, c.id, roll(fresh)).crews[c.id].staff.manager, was, 'no sacking at 0 in the grace');
  assert.equal(sacksAtEnd(fresh, c.id), false, 'no verdict in the grace');
  assert.equal(verdicts(fresh, roll(fresh)).crews[c.id].staff.manager, was);
  const later = { ...fresh, day: fresh.day + Math.ceil(TUNING.elder.grace * YEAR) };
  assert.equal(served(later, later.crews[c.id]), true);
  assert.notEqual(afterRace(later, c.id, roll(later)).crews[c.id].staff.manager, was, 'past the grace, confidence at 0 sacks');
});

test('a manager meeting their target is never sacked, at any confidence, coin or patience', () => {
  const s = pastGrace();
  const rand = random(7);
  for (const c of s.crews.filter((x) => !x.player && x.staff.manager !== null).slice(0, 40)) {
    const standing = standingOf(s, c.id);
    const target = standing + Math.floor(rand() * 4);
    const t = withCrewSet(s, c.id, { target, confidence: rand() < 0.5 ? 0 : rand() * 5, coin: -1e6 });
    assert.equal(afterRace(t, c.id, roll(t)).crews[c.id].staff.manager, c.staff.manager, `crew ${c.id} at ${standing}, target ${target}`);
    assert.equal(sacksAtEnd(t, c.id), false);
    assert.equal(verdicts(t, roll(t)).crews[c.id].staff.manager, c.staff.manager);
  }
});

test('confidence falls only with sustained under-performance: not within the slack, little for one early race, a run costs', () => {
  const E = TUNING.elder;
  for (const patience of [0, 10, 20]) {
    for (let behind = -10; behind <= E.slack; behind++) {
      for (let sailed = 1; sailed <= 10; sailed++) assert.ok(confidenceMove(patience, 10, 10 + behind, sailed) >= 0, 'at, above or within the slack of the target');
    }
    assert.ok(confidenceMove(patience, 1, 40, 1) >= (E.fall * 1.3) / E.settle - 1e-9, 'the first race weighs a fifth');
  }
  // one bad race in a season otherwise on target: confidence ends where it began or higher
  let one = 70;
  for (let r = 1; r <= 10; r++) one += confidenceMove(10, 10, r === 1 ? 30 : 10, r);
  assert.ok(one >= 70);
  // a whole season ten places behind costs a run's worth, but a patient elder keeps a first poor season's manager
  let run = 70;
  for (let r = 1; r <= 10; r++) run += confidenceMove(20, 10, 20, r);
  assert.ok(run < 70 - 15, `a poor season costs (${run})`);
  assert.ok(run >= E.verdict, `but not the post, the first time (${run})`);
  // and the next poor season, from where the first left off, does
  let second = confidenceCarried(run, TUNING.crew.confidence);
  for (let r = 1; r <= 10; r++) second += confidenceMove(20, 10, 22, r);
  assert.ok(second < E.verdict, `a second poor season costs the post (${second})`);
});

test('an elder renews a trusted manager whose contract runs out, keeping their tenure; not one they doubt', () => {
  const s = pastGrace();
  const [a, b] = s.crews.filter((x) => !x.player && x.staff.manager !== null);
  const gulls = [...s.gulls];
  for (const c of [a, b]) gulls[c.staff.manager!] = { ...gulls[c.staff.manager!], contract: { ...gulls[c.staff.manager!].contract!, ends: s.season, signed: 3 } };
  let t = withCrewSet({ ...s, gulls }, a.id, { confidence: TUNING.elder.verdict });
  t = withCrewSet(t, b.id, { confidence: TUNING.elder.verdict - 1 });
  const u = managersRenewed(t);
  const ga = u.gulls[a.staff.manager!].contract!, gb = u.gulls[b.staff.manager!].contract!;
  assert.ok(ga.ends! > s.season, 'renewed');
  assert.equal(ga.signed, 3, 'tenure kept');
  assert.equal(gb.ends, s.season, 'left to run out');
});
