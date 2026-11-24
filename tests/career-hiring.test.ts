import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, newCareer, type Applied } from '../src/career/apply.ts';
import type { Command, Reason } from '../src/career/commands.ts';
import { ordered } from '../src/career/draw.ts';
import { matchSetup } from '../src/career/fit.ts';
import { costToSign } from '../src/career/hiring/cost.ts';
import { willingness } from '../src/career/hiring/willingness.ts';
import { personOf } from '../src/career/lookup.ts';
import { wageBill } from '../src/career/record/pay.ts';
import { answerTo } from '../src/career/rules/answer.ts';
import { ask } from '../src/career/rules/ask.ts';
import { standardClause } from '../src/career/rules/clause.ts';
import {
  racesLeftOnSigning,
  renewedRacesLeft,
} from '../src/career/rules/contract-length.ts';
import { eligible } from '../src/career/rules/eligible.ts';
import { lowestWage } from '../src/career/rules/lowest-wage.ts';
import { releaseCost } from '../src/career/rules/release-cost.ts';
import { reputations } from '../src/career/rules/reputation.ts';
import { leavesReserve } from '../src/career/rules/reserve.ts';
import {
  clausePenalty,
  moneyScore,
  offerScore,
  securityScore,
} from '../src/career/rules/score.ts';
import { stars } from '../src/career/rules/stars.ts';
import { standInResult } from '../src/career/standin.ts';
import {
  ROLES,
  type CareerState,
  type Person,
  type Role,
  type Team,
  type Terms,
} from '../src/career/state.ts';
import { LEAGUE } from '../src/career/tuning.ts';

const YOURS = 0;
const RIVAL = 30;
const SEASON = LEAGUE.racesPerSeason;
const RICH = 1000000;

const careerOf = (seed: string): CareerState =>
  newCareer({
    seed,
    name: 'Gull Racing',
    livery: { dye: 0, pattern: 0 },
    emblem: 0,
  });

const BASE = careerOf('pennant');

function accepted(applied: Applied): CareerState {
  if (!applied.ok) throw new Error(`refused for ${applied.reason}`);
  return applied.state;
}

const send = (state: CareerState, command: Command): CareerState =>
  accepted(apply(state, command));

const sendRaw = (state: CareerState, command: unknown): Applied =>
  Reflect.apply(apply, undefined, [state, command]);

const sendAny = (state: CareerState, command: unknown): CareerState =>
  accepted(sendRaw(state, command));

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(Reflect.get(value, key));
  }
  return value;
}

function refusedUntouched(
  state: CareerState,
  command: unknown,
  reason: Reason
): void {
  const before = structuredClone(state);
  const applied = sendRaw(deepFreeze(structuredClone(state)), command);
  assert.deepEqual(applied, { ok: false, reason }, JSON.stringify(command));
  assert.deepEqual(state, before);
}

const close = (a: number, b: number): void =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

function changeTeam(
  state: CareerState,
  index: number,
  change: (team: Team) => Team
): CareerState {
  return {
    ...state,
    teams: state.teams.map((team, i) => (i === index ? change(team) : team)),
  };
}

const funded = (state: CareerState, team: number, balance = RICH) =>
  changeTeam(state, team, (t) => ({ ...t, balance }));

function person(state: CareerState, id: number | null | undefined): Person {
  const found = id === null || id === undefined ? null : personOf(state, id);
  if (found === null) throw new Error(`no person ${String(id)}`);
  return found;
}

function holderId(state: CareerState, team: number, role: Role): number {
  const id = state.teams[team].seats[role];
  if (id === null) throw new Error('an empty seat');
  return id;
}

function sail(state: CareerState): CareerState {
  const started = send(state, { type: 'StartRace', team: YOURS });
  const raced = standInResult(matchSetup(started, { hands: 'player' }));
  const after = send(started, {
    type: 'RecordRace',
    team: YOURS,
    result: raced,
  });
  return after.phase === 'lobby'
    ? send(after, { type: 'MarkRead', team: YOURS })
    : after;
}

const scoreOf = (state: CareerState, team: number, id: number) =>
  willingness(state, team, person(state, id));

function termsAt(
  state: CareerState,
  team: number,
  id: number,
  target: number,
  change: Partial<Terms> = {}
): Terms {
  const who = person(state, id);
  const base: Terms = {
    wage: 10,
    seasons: who.preferred,
    fee: 0,
    clause: standardClause(ask(who)),
    ...change,
  };
  const wage = lowestWage(
    (w) => scoreOf(state, team, id)({ ...base, wage: w }),
    target
  );
  assert.ok(wage !== null);
  return { ...base, wage };
}

const minimumTerms = (
  state: CareerState,
  team: number,
  id: number,
  seasons?: 1 | 2 | 3
): Terms =>
  termsAt(state, team, id, 1, seasons === undefined ? {} : { seasons });

const refusing = (seasons: 1 | 2 | 3 = 2): Terms => ({
  wage: 10,
  seasons,
  fee: 0,
  clause: 300000,
});

const AFTER_ONE = funded(sail(BASE), YOURS);

function candidates(state: CareerState, team: number, role: Role): number[] {
  const deal = state.teams[team].deals[role];
  assert.ok(deal, `${role} deal of team ${team}`);
  return deal.candidates;
}

function richestCandidate(state: CareerState, role: Role): number {
  const ids = candidates(state, YOURS, role);
  assert.ok(ids.length > 0);
  return ids.reduce((best, id) =>
    ask(person(state, id)) > ask(person(state, best)) ? id : best
  );
}

test('the score of §1.6.5 at hand-worked points', () => {
  const terms: Terms = { wage: 1000, seasons: 2, fee: 0, clause: 10000 };
  assert.equal(moneyScore(terms, 1000), 1);
  assert.equal(moneyScore({ ...terms, wage: 900, fee: 2000 }, 1000), 1.05);
  assert.equal(moneyScore({ ...terms, wage: 500, seasons: 1 }, 1000), 0.5);
  close(moneyScore({ ...terms, wage: 0, seasons: 3, fee: 3000 }, 50), 3);
  assert.equal(securityScore(1, 3), 0);
  assert.equal(securityScore(2, 3), 0.5);
  assert.equal(securityScore(3, 3), 1);
  assert.equal(securityScore(1, 1), 1);
  assert.equal(securityScore(3, 2), 0.5);
  assert.equal(clausePenalty(0, 1000), 0);
  assert.equal(clausePenalty(10000, 1000), 0);
  assert.equal(clausePenalty(20000, 1000), 0.1);
  close(clausePenalty(15000, 1000), 0.05);
  assert.equal(clausePenalty(5500, 510), 0);
  close(clausePenalty(300000, 10), 59.9);
  const wanting = {
    wants: { money: 0.5, standing: 0.2, security: 0.3 },
    preferred: 2 as const,
  };
  close(offerScore(wanting, 1000, 1.025, terms), 1.005);
  close(
    offerScore(wanting, 1000, 0.5, { ...terms, seasons: 1, clause: 20000 }),
    0.5 + 0.1 + 0.15 - 0.1
  );
  close(offerScore(wanting, 1000, 0, { ...terms, wage: 0 }), 0.3);
});

test('the answer is signs at 1, counters from 0.85, refuses below', () => {
  assert.equal(answerTo(1), 'signs');
  assert.equal(answerTo(2.5), 'signs');
  assert.equal(answerTo(0.9999), 'counters');
  assert.equal(answerTo(0.85), 'counters');
  assert.equal(answerTo(0.8499), 'refuses');
  assert.equal(answerTo(-3), 'refuses');
});

test('the lowest wage step reaching a score', () => {
  assert.equal(
    lowestWage((w) => w / 1000, 1.05),
    1050
  );
  assert.equal(
    lowestWage((w) => w / 2000 + 0.5, 1),
    1000
  );
  assert.equal(
    lowestWage(() => 2, 1),
    10
  );
  assert.equal(
    lowestWage(() => 0, 1),
    null
  );
  assert.equal(
    lowestWage((w) => w / 1e6, 1.05),
    null
  );
  assert.equal(
    lowestWage((w) => w / 30000, 1),
    30000
  );
});

test('contract lengths, renewals, release costs and the reserve at hand-worked points', () => {
  assert.equal(racesLeftOnSigning(2, 4, false), 17);
  assert.equal(racesLeftOnSigning(1, 10, false), 1);
  assert.equal(racesLeftOnSigning(1, 1, false), 10);
  assert.equal(racesLeftOnSigning(3, 1, false), 30);
  assert.equal(racesLeftOnSigning(3, 10, true), 30);
  assert.equal(racesLeftOnSigning(1, 10, true), 10);
  assert.equal(renewedRacesLeft(3, 2), 23);
  assert.equal(renewedRacesLeft(0, 1), 10);
  assert.equal(releaseCost(333, 7), 1166);
  assert.equal(releaseCost(1000, 10), 5000);
  assert.equal(releaseCost(500, 0), 0);
  assert.equal(releaseCost(10, 1), 5);
  assert.equal(leavesReserve(10000, 1000, 3000), true);
  assert.equal(leavesReserve(10000, 1001, 3000), false);
  assert.equal(leavesReserve(100, 100, 0), true);
  assert.equal(leavesReserve(10000, 1000, 2250, 4), true);
});

test('with no fee and a standard clause, 2.5 times the asking wage always signs (§1.6.5 rule 5)', () => {
  for (const seed of ['pennant', 'gullet']) {
    const state = careerOf(seed);
    for (const team of [0, 1, 20, 39])
      for (const who of state.people.slice(0, 120))
        for (const seasons of [1, 2, 3] as const) {
          const asking = ask(who);
          const score = willingness(state, team, who);
          const terms: Terms = {
            wage: Math.ceil((2.5 * asking) / 10) * 10,
            seasons,
            fee: 0,
            clause: standardClause(asking),
          };
          assert.ok(score(terms) >= 1, `${who.id} at ${team}`);
          assert.ok(score({ ...terms, wage: terms.wage + 10 }) > score(terms));
          assert.ok(score({ ...terms, fee: 100 }) > score(terms));
          assert.ok(
            score({ ...terms, clause: terms.clause + 500 }) < score(terms)
          );
        }
  }
});

test('after a race each team gets a full deal for the marked seat only, of eligible free agents in keyed order', () => {
  const state = sail(BASE);
  const reputation = reputations(state);
  for (let team = 0; team < LEAGUE.teams; team++) {
    const t = state.teams[team];
    assert.equal(t.scoutSeat, 'designer');
    assert.equal(t.deals.driver, null);
    assert.equal(t.deals.mechanic, null);
    const pool = state.people.filter(
      (p) =>
        p.role === 'designer' &&
        p.contract === null &&
        eligible(stars(p.stats), reputation[team])
    );
    const expected = ordered(
      pool,
      (p) => p.id,
      state.seed,
      'deal',
      1,
      2,
      team,
      'designer'
    )
      .slice(0, 3)
      .map((p) => p.id);
    assert.deepEqual(t.deals.designer, { candidates: expected, locked: null });
    assert.deepEqual(t.talks, []);
    assert.deepEqual(t.approached, {
      driver: null,
      designer: null,
      mechanic: null,
    });
  }
  const strong = state.teams[1].deals.designer?.candidates ?? [];
  assert.equal(strong.length, 3);
  assert.ok(
    candidates(state, YOURS, 'designer').every(
      (id) => stars(person(state, id).stats) <= 1
    )
  );
  assert.ok(
    Math.max(...strong.map((id) => stars(person(state, id).stats))) >
      Math.max(
        ...candidates(state, YOURS, 'designer').map((id) =>
          stars(person(state, id).stats)
        )
      )
  );
});

test('an approach puts its person first in a full deal and alone in a one-person deal, then is used up', () => {
  let state = funded(BASE, YOURS);
  const theirDriver = holderId(state, RIVAL, 'driver');
  const star = state.people
    .filter((p) => p.contract === null && p.role === 'designer')
    .reduce((a, b) => (stars(a.stats) >= stars(b.stats) ? a : b));
  assert.ok(!eligible(stars(star.stats), 40));
  state = send(state, { type: 'Approach', team: YOURS, person: theirDriver });
  state = send(state, { type: 'Approach', team: YOURS, person: star.id });
  assert.equal(state.teams[YOURS].balance, RICH - 1000);
  const after = sail(state);
  const t = after.teams[YOURS];
  assert.deepEqual(t.deals.driver, { candidates: [theirDriver], locked: null });
  assert.equal(t.deals.mechanic, null);
  const designers = candidates(after, YOURS, 'designer');
  assert.equal(designers[0], star.id);
  assert.equal(designers.length, 3);
  assert.equal(new Set(designers).size, 3);
  assert.deepEqual(t.approached, {
    driver: null,
    designer: null,
    mechanic: null,
  });
  const again = sail(after);
  assert.equal(again.teams[YOURS].deals.driver, null);
  assert.ok(!candidates(again, YOURS, 'designer').includes(star.id));
});

test('at the off-season stop every role gets a full deal and an approached person who retired is left out', () => {
  const old = BASE.people.find(
    (p) => p.contract === null && p.role === 'mechanic'
  );
  assert.ok(old);
  let state: CareerState = {
    ...funded(BASE, YOURS),
    race: SEASON,
    people: BASE.people.map((p) =>
      p.id === old.id ? { ...p, age: p.retireAge - 1 } : p
    ),
  };
  state = send(state, { type: 'Approach', team: YOURS, person: old.id });
  const stopped = sail(state);
  assert.equal(stopped.phase, 'offseason');
  assert.equal(personOf(stopped, old.id), null);
  const reputation = reputations(stopped);
  for (let team = 0; team < LEAGUE.teams; team++)
    for (const role of ROLES) {
      const ids = candidates(stopped, team, role);
      assert.ok(ids.length <= 3);
      const pool = stopped.people.filter(
        (p) =>
          p.role === role &&
          p.contract === null &&
          eligible(stars(p.stats), reputation[team])
      );
      assert.equal(ids.length, Math.min(3, pool.length), `${team} ${role}`);
      assert.deepEqual(
        ids,
        ordered(
          pool,
          (p) => p.id,
          stopped.seed,
          'deal',
          1,
          SEASON + 1,
          team,
          role
        )
          .slice(0, 3)
          .map((p) => p.id)
      );
    }
  assert.ok(!candidates(stopped, YOURS, 'mechanic').includes(old.id));
  assert.equal(stopped.teams[YOURS].approached.mechanic, null);
});

test('SetScoutSeat moves the marker for free and the next deal follows it', () => {
  for (const phase of ['lobby', 'offseason'] as const) {
    const state = { ...BASE, phase };
    const moved = send(deepFreeze(structuredClone(state)), {
      type: 'SetScoutSeat',
      team: YOURS,
      role: 'driver',
    });
    assert.deepEqual(
      moved,
      changeTeam(state, YOURS, (t) => ({ ...t, scoutSeat: 'driver' }))
    );
  }
  const moved = send(BASE, {
    type: 'SetScoutSeat',
    team: RIVAL,
    role: 'mechanic',
  });
  const after = sail(moved);
  assert.equal(after.teams[RIVAL].deals.designer, null);
  assert.ok(candidates(after, RIVAL, 'mechanic').length > 0);
  assert.ok(
    candidates(after, RIVAL, 'mechanic').every(
      (id) => person(after, id).role === 'mechanic'
    )
  );
});

test('SetScoutSeat is refused as the table says', () => {
  const scout = (role: unknown, team: unknown = YOURS) => ({
    type: 'SetScoutSeat',
    team,
    role,
  });
  refusedUntouched(BASE, scout('designer'), 'same');
  refusedUntouched(BASE, scout('owner'), 'invalid');
  refusedUntouched({ ...BASE, phase: 'racing' }, scout('driver'), 'phase');
  refusedUntouched(BASE, scout('driver', LEAGUE.teams), 'team');
  refusedUntouched({ ...BASE, phase: 'racing' }, scout('designer'), 'phase');
});

test('Approach charges 500 and replaces an earlier approach for the role without refund', () => {
  const free = BASE.people.filter(
    (p) => p.contract === null && p.role === 'driver'
  );
  let state = funded(BASE, RIVAL, 5000);
  state = send(state, { type: 'Approach', team: RIVAL, person: free[0].id });
  state = send(state, { type: 'Approach', team: RIVAL, person: free[1].id });
  assert.equal(state.teams[RIVAL].balance, 4000);
  assert.equal(state.teams[RIVAL].approached.driver, free[1].id);
  const theirs = holderId(BASE, 3, 'mechanic');
  state = send(state, { type: 'Approach', team: RIVAL, person: theirs });
  assert.deepEqual(state.teams[RIVAL].approached, {
    driver: free[1].id,
    designer: null,
    mechanic: theirs,
  });
});

test('Approach is refused as the table says, in its order', () => {
  const free = BASE.people.find((p) => p.contract === null);
  assert.ok(free);
  const own = holderId(BASE, RIVAL, 'designer');
  const owner = BASE.teams[4].owner?.id;
  const approach = (who: unknown, team = RIVAL) => ({
    type: 'Approach',
    team,
    person: who,
  });
  const held = sendAny(BASE, approach(free.id));
  refusedUntouched(BASE, approach(owner), 'fixed');
  refusedUntouched(BASE, approach(own), 'fixed');
  refusedUntouched(funded(BASE, RIVAL, 0), approach(own), 'fixed');
  refusedUntouched(held, approach(free.id), 'same');
  refusedUntouched(funded(held, RIVAL, 0), approach(free.id), 'same');
  refusedUntouched(funded(BASE, RIVAL, 499), approach(free.id), 'funds');
  refusedUntouched(BASE, approach(BASE.nextPersonId), 'unknown');
  refusedUntouched(BASE, approach(1.5), 'invalid');
  refusedUntouched({ ...BASE, phase: 'racing' }, approach(free.id), 'phase');
  refusedUntouched(BASE, approach(free.id, -1), 'team');
  assert.ok(sendRaw(funded(BASE, RIVAL, 500), approach(free.id)).ok);
});

test('an offer accepted outright signs at once', () => {
  const id = richestCandidate(AFTER_ONE, 'designer');
  const terms = minimumTerms(AFTER_ONE, YOURS, id);
  const before = deepFreeze(structuredClone(AFTER_ONE));
  const signed = send(before, {
    type: 'Offer',
    team: YOURS,
    person: id,
    terms: { ...terms, fee: 300 },
  });
  assert.deepEqual(before, AFTER_ONE);
  assert.deepEqual(person(signed, id).contract, {
    team: YOURS,
    wage: terms.wage,
    clause: terms.clause,
    racesLeft: racesLeftOnSigning(terms.seasons, 2, false),
  });
  const t = signed.teams[YOURS];
  assert.equal(t.seats.designer, id);
  assert.equal(t.deals.designer, null);
  assert.equal(t.balance, RICH - 300);
  assert.deepEqual(t.talks, [
    { person: id, attempts: 0, answer: 'signed', counter: null },
  ]);
  assert.equal(wageBill(signed, YOURS), terms.wage);
  assert.deepEqual(JSON.parse(JSON.stringify(signed)), signed);
});

test('a counter keeps seasons, fee and clause and asks the lowest wage scoring 1.05; AcceptCounter signs it', () => {
  const id = richestCandidate(AFTER_ONE, 'designer');
  const terms = termsAt(AFTER_ONE, YOURS, id, 0.85, { fee: 200 });
  const score = scoreOf(AFTER_ONE, YOURS, id);
  assert.ok(score(terms) >= 0.85 && score(terms) < 1, `${score(terms)}`);
  const countered = send(AFTER_ONE, {
    type: 'Offer',
    team: YOURS,
    person: id,
    terms,
  });
  const t = countered.teams[YOURS];
  const talk = t.talks.find((k) => k.person === id);
  assert.ok(talk?.counter);
  const { counter } = talk;
  assert.equal(talk.attempts, 1);
  assert.equal(talk.answer, 'countered');
  assert.deepEqual({ ...counter, wage: terms.wage }, terms);
  assert.ok(counter.wage > terms.wage);
  assert.ok(score(counter) >= 1.05);
  assert.ok(score({ ...counter, wage: counter.wage - 10 }) < 1.05);
  assert.equal(t.deals.designer?.locked, id);
  assert.equal(t.balance, RICH);
  assert.equal(person(countered, id).contract, null);
  const signed = send(countered, {
    type: 'AcceptCounter',
    team: YOURS,
    person: id,
  });
  assert.deepEqual(person(signed, id).contract, {
    team: YOURS,
    wage: counter.wage,
    clause: counter.clause,
    racesLeft: racesLeftOnSigning(counter.seasons, 2, false),
  });
  assert.equal(signed.teams[YOURS].balance, RICH - 200);
  assert.deepEqual(signed.teams[YOURS].talks, [
    { person: id, attempts: 1, answer: 'signed', counter: null },
  ]);
});

test('three failed attempts end the talk until the next deal, but an open counter can still be accepted', () => {
  const id = richestCandidate(AFTER_ONE, 'designer');
  const offer = (terms: Terms): Command => ({
    type: 'Offer',
    team: YOURS,
    person: id,
    terms,
  });
  let state = AFTER_ONE;
  state = send(state, offer(refusing()));
  assert.deepEqual(state.teams[YOURS].talks, [
    { person: id, attempts: 1, answer: 'refused', counter: null },
  ]);
  state = send(state, offer(termsAt(state, YOURS, id, 0.85)));
  assert.equal(state.teams[YOURS].talks[0].answer, 'countered');
  state = send(state, offer(refusing(3)));
  assert.deepEqual(state.teams[YOURS].talks, [
    { person: id, attempts: 3, answer: 'refused', counter: null },
  ]);
  refusedUntouched(state, offer(minimumTerms(state, YOURS, id)), 'attempts');
  refusedUntouched(
    state,
    { type: 'AcceptCounter', team: YOURS, person: id },
    'seat'
  );
  let open = send(AFTER_ONE, offer(refusing()));
  open = send(open, offer(refusing()));
  open = send(open, offer(termsAt(open, YOURS, id, 0.85)));
  assert.equal(open.teams[YOURS].talks[0].attempts, 3);
  assert.equal(open.teams[YOURS].talks[0].answer, 'countered');
  refusedUntouched(open, offer(minimumTerms(open, YOURS, id)), 'attempts');
  const signed = send(open, { type: 'AcceptCounter', team: YOURS, person: id });
  assert.equal(person(signed, id).contract?.team, YOURS);
  const next = sail(state);
  assert.deepEqual(next.teams[YOURS].talks, []);
});

test('the first offer locks the deal to that candidate', () => {
  const ids = candidates(AFTER_ONE, YOURS, 'designer');
  assert.ok(ids.length >= 2);
  const [first, second] = ids;
  const locked = send(AFTER_ONE, {
    type: 'Offer',
    team: YOURS,
    person: first,
    terms: refusing(),
  });
  assert.deepEqual(locked.teams[YOURS].deals.designer, {
    candidates: ids,
    locked: first,
  });
  const other = {
    type: 'Offer',
    team: YOURS,
    person: second,
    terms: minimumTerms(locked, YOURS, second),
  };
  refusedUntouched(locked, other, 'locked');
  refusedUntouched(funded(locked, YOURS, 0), other, 'locked');
  const still = send(locked, {
    type: 'Offer',
    team: YOURS,
    person: first,
    terms: refusing(),
  });
  assert.equal(still.teams[YOURS].deals.designer?.locked, first);
  const next = sail(locked);
  assert.equal(next.teams[YOURS].deals.designer?.locked, null);
});

test('Offer and AcceptCounter are refused for funds unless the reserve is left, whatever the answer', () => {
  const id = richestCandidate(AFTER_ONE, 'designer');
  const terms: Terms = { wage: 100, seasons: 2, fee: 1000, clause: 1000 };
  const offer = { type: 'Offer', team: YOURS, person: id, terms };
  assert.ok(sendRaw(funded(AFTER_ONE, YOURS, 1300), offer).ok);
  refusedUntouched(funded(AFTER_ONE, YOURS, 1299), offer, 'funds');
  refusedUntouched(
    funded(AFTER_ONE, YOURS, 1299),
    { ...offer, terms: { ...terms, clause: 300000 } },
    'funds'
  );
  const countered = send(AFTER_ONE, {
    type: 'Offer',
    team: YOURS,
    person: id,
    terms: termsAt(AFTER_ONE, YOURS, id, 0.85, { fee: 100 }),
  });
  const talk = countered.teams[YOURS].talks[0];
  assert.ok(talk.counter);
  const need = 100 + 3 * talk.counter.wage;
  const accept = { type: 'AcceptCounter', team: YOURS, person: id };
  refusedUntouched(funded(countered, YOURS, need - 1), accept, 'funds');
  assert.ok(sendRaw(funded(countered, YOURS, need), accept).ok);
});

test('Offer is refused as the table says, in its order', () => {
  const ids = candidates(AFTER_ONE, YOURS, 'designer');
  const [first, second] = ids;
  const owner = AFTER_ONE.teams[3].owner?.id;
  const stranger = AFTER_ONE.people.find(
    (p) => p.contract === null && p.role === 'driver' && !ids.includes(p.id)
  );
  assert.ok(stranger);
  const offer = (who: unknown, terms: unknown = refusing(), team = YOURS) => ({
    type: 'Offer',
    team,
    person: who,
    terms,
  });
  refusedUntouched(AFTER_ONE, offer(owner), 'fixed');
  refusedUntouched(funded(AFTER_ONE, YOURS, 0), offer(owner), 'fixed');
  refusedUntouched(AFTER_ONE, offer(stranger.id), 'seat');
  refusedUntouched(funded(AFTER_ONE, YOURS, 0), offer(stranger.id), 'seat');
  refusedUntouched(
    AFTER_ONE,
    offer(holderId(AFTER_ONE, RIVAL, 'driver')),
    'seat'
  );
  const locked = sendAny(AFTER_ONE, offer(first));
  refusedUntouched(locked, offer(second), 'locked');
  let spent = locked;
  for (let n = 0; n < 2; n++) spent = sendAny(spent, offer(first));
  refusedUntouched(spent, offer(first), 'attempts');
  refusedUntouched(funded(spent, YOURS, 0), offer(first), 'attempts');
  refusedUntouched(funded(AFTER_ONE, YOURS, 0), offer(first), 'funds');
  refusedUntouched(AFTER_ONE, offer(AFTER_ONE.nextPersonId), 'unknown');
  refusedUntouched(
    AFTER_ONE,
    offer(first, { ...refusing(), seasons: 4 }),
    'invalid'
  );
  refusedUntouched({ ...AFTER_ONE, phase: 'racing' }, offer(first), 'phase');
  refusedUntouched(AFTER_ONE, offer(first, refusing(), 40), 'team');
});

test('AcceptCounter is refused as the table says', () => {
  const id = richestCandidate(AFTER_ONE, 'designer');
  const accept = (who: unknown) => ({
    type: 'AcceptCounter',
    team: YOURS,
    person: who,
  });
  refusedUntouched(AFTER_ONE, accept(id), 'seat');
  const owner = AFTER_ONE.teams[2].owner?.id;
  refusedUntouched(AFTER_ONE, accept(owner), 'seat');
  refusedUntouched(
    AFTER_ONE,
    accept(holderId(AFTER_ONE, RIVAL, 'mechanic')),
    'seat'
  );
  const refused = send(AFTER_ONE, {
    type: 'Offer',
    team: YOURS,
    person: id,
    terms: refusing(),
  });
  refusedUntouched(refused, accept(id), 'seat');
  refusedUntouched(AFTER_ONE, accept(AFTER_ONE.nextPersonId), 'unknown');
  refusedUntouched(AFTER_ONE, accept('x'), 'invalid');
  refusedUntouched({ ...AFTER_ONE, phase: 'racing' }, accept(id), 'phase');
});

function signedDesigner(seasons: 1 | 2 | 3): {
  state: CareerState;
  id: number;
  terms: Terms;
} {
  const id = richestCandidate(AFTER_ONE, 'designer');
  const terms = minimumTerms(AFTER_ONE, YOURS, id, seasons);
  const state = send(AFTER_ONE, {
    type: 'Offer',
    team: YOURS,
    person: id,
    terms,
  });
  assert.equal(person(state, id).contract?.team, YOURS);
  return { state, id, terms };
}

test('renewing is an offer to your own employee with 10 or fewer races left; it changes the terms at once', () => {
  const long = signedDesigner(2);
  assert.equal(person(long.state, long.id).contract?.racesLeft, 19);
  refusedUntouched(
    long.state,
    {
      type: 'Offer',
      team: YOURS,
      person: long.id,
      terms: minimumTerms(long.state, YOURS, long.id),
    },
    'seat'
  );
  const { state, id } = signedDesigner(1);
  assert.equal(person(state, id).contract?.racesLeft, 9);
  const approached = send(state, {
    type: 'Approach',
    team: YOURS,
    person: holderId(state, RIVAL, 'driver'),
  });
  const withDeal = changeTeam(approached, YOURS, (t) => ({
    ...t,
    deals: { ...t.deals, mechanic: { candidates: [], locked: null } },
  }));
  const terms = { ...minimumTerms(withDeal, YOURS, id, 3), fee: 700 };
  assert.equal(costToSign(withDeal, YOURS, person(withDeal, id), terms), 700);
  const renewed = send(withDeal, {
    type: 'Offer',
    team: YOURS,
    person: id,
    terms,
  });
  assert.deepEqual(person(renewed, id).contract, {
    team: YOURS,
    wage: terms.wage,
    clause: terms.clause,
    racesLeft: 39,
  });
  assert.equal(
    renewed.teams[YOURS].balance,
    withDeal.teams[YOURS].balance - 700
  );
  assert.deepEqual(renewed.teams[YOURS].deals, withDeal.teams[YOURS].deals);
  assert.deepEqual(
    renewed.teams[YOURS].approached,
    withDeal.teams[YOURS].approached
  );
  assert.equal(renewed.teams[YOURS].seats.designer, id);
  assert.equal(renewed.teams[YOURS].talks[0].answer, 'signed');
});

test('a renewal can be refused, countered and run out of attempts like any talk', () => {
  const { state, id } = signedDesigner(1);
  const offer = (terms: Terms): Command => ({
    type: 'Offer',
    team: YOURS,
    person: id,
    terms,
  });
  let talk = send(state, offer(refusing()));
  assert.equal(person(talk, id).contract?.racesLeft, 9);
  talk = send(talk, offer(termsAt(talk, YOURS, id, 0.85)));
  assert.equal(talk.teams[YOURS].talks[0].answer, 'countered');
  talk = send(talk, offer(refusing()));
  refusedUntouched(talk, offer(minimumTerms(talk, YOURS, id)), 'attempts');
});

test('in the off-season an expiring employee can be renewed and stays; otherwise they leave at FinishOffseason', () => {
  const { state, id, terms } = signedDesigner(1);
  let season = state;
  for (let n = 2; n <= SEASON; n++) season = sail(season);
  assert.equal(season.phase, 'offseason');
  assert.equal(person(season, id).contract?.racesLeft, 0);
  assert.equal(season.teams[YOURS].seats.designer, id);
  const renewed = send(season, {
    type: 'Offer',
    team: YOURS,
    person: id,
    terms: minimumTerms(season, YOURS, id, 2),
  });
  assert.equal(person(renewed, id).contract?.racesLeft, 20);
  const kept = send(renewed, { type: 'FinishOffseason', team: YOURS });
  assert.equal(kept.teams[YOURS].seats.designer, id);
  const left = send(season, { type: 'FinishOffseason', team: YOURS });
  assert.equal(left.teams[YOURS].seats.designer, null);
  assert.equal(person(left, id).contract, null);
  assert.ok(terms.wage > 0);
});

test('a signing in the off-season runs whole seasons', () => {
  let state = funded(BASE, YOURS);
  for (let n = 1; n <= SEASON; n++) state = sail(state);
  assert.equal(state.phase, 'offseason');
  const id = candidates(state, YOURS, 'mechanic')[0];
  const terms = minimumTerms(state, YOURS, id, 2);
  const signed = send(state, { type: 'Offer', team: YOURS, person: id, terms });
  assert.equal(person(signed, id).contract?.racesLeft, 20);
});

test('signing over a held seat frees its holder and pays their release cost', () => {
  const { state, id } = signedDesigner(3);
  const contract = person(state, id).contract;
  assert.ok(contract);
  const next = sail(state);
  const newcomer = candidates(next, YOURS, 'designer')[0];
  const terms = { ...minimumTerms(next, YOURS, newcomer), fee: 100 };
  const cost = 100 + releaseCost(contract.wage, contract.racesLeft - 1);
  assert.equal(costToSign(next, YOURS, person(next, newcomer), terms), cost);
  const signed = send(next, {
    type: 'Offer',
    team: YOURS,
    person: newcomer,
    terms,
  });
  assert.equal(signed.teams[YOURS].balance, next.teams[YOURS].balance - cost);
  assert.equal(signed.teams[YOURS].seats.designer, newcomer);
  assert.equal(person(signed, id).contract, null);
  assert.equal(wageBill(signed, YOURS), terms.wage);
});

test('buying out a rival’s employee pays their clause to that team, empties their seat and conserves money', () => {
  const theirs = holderId(AFTER_ONE, RIVAL, 'driver');
  const clause = person(AFTER_ONE, theirs).contract?.clause ?? 0;
  assert.ok(clause > 0);
  const approached = send(AFTER_ONE, {
    type: 'Approach',
    team: YOURS,
    person: theirs,
  });
  const dealt = sail(approached);
  assert.deepEqual(dealt.teams[YOURS].deals.driver, {
    candidates: [theirs],
    locked: null,
  });
  const terms = { ...minimumTerms(dealt, YOURS, theirs, 2), fee: 400 };
  const signed = send(dealt, {
    type: 'Offer',
    team: YOURS,
    person: theirs,
    terms,
  });
  const mine = signed.teams[YOURS].balance - dealt.teams[YOURS].balance;
  const rival = signed.teams[RIVAL].balance - dealt.teams[RIVAL].balance;
  assert.equal(mine, -(400 + clause));
  assert.equal(rival, clause);
  assert.equal(mine + rival, -400);
  assert.equal(signed.teams[RIVAL].seats.driver, null);
  assert.equal(signed.teams[YOURS].seats.driver, theirs);
  assert.equal(person(signed, theirs).contract?.team, YOURS);
  for (let team = 1; team < LEAGUE.teams; team++)
    if (team !== RIVAL)
      assert.equal(
        signed.teams[team].balance,
        dealt.teams[team].balance,
        `${team}`
      );
});

test('a rival poaches your employee by the same rules: you are paid the clause and your seat empties', () => {
  const { state, id } = signedDesigner(3);
  const clause = person(state, id).contract?.clause ?? 0;
  const poacher = funded(state, RIVAL);
  const approached = send(poacher, {
    type: 'Approach',
    team: RIVAL,
    person: id,
  });
  const dealt = sail(approached);
  assert.equal(candidates(dealt, RIVAL, 'designer')[0], id);
  const old = holderId(dealt, RIVAL, 'designer');
  const oldContract = person(dealt, old).contract;
  assert.ok(oldContract);
  const terms = minimumTerms(dealt, RIVAL, id, 1);
  const signed = send(dealt, { type: 'Offer', team: RIVAL, person: id, terms });
  assert.equal(
    signed.teams[YOURS].balance,
    dealt.teams[YOURS].balance + clause
  );
  assert.equal(
    signed.teams[RIVAL].balance,
    dealt.teams[RIVAL].balance -
      clause -
      releaseCost(oldContract.wage, oldContract.racesLeft)
  );
  assert.equal(signed.teams[YOURS].seats.designer, null);
  assert.equal(signed.teams[RIVAL].seats.designer, id);
  assert.equal(person(signed, old).contract, null);
  assert.equal(person(signed, id).contract?.racesLeft, 8);
});

test('a free agent signed elsewhere stays in your deal and signing them then is a buyout', () => {
  const id = richestCandidate(AFTER_ONE, 'designer');
  const rich = funded(AFTER_ONE, RIVAL);
  const elsewhere: CareerState = {
    ...rich,
    teams: rich.teams.map((t, i) =>
      i === RIVAL
        ? {
            ...t,
            deals: { ...t.deals, designer: { candidates: [id], locked: null } },
          }
        : t
    ),
  };
  const taken = send(elsewhere, {
    type: 'Offer',
    team: RIVAL,
    person: id,
    terms: minimumTerms(elsewhere, RIVAL, id, 3),
  });
  assert.equal(person(taken, id).contract?.team, RIVAL);
  assert.ok(candidates(taken, YOURS, 'designer').includes(id));
  const clause = person(taken, id).contract?.clause ?? 0;
  const terms = minimumTerms(taken, YOURS, id);
  assert.equal(costToSign(taken, YOURS, person(taken, id), terms), clause);
  const back = send(taken, { type: 'Offer', team: YOURS, person: id, terms });
  assert.equal(back.teams[RIVAL].seats.designer, null);
  assert.equal(back.teams[RIVAL].balance, taken.teams[RIVAL].balance + clause);
});

test('Release costs half the wage times races left, frees the seat and may take the balance below zero', () => {
  const { state, id, terms } = signedDesigner(2);
  const broke = funded(state, YOURS, 0);
  const released = send(deepFreeze(structuredClone(broke)), {
    type: 'Release',
    team: YOURS,
    person: id,
  });
  const cost = releaseCost(terms.wage, 19);
  assert.equal(cost, Math.ceil(0.5 * terms.wage * 19));
  assert.equal(released.teams[YOURS].balance, -cost);
  assert.equal(released.teams[YOURS].seats.designer, null);
  assert.equal(person(released, id).contract, null);
  assert.equal(wageBill(released, YOURS), 0);
});

test('Release is refused as the table says', () => {
  const release = (who: unknown, team = YOURS) => ({
    type: 'Release',
    team,
    person: who,
  });
  const owner = BASE.teams[7].owner?.id;
  refusedUntouched(BASE, release(owner), 'fixed');
  refusedUntouched(BASE, release(holderId(BASE, RIVAL, 'driver')), 'seat');
  const free = BASE.people.find((p) => p.contract === null);
  refusedUntouched(BASE, release(free?.id), 'seat');
  refusedUntouched(BASE, release(BASE.nextPersonId), 'unknown');
  refusedUntouched(BASE, release(null), 'invalid');
  refusedUntouched({ ...BASE, phase: 'racing' }, release(free?.id), 'phase');
  refusedUntouched(BASE, release(free?.id, 41), 'team');
  const theirs = holderId(BASE, RIVAL, 'driver');
  const freed = sendAny(funded(BASE, RIVAL, 0), release(theirs, RIVAL));
  assert.equal(freed.teams[RIVAL].seats.driver, null);
  assert.ok(freed.teams[RIVAL].balance < 0);
});
