// Phase B sections 4 and 5: scouting, what a team sees, and the market (asks, answers, counters, patience, the
// tier rule, break clauses, approaches, dismissals, expiry, the young).
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Offer } from '../src/office/command.ts';
import { apply, type CareerState } from '../src/career/career.ts';
import {
  breakCost,
  dismissalCost,
  expired,
  youngPeople,
} from '../src/career/contracts.ts';
import { dice } from '../src/career/dice.ts';
import {
  answerDay,
  hear,
  lapse,
  offerCheck,
  offered,
} from '../src/career/hiring.ts';
import {
  knowledgeTurned,
  knownTo,
  knows,
  learned,
  view,
} from '../src/career/knowledge.ts';
import {
  answer,
  askOf,
  counterTo,
  lowball,
  score,
} from '../src/career/market.ts';
import { withStats } from '../src/career/roles.ts';
import { seatOf, seatRole } from '../src/career/seats.ts';
import { staffOf } from '../src/career/state.ts';
import { TUNING } from '../src/career/tuning.ts';
import { founded, invariants, must, refused, sailed } from './career-kit.ts';

const M = TUNING.market;
const roll = (s: CareerState) => dice(s.seed, s.streams);
const me = (s: CareerState) => s.player!.team;

/** An offer of a person's ask from a team, for the post of `replaces` (or an open one). */
function asked(
  s: CareerState,
  team: number,
  person: number,
  replaces: number | null
): Offer {
  const g = s.people[person];
  const a = askOf(s, g, s.teams[team]);
  const status =
    replaces === null
      ? g.role === 'driver'
        ? 'ship'
        : 'staff'
      : seatRole(seatOf(s.teams[team], replaces)!).status;
  return {
    role: g.role,
    status,
    wage: a.wage,
    fee: a.fee,
    seasons: a.seasons,
    podium: 0,
    sinking: 0,
    breakClause: null,
    replaces,
  };
}

/** An offer of a person's ask a team may make (to an open post, or replacing one of its own of the role), or null. */
function offerFor(s: CareerState, team: number, person: number): Offer | null {
  const c = s.teams[team];
  const own = staffOf(c).filter(
    (id) => s.people[id].role === s.people[person].role && !s.people[id].player
  );
  for (const replaces of [null, ...own]) {
    const offer = asked(s, team, person, replaces);
    if (offerCheck(s, team, person, offer) === null) return offer;
  }
  return null;
}

/** A free agent the player's team may make an offer to who would accept their ask raised to the most money, and that
 *  offer at their ask (and, if `counters`, one for whom some lower wage draws a counter). */
function freeTarget(
  s: CareerState,
  counters = false,
  also: (person: number, offer: Offer) => boolean = () => true
): { person: number; offer: Offer } {
  const c = s.teams[me(s)];
  for (const g of s.people) {
    if (
      g.contract !== null ||
      g.retired !== null ||
      g.player ||
      g.role === 'manager' ||
      g.role === 'chairman' ||
      s.day < g.silentUntil
    )
      continue;
    if (!g.wants.includes('money')) continue; // wage tests need a person who weighs it
    const offer = offerFor(s, c.id, g.id);
    if (
      !offer ||
      answer(s, g, c, { ...offer, wage: Math.ceil(offer.wage * M.most) })
        .kind !== 'accept'
    )
      continue;
    if ((counters && !countering(s, g.id, offer)) || !also(g.id, offer))
      continue;
    return { person: g.id, offer };
  }
  throw new Error('no free agent to offer');
}

/** A wage below the offer's, not a lowball, that draws a counter from the person; or null. */
function countering(
  s: CareerState,
  person: number,
  offer: Offer
): Offer | null {
  const g = s.people[person],
    c = s.teams[me(s)];
  for (let w = Math.ceil(offer.wage * M.most); w > 0; w--) {
    const o = { ...offer, wage: w };
    if (lowball(s, g, c, o)) return null;
    if (answer(s, g, c, o).kind === 'counter') return o;
  }
  return null;
}

/** The answer event of a talk, heard. */
const heard = (s: CareerState, talk: number) => {
  const day = s.talks.find((t) => t.id === talk)!.answer;
  return hear({ ...s, day }, { kind: 'answer', talk, day, seq: 0 });
};

test('a scout is sent to a person in Reach, reports by mail after its days, and the team then knows them exactly', () => {
  const s = founded();
  const c = s.teams[me(s)];
  const scout = c.staff.scouts[0];
  assert.ok(scout !== undefined, "the player's team starts with a scout");
  const target = s.people.find(
    (g) =>
      g.contract === null && g.retired === null && !g.player && !knows(c.id, g)
  )!;
  const before = view(s, c.id, target.id);
  assert.equal(before.known, false);
  assert.ok(before.stars[0] <= before.stars[1]);
  const t = must(s, { kind: 'StartScout', scout, person: target.id });
  const job = t.scouting.find((x) => x.scout === scout)!;
  assert.ok(job.done > t.day);
  assert.ok(
    t.queue.some(
      (e) => e.kind === 'report' && e.scout === scout && e.day === job.done
    )
  );
  refused(t, { kind: 'StartScout', scout, person: target.id }, 'busy');
  refused(
    t,
    { kind: 'StartScout', scout: c.staff.pit[0], person: target.id },
    'notScout'
  );
  refused(s, { kind: 'StartScout', scout, person: c.staff.pit[0] }, 'known');
  invariants(t);
  let u = t;
  while (u.scouting.some((x) => x.scout === scout && x.team === c.id))
    u = must(u.race ? { ...u, race: null, round: u.round + 1 } : u, {
      kind: 'Advance',
    });
  assert.equal(view(u, c.id, target.id).known, true);
  assert.equal(u.people[target.id].known[c.id].by, scout);
  assert.ok(
    u.mail.some((m) => m.kind === 'scoutReport' && m.slots.person === target.id)
  );
  const v = view(u, c.id, target.id);
  assert.equal(v.stars[0], v.stars[1], 'known stars are exact');
});

test('CancelScout frees the scout and takes the report off the queue', () => {
  const s = founded();
  const c = s.teams[me(s)];
  const scout = c.staff.scouts[0];
  const target = s.people.find(
    (g) => g.contract === null && g.retired === null && !g.player
  )!;
  const t = must(s, { kind: 'StartScout', scout, person: target.id });
  const u = must(t, { kind: 'CancelScout', scout });
  assert.equal(
    u.scouting.some((x) => x.scout === scout),
    false
  );
  assert.equal(
    u.queue.some((e) => e.kind === 'report' && e.scout === scout),
    false
  );
  refused(u, { kind: 'CancelScout', scout }, 'idle');
});

test("knowledge turns at a season's end: next season shows the change in stars as an arrow", () => {
  const s = founded();
  const team = me(s);
  const g = s.people.find(
    (x) => x.contract === null && x.retired === null && !x.player
  )!;
  const t = knowledgeTurned(learned(s, team, g.id, null));
  assert.equal(view(t, team, g.id).arrow, 0);
  const people = [...t.people];
  const up = Object.fromEntries(
    Object.entries(g.stats).map(([k, v]) => [k, Math.min(20, v + 4)])
  );
  people[g.id] = withStats(t.people[g.id], up);
  assert.ok((view({ ...t, people }, team, g.id).arrow ?? 0) > 0);
});

test('the people a team knows, kept between states, match a scan of every person in any state read, in any order', () => {
  const scan = (s: CareerState, team: number) =>
    s.people
      .filter((g) => g.known[String(team)] !== undefined)
      .map((g) => g.id);
  let s = founded();
  const states: CareerState[] = [s];
  for (let k = 0; k < 6; k++) {
    s = s.race === null ? must(s, { kind: 'Advance' }) : sailed(s);
    states.push(s);
  }
  s = learned(learned(s, 0, s.people.length - 1, null), 3, 5, null);
  states.push(s, states[1], states[4]);
  for (const t of states)
    for (const team of [0, 3, 17, 60])
      assert.deepEqual(knownTo(t, team), scan(t, team));
});

test("a person's answer: their ask is accepted; less money scores lower; from 0.85 a counter that scores 1; below it a refusal", () => {
  const s = founded();
  const c = s.teams[me(s)];
  const { person, offer } = freeTarget(s);
  const g = s.people[person];
  const full = score(s, g, c, offer);
  assert.ok(
    score(s, g, c, { ...offer, wage: Math.round(offer.wage / 2) }) < full
  );
  assert.ok(lowball(s, g, c, { ...offer, wage: Math.floor(offer.wage * 0.7) }));
  assert.ok(!lowball(s, g, c, offer));
  // find a wage between counter and accept
  for (let w = offer.wage; w > 0; w--) {
    const o = { ...offer, wage: w };
    const a = answer(s, g, c, o);
    const sc = score(s, g, c, o);
    if (sc >= M.accept) assert.equal(a.kind, 'accept');
    else if (sc < M.counterFrom) assert.equal(a.kind, 'refuse');
    else if (a.kind === 'counter')
      assert.ok(
        score(s, g, c, a.offer) >= M.accept,
        'a counter is an offer they accept'
      );
  }
  const near = countering(s, person, offer);
  if (near) assert.ok(score(s, g, c, counterTo(s, g, c, near)!) >= M.accept);
});

test('an offer is answered after 2 days: an accepted one signs the person to the team, pays the fee, and ends their talks', () => {
  const s = founded();
  const team = me(s);
  const { person, offer } = freeTarget(s);
  const generous = { ...offer, wage: Math.ceil(offer.wage * M.most) };
  assert.equal(answerDay(s, team, person), s.day + M.answerDays);
  const t = must(s, { kind: 'OfferContract', person, offer: generous });
  refused(t, { kind: 'OfferContract', person, offer: generous }, 'waiting');
  const talk = t.talks.find((x) => x.team === team && x.person === person)!;
  assert.ok(
    t.queue.some(
      (e) => e.kind === 'answer' && e.talk === talk.id && e.day === talk.answer
    )
  );
  const u = heard(t, talk.id);
  assert.equal(
    answer(t, t.people[person], t.teams[team], generous).kind,
    'accept'
  );
  assert.equal(u.people[person].contract?.team, team);
  assert.ok(staffOf(u.teams[team]).includes(person));
  assert.equal(
    u.talks.some((x) => x.person === person),
    false
  );
  assert.equal(
    u.teams[team].balance,
    t.teams[team].balance -
      generous.fee -
      (generous.replaces === null
        ? 0
        : dismissalCost(t, t.people[generous.replaces]))
  );
  assert.ok(
    u.mail.some((m) => m.kind === 'accepted' && m.slots.person === person)
  );
  invariants(u);
});

test('lowballs cost patience; at none the person refuses everyone and talks to no one for 30 days', () => {
  let s = founded();
  const team = me(s);
  const lowOf = (o: Offer): Offer => ({
    ...o,
    wage: Math.floor(o.wage * M.lowball) - 1,
  });
  const { person, offer } = freeTarget(
    s,
    false,
    (id, o) =>
      answer(s, s.people[id], s.teams[team], lowOf(o)).kind !== 'accept'
  );
  const low = lowOf(offer);
  const start = s.people[person].patience;
  for (let i = 0; i < start; i++) {
    const t = offered(s, team, person, low, roll(s));
    const talk = t.talks.find((x) => x.team === team && x.person === person)!;
    s = heard(t, talk.id);
    s = { ...s, talks: s.talks.filter((x) => x.person !== person) };
    if (i < start - 1) assert.equal(s.people[person].patience, start - i - 1);
  }
  assert.ok(s.people[person].silentUntil >= s.day + M.silentDays);
  assert.equal(s.people[person].contract, null);
  assert.equal(offerCheck(s, team, person, offer)?.code, 'silent');
});

test('offers answered on one day are weighed together: the best-scoring offer signs, the other team is told', () => {
  const s = founded();
  const team = me(s);
  const { person, offer } = freeTarget(s);
  const rival = s.teams.find(
    (c) =>
      !c.player &&
      c.tier === s.teams[team].tier &&
      offerFor(s, c.id, person) !== null
  );
  assert.ok(rival, 'a rival of the tier may bid too');
  const mine = { ...offer, wage: Math.ceil(offer.wage * M.most) };
  const theirs = {
    ...offerFor(s, rival.id, person)!,
    wage: Math.ceil(askOf(s, s.people[person], rival).wage * 0.9),
  };
  let t = offered(s, team, person, mine, roll(s));
  t = offered(t, rival.id, person, theirs, roll(t));
  const ids = t.talks.filter((x) => x.person === person).map((x) => x.id);
  assert.equal(ids.length, 2);
  const u = heard(t, ids[0]);
  const g = t.people[person];
  const best =
    score(t, g, t.teams[team], mine) >= score(t, g, rival, theirs)
      ? team
      : rival.id;
  assert.equal(
    answer(t, g, t.teams[best], best === team ? mine : theirs).kind,
    'accept'
  );
  assert.equal(u.people[person].contract?.team, best);
  assert.equal(
    u.talks.filter((x) => x.person === person && x.counter === null).length,
    0,
    'both offers answered at once'
  );
  assert.equal(
    hear(u, { kind: 'answer', talk: ids[1], day: u.day, seq: 0 }),
    u,
    'the second answer event finds its talk answered and does nothing'
  );
});

test('a counter waits 7 days for AcceptCounter, then lapses', () => {
  const s = founded();
  const team = me(s);
  const { person, offer } = freeTarget(s, true);
  const low = countering(s, person, offer)!;
  const t = offered(s, team, person, low, roll(s));
  const talk = t.talks.find((x) => x.person === person)!;
  const u = heard(t, talk.id);
  const countered = u.talks.find((x) => x.id === talk.id)!;
  assert.ok(countered.counter);
  assert.ok(
    u.queue.some(
      (e) =>
        e.kind === 'lapse' &&
        e.talk === talk.id &&
        e.day === u.day + M.counterDays
    )
  );
  invariants(u);
  const v = must(u, { kind: 'AcceptCounter', person });
  assert.equal(v.people[person].contract?.team, team);
  assert.equal(v.people[person].contract?.wage, countered.counter.wage);
  const w = lapse(u, { kind: 'lapse', talk: talk.id, day: u.day, seq: 0 });
  assert.equal(
    w.talks.some((x) => x.id === talk.id),
    false
  );
  assert.ok(w.mail.some((m) => m.kind === 'counterLapsed'));
});

test("another team's person: no approach under contract without a break clause until its last 60 days; the tier rule; the clause paid", () => {
  const s = founded();
  const team = me(s);
  const c = s.teams[team];
  const clause = (st: CareerState, id: number): CareerState => {
    const people = [...st.people];
    people[id] = {
      ...people[id],
      contract: { ...people[id].contract!, breakClause: 300 },
    };
    return { ...st, people };
  };
  // the tier rule: a top-tier person will not drop to Tier 3 while under contract, clause or none
  const top = s.teams.find((x) => x.tier === 0)!.staff.pit[0];
  const three = s.teams.find((x) => x.tier === s.championships.length - 1)!;
  assert.equal(
    offerCheck(
      clause(s, top),
      three.id,
      top,
      asked(s, three.id, top, three.staff.pit[0])
    )?.code,
    'tier'
  );
  // a person of the player's tier, who would come for twice their ask
  const pick = s.teams
    .filter((x) => !x.player && x.tier === c.tier)
    .flatMap((x) => x.staff.pit)
    .find(
      (id) =>
        s.people[id].contract?.breakClause === null &&
        answer(s, s.people[id], c, {
          ...asked(s, team, id, c.staff.pit[0]),
          wage: asked(s, team, id, c.staff.pit[0]).wage * 2,
        }).kind === 'accept'
    );
  assert.ok(pick !== undefined, 'some pit crew member of the tier would come');
  const gid = pick;
  const other = s.teams[s.people[gid].contract!.team];
  const offer = asked(s, team, gid, c.staff.pit[0]);
  assert.equal(offerCheck(s, team, gid, offer)?.code, 'contracted');
  const t = clause(s, gid);
  assert.equal(offerCheck(t, team, gid, offer), null);
  assert.equal(breakCost(t, t.people[gid], team), 300);
  assert.equal(
    answerDay(t, team, gid),
    t.day + M.approachDays,
    'an approach gives their team a week to renew'
  );
  const u = offered(t, team, gid, { ...offer, wage: offer.wage * 2 }, roll(t));
  const talk = u.talks.find((x) => x.person === gid && x.team === team)!;
  const v = heard(u, talk.id);
  assert.equal(v.people[gid].contract?.team, team);
  assert.equal(
    v.teams[other.id].balance,
    u.teams[other.id].balance + 300,
    'the old team is paid the clause'
  );
  assert.ok(!staffOf(v.teams[other.id]).includes(gid));
});

test("Dismiss releases one of the player's own and pays the rest of the season's wage; never a manager, chairman or another's", () => {
  const s = founded();
  const c = s.teams[me(s)];
  const gid = c.staff.pit[0];
  const cost = dismissalCost(s, s.people[gid]);
  const t = must(s, { kind: 'Dismiss', person: gid });
  assert.equal(t.people[gid].contract, null);
  assert.ok(!staffOf(t.teams[c.id]).includes(gid));
  assert.equal(t.teams[c.id].balance, c.balance - cost);
  refused(s, { kind: 'Dismiss', person: c.staff.chairman }, 'notYours');
  refused(s, { kind: 'Dismiss', person: s.player!.person }, 'notYours');
  refused(
    s,
    { kind: 'Dismiss', person: s.teams.find((x) => !x.player)!.staff.pit[0] },
    'notYours'
  );
  invariants(t);
});

test("contracts expire at the season's end to the free agents; 150 young people join them; the world still holds", () => {
  const s = founded();
  const gid = s.people.find(
    (g) => g.contract && g.contract.ends !== null && !g.player
  )!.id;
  const ends = s.people[gid].contract!.ends!;
  const t = expired({ ...s, season: ends, round: TUNING.calendar.rounds });
  assert.equal(t.people[gid].contract, null);
  assert.ok(
    t.people.every(
      (g) => !g.contract || g.contract.ends === null || g.contract.ends > ends
    )
  );
  invariants(t);
  const u = youngPeople(t, roll(t));
  assert.equal(u.people.length, t.people.length + M.young.count);
  for (const g of u.people.slice(t.people.length)) {
    assert.equal(g.contract, null);
    assert.ok(g.stats && Object.keys(g.stats).length > 0);
  }
  invariants(u);
});

test('commands refused while sacked; OfferContract refuses managers and chairmen', () => {
  const s = founded();
  const c = s.teams.find((x) => !x.player)!;
  const r = apply(s, {
    kind: 'OfferContract',
    person: c.staff.chairman,
    offer: {
      role: 'chairman',
      status: 'staff',
      wage: 1,
      fee: 0,
      seasons: 1,
      podium: 0,
      sinking: 0,
      breakClause: null,
      replaces: null,
    },
  });
  assert.equal(r.ok, false);
  const sacked = { ...s, player: { ...s.player!, sacked: true } };
  refused(sacked, { kind: 'StartScout', scout: 0, person: 1 }, 'sacked');
  refused(sacked, { kind: 'Dismiss', person: 0 }, 'sacked');
  refused(sacked, { kind: 'Advance' }, 'sacked');
});
