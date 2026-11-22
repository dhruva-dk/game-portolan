// Phase B sections 4 and 5: scouting, what a crew sees, and the market (asks, answers, counters, patience, the
// league rule, break clauses, approaches, dismissals, expiry, the young).
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Offer } from '../src/office.ts';
import { apply, type CareerState } from '../src/career/career.ts';
import {
  breakCost,
  dismissalCost,
  expired,
  youngGulls,
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
const me = (s: CareerState) => s.player!.crew;

/** An offer of a gull's ask from a crew, for the post of `replaces` (or an open one). */
function asked(
  s: CareerState,
  crew: number,
  gull: number,
  replaces: number | null
): Offer {
  const g = s.gulls[gull];
  const a = askOf(s, g, s.crews[crew]);
  const status =
    replaces === null
      ? g.role === 'captain'
        ? 'ship'
        : 'staff'
      : seatRole(seatOf(s.crews[crew], replaces, (id) => s.gulls[id].job)!)
          .status;
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

/** An offer of a gull's ask a crew may make (to an open post, or replacing one of its own of the role), or null. */
function offerFor(s: CareerState, crew: number, gull: number): Offer | null {
  const c = s.crews[crew];
  const own = staffOf(c).filter(
    (id) => s.gulls[id].role === s.gulls[gull].role && !s.gulls[id].player
  );
  for (const replaces of [null, ...own]) {
    const offer = asked(s, crew, gull, replaces);
    if (offerCheck(s, crew, gull, offer) === null) return offer;
  }
  return null;
}

/** A free agent the player's crew may make an offer to who would accept their ask raised to the most money, and that
 *  offer at their ask (and, if `counters`, one for whom some lower wage draws a counter). */
function freeTarget(
  s: CareerState,
  counters = false,
  also: (gull: number, offer: Offer) => boolean = () => true
): { gull: number; offer: Offer } {
  const c = s.crews[me(s)];
  for (const g of s.gulls) {
    if (
      g.contract !== null ||
      g.retired !== null ||
      g.player ||
      g.role === 'manager' ||
      g.role === 'elder' ||
      s.day < g.silentUntil
    )
      continue;
    if (!g.wants.includes('money')) continue; // wage tests need a gull who weighs it
    const offer = offerFor(s, c.id, g.id);
    if (
      !offer ||
      answer(s, g, c, { ...offer, wage: Math.ceil(offer.wage * M.most) })
        .kind !== 'accept'
    )
      continue;
    if ((counters && !countering(s, g.id, offer)) || !also(g.id, offer))
      continue;
    return { gull: g.id, offer };
  }
  throw new Error('no free agent to offer');
}

/** A wage below the offer's, not a lowball, that draws a counter from the gull; or null. */
function countering(s: CareerState, gull: number, offer: Offer): Offer | null {
  const g = s.gulls[gull],
    c = s.crews[me(s)];
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

test('a scout is sent to a gull in Reach, reports by mail after its days, and the crew then knows them exactly', () => {
  const s = founded();
  const c = s.crews[me(s)];
  const scout = c.staff.scouts[0];
  assert.ok(scout !== undefined, "the player's crew starts with a scout");
  const target = s.gulls.find(
    (g) =>
      g.contract === null &&
      g.retired === null &&
      !g.player &&
      !knows(s, c.id, g)
  )!;
  const before = view(s, c.id, target.id);
  assert.equal(before.known, false);
  assert.ok(before.stars[0] <= before.stars[1]);
  const t = must(s, { kind: 'StartScout', scout, gull: target.id });
  const job = t.scouting.find((x) => x.scout === scout)!;
  assert.ok(job.done > t.day);
  assert.ok(
    t.queue.some(
      (e) => e.kind === 'report' && e.scout === scout && e.day === job.done
    )
  );
  refused(t, { kind: 'StartScout', scout, gull: target.id }, 'busy');
  refused(
    t,
    { kind: 'StartScout', scout: c.staff.flight[0], gull: target.id },
    'notScout'
  );
  refused(s, { kind: 'StartScout', scout, gull: c.staff.flight[0] }, 'known');
  invariants(t);
  let u = t;
  while (u.scouting.some((x) => x.scout === scout && x.crew === c.id))
    u = must(u.race ? { ...u, race: null, round: u.round + 1 } : u, {
      kind: 'Advance',
    });
  assert.equal(view(u, c.id, target.id).known, true);
  assert.equal(u.gulls[target.id].known[c.id].by, scout);
  assert.ok(
    u.mail.some((m) => m.kind === 'scoutReport' && m.slots.gull === target.id)
  );
  const v = view(u, c.id, target.id);
  assert.equal(v.stars[0], v.stars[1], 'known stars are exact');
});

test('CancelScout frees the scout and takes the report off the queue', () => {
  const s = founded();
  const c = s.crews[me(s)];
  const scout = c.staff.scouts[0];
  const target = s.gulls.find(
    (g) => g.contract === null && g.retired === null && !g.player
  )!;
  const t = must(s, { kind: 'StartScout', scout, gull: target.id });
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
  const crew = me(s);
  const g = s.gulls.find(
    (x) => x.contract === null && x.retired === null && !x.player
  )!;
  const t = knowledgeTurned(learned(s, crew, g.id, null));
  assert.equal(view(t, crew, g.id).arrow, 0);
  const gulls = [...t.gulls];
  const up = Object.fromEntries(
    Object.entries(g.stats).map(([k, v]) => [k, Math.min(20, v + 4)])
  );
  gulls[g.id] = withStats(t.gulls[g.id], up);
  assert.ok((view({ ...t, gulls }, crew, g.id).arrow ?? 0) > 0);
});

test('the gulls a crew knows, kept between states, match a scan of every gull in any state read, in any order', () => {
  const scan = (s: CareerState, crew: number) =>
    s.gulls.filter((g) => g.known[String(crew)] !== undefined).map((g) => g.id);
  let s = founded();
  const states: CareerState[] = [s];
  for (let k = 0; k < 6; k++) {
    s = s.race === null ? must(s, { kind: 'Advance' }) : sailed(s);
    states.push(s);
  }
  s = learned(learned(s, 0, s.gulls.length - 1, null), 3, 5, null);
  states.push(s, states[1], states[4]);
  for (const t of states)
    for (const crew of [0, 3, 17, 60])
      assert.deepEqual(knownTo(t, crew), scan(t, crew));
});

test("a gull's answer: their ask is accepted; less money scores lower; from 0.85 a counter that scores 1; below it a refusal", () => {
  const s = founded();
  const c = s.crews[me(s)];
  const { gull, offer } = freeTarget(s);
  const g = s.gulls[gull];
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
  const near = countering(s, gull, offer);
  if (near) assert.ok(score(s, g, c, counterTo(s, g, c, near)!) >= M.accept);
});

test('an offer is answered after 2 days: an accepted one signs the gull to the crew, pays the fee, and ends their talks', () => {
  const s = founded();
  const crew = me(s);
  const { gull, offer } = freeTarget(s);
  const generous = { ...offer, wage: Math.ceil(offer.wage * M.most) };
  assert.equal(answerDay(s, crew, gull), s.day + M.answerDays);
  const t = must(s, { kind: 'OfferContract', gull, offer: generous });
  refused(t, { kind: 'OfferContract', gull, offer: generous }, 'waiting');
  const talk = t.talks.find((x) => x.crew === crew && x.gull === gull)!;
  assert.ok(
    t.queue.some(
      (e) => e.kind === 'answer' && e.talk === talk.id && e.day === talk.answer
    )
  );
  const u = heard(t, talk.id);
  assert.equal(
    answer(t, t.gulls[gull], t.crews[crew], generous).kind,
    'accept'
  );
  assert.equal(u.gulls[gull].contract?.crew, crew);
  assert.ok(staffOf(u.crews[crew]).includes(gull));
  assert.equal(
    u.talks.some((x) => x.gull === gull),
    false
  );
  assert.equal(
    u.crews[crew].coin,
    t.crews[crew].coin -
      generous.fee -
      (generous.replaces === null
        ? 0
        : dismissalCost(t, t.gulls[generous.replaces]))
  );
  assert.ok(u.mail.some((m) => m.kind === 'accepted' && m.slots.gull === gull));
  invariants(u);
});

test('lowballs cost patience; at none the gull refuses everyone and talks to no one for 30 days', () => {
  let s = founded();
  const crew = me(s);
  const lowOf = (o: Offer): Offer => ({
    ...o,
    wage: Math.floor(o.wage * M.lowball) - 1,
  });
  const { gull, offer } = freeTarget(
    s,
    false,
    (id, o) => answer(s, s.gulls[id], s.crews[crew], lowOf(o)).kind !== 'accept'
  );
  const low = lowOf(offer);
  const start = s.gulls[gull].patience;
  for (let i = 0; i < start; i++) {
    const t = offered(s, crew, gull, low, roll(s));
    const talk = t.talks.find((x) => x.crew === crew && x.gull === gull)!;
    s = heard(t, talk.id);
    s = { ...s, talks: s.talks.filter((x) => x.gull !== gull) };
    if (i < start - 1) assert.equal(s.gulls[gull].patience, start - i - 1);
  }
  assert.ok(s.gulls[gull].silentUntil >= s.day + M.silentDays);
  assert.equal(s.gulls[gull].contract, null);
  assert.equal(offerCheck(s, crew, gull, offer)?.code, 'silent');
});

test('offers answered on one day are weighed together: the best-scoring offer signs, the other crew is told', () => {
  const s = founded();
  const crew = me(s);
  const { gull, offer } = freeTarget(s);
  const rival = s.crews.find(
    (c) =>
      !c.player &&
      c.league === s.crews[crew].league &&
      offerFor(s, c.id, gull) !== null
  );
  assert.ok(rival, 'a rival of the league may bid too');
  const mine = { ...offer, wage: Math.ceil(offer.wage * M.most) };
  const theirs = {
    ...offerFor(s, rival.id, gull)!,
    wage: Math.ceil(askOf(s, s.gulls[gull], rival).wage * 0.9),
  };
  let t = offered(s, crew, gull, mine, roll(s));
  t = offered(t, rival.id, gull, theirs, roll(t));
  const ids = t.talks.filter((x) => x.gull === gull).map((x) => x.id);
  assert.equal(ids.length, 2);
  const u = heard(t, ids[0]);
  const g = t.gulls[gull];
  const best =
    score(t, g, t.crews[crew], mine) >= score(t, g, rival, theirs)
      ? crew
      : rival.id;
  assert.equal(
    answer(t, g, t.crews[best], best === crew ? mine : theirs).kind,
    'accept'
  );
  assert.equal(u.gulls[gull].contract?.crew, best);
  assert.equal(
    u.talks.filter((x) => x.gull === gull && x.counter === null).length,
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
  const crew = me(s);
  const { gull, offer } = freeTarget(s, true);
  const low = countering(s, gull, offer)!;
  const t = offered(s, crew, gull, low, roll(s));
  const talk = t.talks.find((x) => x.gull === gull)!;
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
  const v = must(u, { kind: 'AcceptCounter', gull });
  assert.equal(v.gulls[gull].contract?.crew, crew);
  assert.equal(v.gulls[gull].contract?.wage, countered.counter.wage);
  const w = lapse(u, { kind: 'lapse', talk: talk.id, day: u.day, seq: 0 });
  assert.equal(
    w.talks.some((x) => x.id === talk.id),
    false
  );
  assert.ok(w.mail.some((m) => m.kind === 'counterLapsed'));
});

test("another crew's gull: no approach under contract without a break clause until its last 60 days; the league rule; the clause paid", () => {
  const s = founded();
  const crew = me(s);
  const c = s.crews[crew];
  const clause = (st: CareerState, id: number): CareerState => {
    const gulls = [...st.gulls];
    gulls[id] = {
      ...gulls[id],
      contract: { ...gulls[id].contract!, breakClause: 300 },
    };
    return { ...st, gulls };
  };
  // the league rule: a top-league gull will not drop to League Three while under contract, clause or none
  const top = s.crews.find((x) => x.league === 0)!.staff.flight[0];
  const three = s.crews.find((x) => x.league === s.leagues.length - 1)!;
  assert.equal(
    offerCheck(
      clause(s, top),
      three.id,
      top,
      asked(s, three.id, top, three.staff.flight[0])
    )?.code,
    'league'
  );
  // a gull of the player's league, who would come for twice their ask
  const pick = s.crews
    .filter((x) => !x.player && x.league === c.league)
    .flatMap((x) => x.staff.flight)
    .find(
      (id) =>
        answer(s, s.gulls[id], c, {
          ...asked(s, crew, id, c.staff.flight[0]),
          wage: asked(s, crew, id, c.staff.flight[0]).wage * 2,
        }).kind === 'accept'
    );
  assert.ok(pick !== undefined, 'some flight gull of the league would come');
  const gid = pick;
  const other = s.crews[s.gulls[gid].contract!.crew];
  const offer = asked(s, crew, gid, c.staff.flight[0]);
  assert.equal(offerCheck(s, crew, gid, offer)?.code, 'contracted');
  const t = clause(s, gid);
  assert.equal(offerCheck(t, crew, gid, offer), null);
  assert.equal(breakCost(t, t.gulls[gid], crew), 300);
  assert.equal(
    answerDay(t, crew, gid),
    t.day + M.approachDays,
    'an approach gives their crew a week to renew'
  );
  const u = offered(t, crew, gid, { ...offer, wage: offer.wage * 2 }, roll(t));
  const talk = u.talks.find((x) => x.gull === gid && x.crew === crew)!;
  const v = heard(u, talk.id);
  assert.equal(v.gulls[gid].contract?.crew, crew);
  assert.equal(
    v.crews[other.id].coin,
    u.crews[other.id].coin + 300,
    'the old crew is paid the clause'
  );
  assert.ok(!staffOf(v.crews[other.id]).includes(gid));
});

test("Dismiss releases one of the player's own and pays the rest of the season's wage; never a manager, elder or another's", () => {
  const s = founded();
  const c = s.crews[me(s)];
  const gid = c.staff.flight[0];
  const cost = dismissalCost(s, s.gulls[gid]);
  const t = must(s, { kind: 'Dismiss', gull: gid });
  assert.equal(t.gulls[gid].contract, null);
  assert.ok(!staffOf(t.crews[c.id]).includes(gid));
  assert.equal(t.crews[c.id].coin, c.coin - cost);
  refused(s, { kind: 'Dismiss', gull: c.staff.elder }, 'notYours');
  refused(s, { kind: 'Dismiss', gull: s.player!.gull }, 'notYours');
  refused(
    s,
    { kind: 'Dismiss', gull: s.crews.find((x) => !x.player)!.staff.flight[0] },
    'notYours'
  );
  invariants(t);
});

test("contracts expire at the season's end to the free agents; 150 young gulls join them; the world still holds", () => {
  const s = founded();
  const gid = s.gulls.find(
    (g) => g.contract && g.contract.ends !== null && !g.player
  )!.id;
  const ends = s.gulls[gid].contract!.ends!;
  const t = expired({ ...s, season: ends, round: TUNING.calendar.rounds });
  assert.equal(t.gulls[gid].contract, null);
  assert.ok(
    t.gulls.every(
      (g) => !g.contract || g.contract.ends === null || g.contract.ends > ends
    )
  );
  invariants(t);
  const u = youngGulls(t, roll(t));
  assert.equal(u.gulls.length, t.gulls.length + M.young.count);
  for (const g of u.gulls.slice(t.gulls.length)) {
    assert.equal(g.contract, null);
    assert.ok(g.stats && Object.keys(g.stats).length > 0);
  }
  invariants(u);
});

test('commands refused while sacked; OfferContract refuses managers and elders', () => {
  const s = founded();
  const c = s.crews.find((x) => !x.player)!;
  const r = apply(s, {
    kind: 'OfferContract',
    gull: c.staff.elder,
    offer: {
      role: 'elder',
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
  refused(sacked, { kind: 'StartScout', scout: 0, gull: 1 }, 'sacked');
  refused(sacked, { kind: 'Dismiss', gull: 0 }, 'sacked');
  refused(sacked, { kind: 'Advance' }, 'sacked');
});
