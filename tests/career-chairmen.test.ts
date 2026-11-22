// Phase B sections 6 and 7: rival managers' decisions through the player's own rules, the chairmen' confidence, word
// and verdicts, the managers' market, and the player's job offers.
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Personality } from '../src/office/command.ts';
import type { CareerState } from '../src/career/career.ts';
import { released } from '../src/career/contracts.ts';
import { dice } from '../src/career/dice.ts';
import {
  afterRace,
  bestManager,
  hireManager,
  managerCandidates,
  managersRenewed,
  mayOffer,
  offerJob,
  sacked,
  sacksAtEnd,
  seasonStart,
  served,
  verdicts,
  wordAt,
} from '../src/career/chairmen.ts';
import { standingOf } from '../src/career/standings.ts';
import { learned } from '../src/career/knowledge.ts';
import { confidenceCarried, confidenceMove } from '../src/career/leadership.ts';
import { YEAR } from '../src/career/stars.ts';
import { random } from '../src/world/random.ts';
import { decide, mindOf, rowsFor, ROWS } from '../src/career/rivals.ts';
import { staffOf } from '../src/career/state.ts';
import { TUNING } from '../src/career/tuning.ts';
import { founded, invariants, must, refused } from './career-kit.ts';

const roll = (s: CareerState) => dice(s.seed, s.streams);
const me = (s: CareerState) => s.player!.team;

test('each personality runs every hiring row, in its own order; the review is the same rows for every team', () => {
  const all: Personality[] = [
    'spender',
    'youthBuilder',
    'poacher',
    'engineer',
    'gambler',
    'steady',
  ];
  for (const p of all) {
    const rows = rowsFor(p);
    for (const r of ['fill', 'replace', 'renew', 'poach', 'scout'] as const)
      assert.ok(rows.includes(r), `${p} runs ${r}`);
    const order = TUNING.rivals.personalities[p].order as Readonly<
      Record<string, number>
    >;
    for (let i = 1; i < rows.length; i++)
      assert.ok((order[rows[i - 1]] ?? 0) >= (order[rows[i]] ?? 0));
  }
  assert.deepEqual(Object.keys(ROWS).sort(), [
    'build',
    'design',
    'fill',
    'improvement',
    'poach',
    'renew',
    'replace',
    'scout',
    'sponsors',
    'suppliers',
    'vote',
  ]);
  assert.notDeepEqual(rowsFor('poacher'), rowsFor('steady'));
});

test("a rival with an open post fills it through the player's own checks: a talk with a person its team knows", () => {
  const s = founded();
  const c = s.teams.find((x) => !x.player && mindOf(s, x.id) !== null)!;
  assert.equal(mindOf(s, me(s)), null, "the player's team has no rival mind");
  const leaving = c.staff.pit[0];
  // at founding a team knows only its own: its scouts' reports bring it these
  const free = s.people
    .filter(
      (g) => g.role === 'pit' && g.contract === null && g.retired === null
    )
    .slice(0, 6);
  assert.equal(
    decide(released(s, leaving), c.id, roll(s), ['fill']).talks.length,
    released(s, leaving).talks.length,
    'knowing no one, it bids for no one'
  );
  const t = free.reduce(
    (acc, g) => learned(acc, c.id, g.id, null),
    released(s, leaving)
  );
  const u = decide(t, c.id, roll(t), ['fill']);
  const talks = u.talks.filter((x) => x.team === c.id);
  const signedNow =
    staffOf(u.teams[c.id]).length > staffOf(t.teams[c.id]).length;
  assert.ok(talks.length > 0 || signedNow, 'the rival bids for its open post');
  for (const x of talks) {
    assert.equal(x.offer.role, 'pit');
    assert.ok(
      u.people[x.person].known[c.id] !== undefined,
      'it bids only for people it knows'
    );
  }
  invariants(u);
});

test('a rival scouts with its free scouts, only through scoutCheck (in Reach, unknown, one job a scout)', () => {
  const s = founded();
  const c = s.teams.find(
    (x) => !x.player && x.staff.scouts.length > 0 && mindOf(s, x.id) !== null
  )!;
  const u = decide(s, c.id, roll(s), ['scout']);
  const jobs = u.scouting.filter((x) => x.team === c.id);
  assert.ok(jobs.length > 0 && jobs.length <= c.staff.scouts.length);
  invariants(u);
});

test("the chairman's word comes as confidence crosses 75, 50 or 25, either way", () => {
  assert.equal(wordAt(80, 70), 75);
  assert.equal(wordAt(70, 80), 75);
  assert.equal(wordAt(60, 55), null);
  assert.equal(wordAt(30, 20), 25);
});

/** A founded world half a season or more on: every manager there at founding has served their grace. */
const pastGrace = (): CareerState => ({
  ...founded(),
  day: Math.ceil(TUNING.chairman.grace * YEAR),
});

/** A state with one team's fields changed. */
const withTeamSet = (
  s: CareerState,
  team: number,
  set: Partial<CareerState['teams'][number]>
): CareerState => {
  const teams = [...s.teams];
  teams[team] = { ...teams[team], ...set };
  return { ...s, teams };
};

/** The rival team last in its tier (all level at founding: the highest id of its tier). */
const lastRival = (s: CareerState) =>
  s.teams
    .filter((x) => !x.player && x.staff.manager !== null)
    .sort((a, b) => standingOf(s, b.id) - standingOf(s, a.id))[0];

test("a rival manager whose chairman's confidence falls to nothing is sacked, and the chairman hires the best manager who fits", () => {
  const s = pastGrace();
  // the team last in its tier, its target first
  const c = lastRival(s);
  const was = c.staff.manager!;
  const t = afterRace(
    withTeamSet(s, c.id, { target: 1, confidence: 0.01 }),
    c.id,
    roll(s)
  );
  assert.equal(
    t.teams[c.id].confidence,
    TUNING.team.confidence,
    'the new manager starts at the usual confidence'
  );
  assert.notEqual(t.teams[c.id].staff.manager, was);
  assert.notEqual(t.teams[c.id].staff.manager, null);
  assert.equal(
    t.people[was].contract,
    null,
    'the sacked manager is a free agent'
  );
  invariants(t);
});

test("sacked by the chairman directly: a rival's post filled at once; the best candidate is never the player", () => {
  const s = founded();
  const c = s.teams.find((x) => !x.player && x.staff.manager !== null)!;
  const was = c.staff.manager!;
  const t = sacked(s, c.id, roll(s));
  assert.equal(t.people[was].contract, null);
  assert.ok(
    t.teams[c.id].staff.manager !== null ||
      t.player!.offers.some((o) => o.team === c.id),
    'the post is filled or offered'
  );
  for (const g of managerCandidates(s, c.id)) assert.ok(!g.player);
  assert.ok(!bestManager(s, c.id)?.player);
  invariants(t);
});

test('the player sacked: out of a team, Advance refused, offers shown (one from Tier 3), the last cannot be declined', () => {
  const s = founded();
  const team = me(s);
  const t = sacked(s, team, roll(s));
  const p = t.player!;
  assert.ok(p.sacked);
  assert.equal(t.teams[team].player, false);
  assert.ok(t.teams[team].staff.manager !== p.person);
  assert.ok(
    p.offers.some((o) => t.teams[o.team].tier === t.championships.length - 1)
  );
  assert.ok(t.mail.some((m) => m.kind === 'sacked'));
  invariants(t);
  refused(t, { kind: 'Advance' }, 'sacked');
  let u = t;
  while (u.player!.offers.length > 1)
    u = must(u, { kind: 'DeclineJob', team: u.player!.offers[0].team });
  const last = u.player!.offers[0].team;
  refused(u, { kind: 'DeclineJob', team: last }, 'mustTake');
  const v = must(u, { kind: 'TakeJob', team: last });
  assert.equal(v.player!.sacked, false);
  assert.equal(v.player!.team, last);
  assert.equal(v.teams[last].staff.manager, v.player!.person);
  assert.equal(
    v.teams[last].staff.ships[0].driver,
    null,
    'the player sails ship one'
  );
  invariants(v);
});

test('posts offered to a player with a team: only from their tier or better, two at most standing; any while sacked', () => {
  // the player's team read as Tier 2's, so there is a tier either side
  const s0 = founded(),
    mine = 1;
  const s = {
    ...s0,
    player: { ...s0.player!, reputation: 100 },
    teams: s0.teams.map((c) => (c.player ? { ...c, tier: mine } : c)),
  };
  const above = s.teams.find((c) => c.tier < mine)!,
    same = s.teams.find((c) => c.tier === mine && !c.player)!;
  const below = s.teams.find((c) => c.tier > mine && !c.player)!;
  assert.ok(mayOffer(s, above.id) && mayOffer(s, same.id));
  assert.equal(mayOffer(s, below.id), false, 'a post below them is no offer');
  assert.equal(mayOffer(s, me(s)), false, 'never their own');
  const two = offerJob(offerJob(s, above.id), same.id);
  assert.equal(
    mayOffer(
      two,
      s.teams.find(
        (c) =>
          c.tier <= mine && !c.player && c.id !== above.id && c.id !== same.id
      )!.id
    ),
    false,
    'two stand already'
  );
  assert.equal(
    mayOffer(offerJob(s, above.id), above.id),
    false,
    'one offer a team'
  );
  const out = { ...s, player: { ...s.player!, sacked: true } };
  assert.ok(mayOffer(out, below.id), 'out of a team, any tier offers');
  const low = { ...s, player: { ...s.player!, reputation: 0 } };
  assert.equal(
    mayOffer(low, above.id),
    false,
    "under the tier's reputation threshold"
  );
});

test("a team's post offered to a player of enough reputation; TakeJob moves them and the old team's chairman hires", () => {
  const s0 = founded();
  const old = me(s0);
  const s = { ...s0, player: { ...s0.player!, reputation: 100 } };
  const c = s.teams.find(
    (x) => !x.player && x.staff.manager !== null && x.tier === s.teams[old].tier
  )!;
  const t = hireManager(released(s, c.staff.manager!), c.id, roll(s), true);
  assert.ok(
    t.player!.offers.some((o) => o.team === c.id),
    'the post is offered to the player'
  );
  assert.ok(t.queue.some((e) => e.kind === 'jobExpires' && e.team === c.id));
  const u = must(t, { kind: 'TakeJob', team: c.id });
  assert.equal(u.player!.team, c.id);
  assert.ok(u.teams[c.id].player && !u.teams[old].player);
  assert.equal(u.player!.offers.length, 0);
  assert.notEqual(u.teams[old].staff.manager, u.player!.person);
  invariants(u);
  refused(t, { kind: 'TakeJob', team: old }, 'noOffer');
  const v = must(t, { kind: 'DeclineJob', team: c.id });
  assert.ok(
    v.teams[c.id].staff.manager !== null,
    'declined, the chairman hires elsewhere'
  );
  assert.equal(
    v.queue.some((e) => e.kind === 'jobExpires' && e.team === c.id),
    false
  );
});

test("at a season's start chairmen add money and set targets; at its end a target missed by more than 5 places sacks, if confidence is low", () => {
  const s = pastGrace();
  const t = seasonStart(s);
  for (const c of t.teams) assert.ok(c.balance >= s.teams[c.id].balance);
  const tier = t.championships[0];
  const last = [...tier.teams]
    .filter((i) => !t.teams[i].player)
    .sort((a, b) => standingOf(t, b) - standingOf(t, a))[0];
  const u = withTeamSet(t, last, {
    target: 1,
    confidence: TUNING.chairman.verdict - 1,
  });
  assert.ok(standingOf(u, last) - 1 > TUNING.chairman.missedBy);
  const was = u.teams[last].staff.manager;
  const v = verdicts(u, roll(u));
  assert.notEqual(v.teams[last].staff.manager, was);
  invariants(v);
  const trusted = withTeamSet(t, last, {
    target: 1,
    confidence: TUNING.chairman.verdict,
  });
  assert.equal(
    verdicts(trusted, roll(trusted)).teams[last].staff.manager,
    was,
    'an chairman who still trusts them keeps them'
  );
});

test("a new manager has half a season's grace: not sacked at confidence 0 or by the verdict until it has passed", () => {
  const s = pastGrace();
  const c = lastRival(s);
  const was = c.staff.manager!;
  const people = [...s.people];
  people[was] = {
    ...people[was],
    contract: { ...people[was].contract!, signed: s.day - 1 },
  };
  const fresh = withTeamSet({ ...s, people }, c.id, {
    target: 1,
    confidence: 0.01,
  });
  assert.ok(standingOf(fresh, c.id) - 1 > TUNING.chairman.missedBy);
  assert.equal(served(fresh, fresh.teams[c.id]), false);
  assert.equal(
    afterRace(fresh, c.id, roll(fresh)).teams[c.id].staff.manager,
    was,
    'no sacking at 0 in the grace'
  );
  assert.equal(sacksAtEnd(fresh, c.id), false, 'no verdict in the grace');
  assert.equal(verdicts(fresh, roll(fresh)).teams[c.id].staff.manager, was);
  const later = {
    ...fresh,
    day: fresh.day + Math.ceil(TUNING.chairman.grace * YEAR),
  };
  assert.equal(served(later, later.teams[c.id]), true);
  assert.notEqual(
    afterRace(later, c.id, roll(later)).teams[c.id].staff.manager,
    was,
    'past the grace, confidence at 0 sacks'
  );
});

test('a manager meeting their target is never sacked, at any confidence, balance or patience', () => {
  const s = pastGrace();
  const rand = random(7);
  for (const c of s.teams
    .filter((x) => !x.player && x.staff.manager !== null)
    .slice(0, 40)) {
    const standing = standingOf(s, c.id);
    const target = standing + Math.floor(rand() * 4);
    const t = withTeamSet(s, c.id, {
      target,
      confidence: rand() < 0.5 ? 0 : rand() * 5,
      balance: -1e6,
    });
    assert.equal(
      afterRace(t, c.id, roll(t)).teams[c.id].staff.manager,
      c.staff.manager,
      `team ${c.id} at ${standing}, target ${target}`
    );
    assert.equal(sacksAtEnd(t, c.id), false);
    assert.equal(
      verdicts(t, roll(t)).teams[c.id].staff.manager,
      c.staff.manager
    );
  }
});

test('confidence falls only with sustained under-performance: not within the slack, little for one early race, a run costs', () => {
  const E = TUNING.chairman;
  for (const patience of [0, 10, 20]) {
    for (let behind = -10; behind <= E.slack; behind++) {
      for (let sailed = 1; sailed <= 10; sailed++)
        assert.ok(
          confidenceMove(patience, 10, 10 + behind, sailed) >= 0,
          'at, above or within the slack of the target'
        );
    }
    assert.ok(
      confidenceMove(patience, 1, 40, 1) >= (E.fall * 1.3) / E.settle - 1e-9,
      'the first race weighs a fifth'
    );
  }
  // one bad race in a season otherwise on target: confidence ends where it began or higher
  let one = 70;
  for (let r = 1; r <= 10; r++)
    one += confidenceMove(10, 10, r === 1 ? 30 : 10, r);
  assert.ok(one >= 70);
  // a whole season ten places behind costs a run's worth, but a patient chairman keeps a first poor season's manager
  let run = 70;
  for (let r = 1; r <= 10; r++) run += confidenceMove(20, 10, 20, r);
  assert.ok(run < 70 - 15, `a poor season costs (${run})`);
  assert.ok(run >= E.verdict, `but not the post, the first time (${run})`);
  // and the next poor season, from where the first left off, does
  let second = confidenceCarried(run, TUNING.team.confidence);
  for (let r = 1; r <= 10; r++) second += confidenceMove(20, 10, 22, r);
  assert.ok(
    second < E.verdict,
    `a second poor season costs the post (${second})`
  );
});

test('an chairman renews a trusted manager whose contract runs out, keeping their tenure; not one they doubt', () => {
  const s = pastGrace();
  const [a, b] = s.teams.filter((x) => !x.player && x.staff.manager !== null);
  const people = [...s.people];
  for (const c of [a, b])
    people[c.staff.manager!] = {
      ...people[c.staff.manager!],
      contract: {
        ...people[c.staff.manager!].contract!,
        ends: s.season,
        signed: 3,
      },
    };
  let t = withTeamSet({ ...s, people }, a.id, {
    confidence: TUNING.chairman.verdict,
  });
  t = withTeamSet(t, b.id, { confidence: TUNING.chairman.verdict - 1 });
  const u = managersRenewed(t);
  const ga = u.people[a.staff.manager!].contract!,
    gb = u.people[b.staff.manager!].contract!;
  assert.ok(ga.ends! > s.season, 'renewed');
  assert.equal(ga.signed, 3, 'tenure kept');
  assert.equal(gb.ends, s.season, 'left to run out');
});
