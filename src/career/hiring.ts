// Hiring (Phase B section 5): offers, answers two days on (an approach to another team's person, seven), counters,
// patience, the tier rule, break clauses, dismissals, renewals and the contract's last days. The player's commands
// and the rivals' bids (career/rivals.ts) go through the same checks and the same `offered` and `signed`.

import type { Offer } from '../office.ts';
import {
  accept,
  refuse,
  whole,
  why,
  type Check,
  type Handlers,
} from './command.ts';
import { canSpend, paid } from './balance.ts';
import {
  belowThem,
  breakCost,
  closing,
  dismissalCost,
  released,
  seatFor,
  signed,
} from './contracts.ts';
import type { Dice } from './dice.ts';
import { effective } from './effective.ts';
import { bidShare, commitment } from './leadership.ts';
import { answer, askOf, lowball, score } from './market.ts';
import { roomOf } from './money.ts';
import { moraleIn, silenceMove, wantsOut } from './morale.ts';
import { mine, post } from './post.ts';
import { schedule, unscheduled, type Event } from './queue.ts';
import type { PersonOf } from './roles.ts';
import { seatOf, seatRole, statuses } from './seats.ts';
import { persuades } from './staff.ts';
import type { CareerState, Talk } from './state.ts';
import { TUNING } from './tuning.ts';

const M = TUNING.market;

/** Whether an offer's fields are what its type says. */
function shapeCheck(o: Offer): Check {
  if (o === null || typeof o !== 'object')
    return why('offer', 'That offer makes no sense.');
  const money =
    [o.wage, o.fee, o.podium, o.sinking].every((x) => whole(x, 0, 1e7)) &&
    (o.breakClause === null || whole(o.breakClause, 0, 1e8));
  if (!money)
    return why(
      'offer',
      'Wages, fees, bonuses and the break clause are whole Coin.'
    );
  if (!whole(o.seasons, 1, 3))
    return why('seasons', 'A contract runs one to three seasons.');
  if (o.replaces !== null && !whole(o.replaces, 0, 1e9))
    return why('replaces', 'Name the person they replace, or none.');
  return null;
}

/** Whether a team may sign a person on an offer now: who they are, the post, the tier rule, the break clause, the balance.
 *  The checks an answer repeats on its day. */
export function signableCheck(
  s: CareerState,
  team: number,
  person: number,
  o: Offer
): Check {
  const c = s.teams[team];
  const g = s.people[person];
  if (!c || !g) return why('who', 'No such person.');
  if (g.retired !== null) return why('retired', 'They have retired.');
  if (g.player || g.role === 'manager' || g.role === 'chairman')
    return why(
      'role',
      'Managers and chairmen are hired by chairmen, not offered contracts.'
    );
  if (o.role !== g.role) return why('role', `They are a ${g.role}.`);
  if (!statuses(g.role).includes(o.status))
    return why(
      'status',
      g.role === 'driver'
        ? 'A driver sails a ship or is the reserve.'
        : 'They join as staff.'
    );
  const renewal = g.contract?.team === team;
  if (renewal) {
    if (o.replaces !== null)
      return why('replaces', 'A renewal keeps them where they are.');
    if (wantsOut(g.morale))
      return why('leaving', 'They have asked to leave and will not renew.');
    const seat = seatOf(c, person);
    if (seat && g.role === 'driver' && seatRole(seat).status !== o.status)
      return why(
        'status',
        'A renewal keeps their place: change who sails in the race plan.'
      );
  } else {
    if (
      g.contract &&
      !closing(s, g.contract) &&
      g.contract.breakClause === null
    )
      return why(
        'contracted',
        'They are under contract with no break clause: wait for its last 60 days.'
      );
    if (belowThem(s, g, c))
      return why(
        'tier',
        'They will not drop more than one tier while under contract.'
      );
    if (o.replaces !== null) {
      const seat = seatOf(c, o.replaces);
      if (
        !seat ||
        seat.kind === 'manager' ||
        s.people[o.replaces].role !== g.role
      )
        return why(
          'replaces',
          'They can only take the post of one of your own of their role.'
        );
      if (seatRole(seat).status !== o.status)
        return why('status', 'They take the post of the one they replace.');
    }
    if (!seatFor(s, c, o))
      return why(
        'noSeat',
        `There is no open post for a ${g.role}: name whom they replace.`
      );
  }
  const leaving =
    !renewal && o.replaces !== null
      ? dismissalCost(s, s.people[o.replaces])
      : 0;
  if (!canSpend(c, o.fee + breakCost(s, g, team) + leaving))
    return why(
      'balance',
      'The chairman will not let the balance fall that low.'
    );
  return null;
}

/** Whether a team may make an offer to a person today (the player's screens and the rivals both ask). */
export function offerCheck(
  s: CareerState,
  team: number,
  person: number,
  o: Offer
): Check {
  const shape = shapeCheck(o);
  if (shape) return shape;
  if (!whole(person, 0, s.people.length - 1))
    return why('who', 'No such person.');
  const g = s.people[person];
  if (s.day < g.silentUntil)
    return why(
      'silent',
      `They will not talk to anyone until day ${g.silentUntil}.`
    );
  const talk = s.talks.find((t) => t.team === team && t.person === person);
  if (talk && talk.counter === null)
    return why('waiting', `They answer on day ${talk.answer}.`);
  return signableCheck(s, team, person, o);
}

/** The day a person answers an offer made today: an approach to another team's person waits longer, so their team may
 *  answer it with a renewal. */
export const answerDay = (
  s: CareerState,
  team: number,
  person: number
): number => {
  const c = s.people[person].contract;
  return s.day + (c && c.team !== team ? M.approachDays : M.answerDays);
};

/** A state with an offer made (checked first): a talk opened, its answer scheduled; a scout's report within its
 *  window may lend Persuasion; the team a person is approached from is told. A countered talk is replaced. */
export function offered(
  s: CareerState,
  team: number,
  person: number,
  offer: Offer,
  roll: Dice
): CareerState {
  let out = endTalk(s, team, person);
  const g = out.people[person];
  const known = g.known[team];
  let patience = g.patience,
    scout: number | null = null;
  if (known && known.by !== null && !known.used) {
    const by = out.people[known.by];
    const persuasion =
      by.role === 'scout'
        ? effective(by as PersonOf<'scout'>, null).persuasion
        : 0;
    if (persuades(persuasion, known.day, out.day, roll.roll('persuade'))) {
      patience = Math.min(M.patienceMost, patience + 1);
      scout = known.by;
    }
  }
  const settled =
    g.contract?.team === team && closing(out, g.contract) ? true : g.silenced;
  const people = [...out.people];
  people[person] = {
    ...g,
    patience,
    silenced: settled,
    known: known ? { ...g.known, [team]: { ...known, used: true } } : g.known,
  };
  const day = answerDay(out, team, person);
  const talk: Talk = {
    id: out.ids.talk,
    team,
    person,
    offer,
    made: out.day,
    answer: day,
    counter: null,
    scout,
  };
  out = {
    ...out,
    people,
    talks: [...out.talks, talk],
    ids: { ...out.ids, talk: talk.id + 1 },
  };
  out = schedule(out, day, { kind: 'answer', talk: talk.id });
  const theirs = g.contract;
  if (theirs && theirs.team !== team) {
    out = post(out, {
      team: theirs.team,
      category: 'market',
      sender: s.teams[team].staff.manager,
      kind: 'approached',
      slots: { person, team, day },
      links: [
        { to: 'person', id: person },
        { to: 'team', id: team },
      ],
    });
  }
  return out;
}

/** A state with a team's talk with a person ended (withdrawn or replaced), its events off the queue. */
export function endTalk(
  s: CareerState,
  team: number,
  person: number
): CareerState {
  const t = s.talks.find((x) => x.team === team && x.person === person);
  if (!t) return s;
  const out = unscheduled(
    s,
    (e) => (e.kind === 'answer' || e.kind === 'lapse') && e.talk === t.id
  );
  return { ...out, talks: out.talks.filter((x) => x.id !== t.id) };
}

/** Whether a rival meets a person's counter: payable within its manager's Finance, at most the ask × counterMost. */
export function meetsCounter(s: CareerState, t: Talk, counter: Offer): boolean {
  const c = s.teams[t.team];
  const manager = c.staff.manager === null ? null : s.people[c.staff.manager];
  if (!manager || manager.role !== 'manager') return false;
  const g = s.people[t.person];
  const ask = askOf(s, g, c).wage;
  const stats = effective(manager as PersonOf<'manager'>, null);
  const room = Math.min(
    roomOf(s, t.team, stats.finance),
    commitment(stats.finance, c.balance, c.debtFloor)
  );
  const cost = counter.fee + breakCost(s, g, t.team);
  const most =
    ask *
    TUNING.rivals.counterMost *
    (bidShare(stats.negotiation) / bidShare(0));
  return (
    counter.wage <= most &&
    cost <= room &&
    signableCheck(s, t.team, t.person, counter) === null
  );
}

/** Mail to the player of an answer to their offer. */
const told = (s: CareerState, t: Talk, kind: string): CareerState =>
  post(s, {
    team: t.team,
    category: 'market',
    sender: null,
    kind,
    slots: { person: t.person, talk: t.id },
    links: [{ to: 'person', id: t.person }],
  });

/** A person answers every offer due today at once (the others' events then find their talk answered, and do nothing): patience paid for each lowball (at none, silence for 30 days and
 *  every offer refused); of the offers they would accept, the highest score is signed and the rest refused; with none
 *  to accept, each offer from 0.85 is countered and the rest refused. A rival meets a counter at once if worth it. */
export function hear(
  s: CareerState,
  e: Extract<Event, { kind: 'answer' }>
): CareerState {
  const first = s.talks.find((t) => t.id === e.talk);
  if (!first || first.counter !== null) return s;
  const due = s.talks.filter(
    (t) =>
      t.person === first.person &&
      t.counter === null &&
      t.answer === first.answer
  );
  const ids = new Set(due.map((t) => t.id));
  let out = s;
  const person = first.person;
  let g = out.people[person];
  for (const t of due)
    if (lowball(out, g, out.teams[t.team], t.offer))
      g = { ...g, patience: g.patience - 1 };
  const silent = g.patience <= 0;
  if (silent)
    g = {
      ...g,
      patience: TUNING.patience,
      silentUntil: out.day + M.silentDays,
    };
  const people = [...out.people];
  people[person] = g;
  out = { ...out, people, talks: out.talks.filter((t) => !ids.has(t.id)) };
  if (silent) return due.reduce((acc, t) => told(acc, t, 'silent'), out);
  const valid = due.filter(
    (t) => signableCheck(out, t.team, person, t.offer) === null
  );
  const answers = valid.map((t) => ({
    t,
    a: answer(out, g, out.teams[t.team], t.offer),
    sc: score(out, g, out.teams[t.team], t.offer),
  }));
  const yes = answers
    .filter((x) => x.a.kind === 'accept')
    .sort((a, b) => b.sc - a.sc || a.t.id - b.t.id)[0];
  if (yes) {
    out = signed(out, { team: yes.t.team, person, offer: yes.t.offer });
    out = told(out, yes.t, 'accepted');
    return due
      .filter((t) => t !== yes.t)
      .reduce((acc, t) => told(acc, t, 'signedElsewhere'), out);
  }
  // rivals first: one that meets its counter signs the person, and the rest are told they signed elsewhere
  const order = [...due].sort(
    (a, b) =>
      Number(out.teams[a.team].player) - Number(out.teams[b.team].player) ||
      a.id - b.id
  );
  for (const [i, t] of order.entries()) {
    const x = answers.find((y) => y.t === t);
    if (!x || x.a.kind !== 'counter') {
      out = told(out, t, x ? 'refused' : 'lapsedPost');
      continue;
    }
    const counter = x.a.offer;
    if (!out.teams[t.team].player && meetsCounter(out, t, counter)) {
      out = signed(out, { team: t.team, person, offer: counter });
      return order
        .slice(i + 1)
        .reduce((acc, u) => told(acc, u, 'signedElsewhere'), out);
    }
    out = { ...out, talks: [...out.talks, { ...t, counter }] };
    out = schedule(out, out.day + M.counterDays, { kind: 'lapse', talk: t.id });
    out = told(out, t, 'counter');
  }
  return out;
}

/** A counter not taken lapses. */
export function lapse(
  s: CareerState,
  e: Extract<Event, { kind: 'lapse' }>
): CareerState {
  const t = s.talks.find((x) => x.id === e.talk);
  if (!t) return s;
  return told(
    { ...s, talks: s.talks.filter((x) => x.id !== t.id) },
    t,
    'counterLapsed'
  );
}

/** The last days of this season's contracts open: the player is told of each of theirs. */
export function closingOpens(
  s: CareerState,
  e: Extract<Event, { kind: 'closing' }>
): CareerState {
  const me = mine(s);
  if (me === null) return s;
  let out = s;
  for (const g of s.people) {
    if (g.contract?.team !== me || g.contract.ends !== e.season || g.player)
      continue;
    out = post(out, {
      team: me,
      category: 'market',
      sender: null,
      kind: 'contractClosing',
      slots: { person: g.id },
      links: [{ to: 'person', id: g.id }],
    });
  }
  return out;
}

/** Those whose contracts end this season and who have been offered no renewal by now lose morale, once. */
export function silenceFalls(
  s: CareerState,
  e: Extract<Event, { kind: 'silence' }>
): CareerState {
  const people = s.people.map((g) =>
    g.contract &&
    g.contract.ends === e.season &&
    !g.player &&
    g.role !== 'chairman' &&
    !g.silenced &&
    g.retired === null
      ? { ...g, morale: moraleIn(g.morale + silenceMove()), silenced: true }
      : g
  );
  return { ...s, people };
}

/** The player's team, or the refusal. */
function myTeam(s: CareerState): { team: number } | { no: NonNullable<Check> } {
  if (!s.player) return { no: why('unfounded', 'Found a team first.') };
  const me = mine(s);
  return me === null
    ? { no: why('sacked', 'You have no team: take one of the posts offered.') }
    : { team: me };
}

/** Whether the player may dismiss a person. */
export function dismissCheck(s: CareerState, person: number): Check {
  const m = myTeam(s);
  if ('no' in m) return m.no;
  if (!whole(person, 0, s.people.length - 1))
    return why('who', 'No such person.');
  const g = s.people[person];
  if (
    g.contract?.team !== m.team ||
    g.player ||
    g.role === 'chairman' ||
    g.role === 'manager'
  )
    return why('notYours', 'You can dismiss only your own staff.');
  if (s.race?.started) return why('racing', 'The race is under way.');
  if (!canSpend(s.teams[m.team], dismissalCost(s, g)))
    return why(
      'balance',
      'The chairman will not let the balance fall that low.'
    );
  return null;
}

export const HIRING: Handlers = {
  OfferContract: (s, c, roll) => {
    const m = myTeam(s);
    if ('no' in m) return refuse(m.no.code, m.no.sentence);
    const no = offerCheck(s, m.team, c.person, c.offer);
    return no
      ? refuse(no.code, no.sentence)
      : accept(offered(s, m.team, c.person, c.offer, roll));
  },
  AcceptCounter: (s, c) => {
    const m = myTeam(s);
    if ('no' in m) return refuse(m.no.code, m.no.sentence);
    const t = s.talks.find((x) => x.team === m.team && x.person === c.person);
    if (!t || t.counter === null)
      return refuse('noCounter', 'They have made you no counter.');
    const no = signableCheck(s, m.team, c.person, t.counter);
    if (no) return refuse(no.code, no.sentence);
    return accept(
      signed(endTalk(s, m.team, c.person), {
        team: m.team,
        person: c.person,
        offer: t.counter,
      })
    );
  },
  WithdrawOffer: (s, c) => {
    const m = myTeam(s);
    if ('no' in m) return refuse(m.no.code, m.no.sentence);
    if (!s.talks.some((x) => x.team === m.team && x.person === c.person))
      return refuse('noTalk', 'You are not talking with them.');
    return accept(endTalk(s, m.team, c.person));
  },
  Dismiss: (s, c) => {
    const no = dismissCheck(s, c.person);
    if (no) return refuse(no.code, no.sentence);
    const g = s.people[c.person];
    const team = g.contract!.team;
    return accept(
      released(
        paid(s, team, dismissalCost(s, g), {
          kind: 'dismissal',
          what: `${g.given} ${g.family} dismissed`,
        }),
        c.person
      )
    );
  },
};
