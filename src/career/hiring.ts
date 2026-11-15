// Hiring (Phase B section 5): offers, answers two days on (an approach to another crew's gull, seven), counters,
// patience, the league rule, break clauses, dismissals, renewals and the contract's last days. The player's commands
// and the rivals' bids (career/rivals.ts) go through the same checks and the same `offered` and `signed`.

import type { Offer } from '../office.ts';
import { accept, refuse, whole, why, type Check, type Handlers } from './command.ts';
import { canSpend, paid } from './coin.ts';
import { belowThem, breakCost, closing, dismissalCost, released, seatFor, signed } from './contracts.ts';
import type { Dice } from './dice.ts';
import { effective } from './effective.ts';
import { bidShare, commitment } from './leadership.ts';
import { answer, askOf, lowball, score } from './market.ts';
import { moraleIn, silenceMove, wantsOut } from './morale.ts';
import { mine, post } from './post.ts';
import { schedule, unscheduled, type Event } from './queue.ts';
import type { GullOf } from './roles.ts';
import { seatOf, seatRole, statuses } from './seats.ts';
import { persuades } from './staff.ts';
import type { CareerState, Talk } from './state.ts';
import { TUNING } from './tuning.ts';

const M = TUNING.market;

/** Whether an offer's fields are what its type says. */
function shapeCheck(o: Offer): Check {
  if (o === null || typeof o !== 'object') return why('offer', 'That offer makes no sense.');
  const money = [o.wage, o.fee, o.podium, o.sinking].every((x) => whole(x, 0, 1e7)) && (o.breakClause === null || whole(o.breakClause, 0, 1e8));
  if (!money) return why('offer', 'Wages, fees, bonuses and the break clause are whole Coin.');
  if (!whole(o.seasons, 1, 3)) return why('seasons', 'A contract runs one to three seasons.');
  if (o.replaces !== null && !whole(o.replaces, 0, 1e9)) return why('replaces', 'Name the gull they replace, or none.');
  return null;
}

/** Whether a crew may sign a gull on an offer now: who they are, the post, the league rule, the break clause, the coin.
 *  The checks an answer repeats on its day. */
export function signableCheck(s: CareerState, crew: number, gull: number, o: Offer): Check {
  const c = s.crews[crew];
  const g = s.gulls[gull];
  if (!c || !g) return why('who', 'No such gull.');
  if (g.retired !== null) return why('retired', 'They have retired.');
  if (g.player || g.role === 'manager' || g.role === 'elder') return why('role', 'Managers and elders are hired by elders, not offered contracts.');
  if (o.role !== g.role) return why('role', `They are a ${g.role}.`);
  if (!statuses(g.role).includes(o.status)) return why('status', g.role === 'captain' ? 'A captain sails a ship or is the reserve.' : 'They join as staff.');
  const renewal = g.contract?.crew === crew;
  if (renewal) {
    if (o.replaces !== null) return why('replaces', 'A renewal keeps them where they are.');
    if (wantsOut(g.morale)) return why('leaving', 'They have asked to leave and will not renew.');
    const seat = seatOf(c, gull, (id) => s.gulls[id].job);
    if (seat && g.role === 'captain' && seatRole(seat).status !== o.status) return why('status', 'A renewal keeps their place: change who sails in the race plan.');
  } else {
    if (g.contract && !closing(s, g.contract) && g.contract.breakClause === null) return why('contracted', 'They are under contract with no break clause: wait for its last 60 days.');
    if (belowThem(s, g, c)) return why('league', 'They will not drop more than one league while under contract.');
    if (o.replaces !== null) {
      const seat = seatOf(c, o.replaces, (id) => s.gulls[id].job);
      if (!seat || seat.kind === 'manager' || s.gulls[o.replaces].role !== g.role) return why('replaces', 'They can only take the post of one of your own of their role.');
      if (seatRole(seat).status !== o.status) return why('status', 'They take the post of the one they replace.');
    }
    if (!seatFor(s, c, o)) return why('noSeat', `There is no open post for a ${g.role}: name whom they replace.`);
  }
  const leaving = !renewal && o.replaces !== null ? dismissalCost(s, s.gulls[o.replaces]) : 0;
  if (!canSpend(c, o.fee + breakCost(s, g, crew) + leaving)) return why('coin', 'The elder will not let the coin fall that low.');
  return null;
}

/** Whether a crew may make an offer to a gull today (the player's screens and the rivals both ask). */
export function offerCheck(s: CareerState, crew: number, gull: number, o: Offer): Check {
  const shape = shapeCheck(o);
  if (shape) return shape;
  if (!whole(gull, 0, s.gulls.length - 1)) return why('who', 'No such gull.');
  const g = s.gulls[gull];
  if (s.day < g.silentUntil) return why('silent', `They will not talk to anyone until day ${g.silentUntil}.`);
  const talk = s.talks.find((t) => t.crew === crew && t.gull === gull);
  if (talk && talk.counter === null) return why('waiting', `They answer on day ${talk.answer}.`);
  return signableCheck(s, crew, gull, o);
}

/** The day a gull answers an offer made today: an approach to another crew's gull waits longer, so their crew may
 *  answer it with a renewal. */
export const answerDay = (s: CareerState, crew: number, gull: number): number => {
  const c = s.gulls[gull].contract;
  return s.day + (c && c.crew !== crew ? M.approachDays : M.answerDays);
};

/** A state with an offer made (checked first): a talk opened, its answer scheduled; a scout's report within its
 *  window may lend Persuasion; the crew a gull is approached from is told. A countered talk is replaced. */
export function offered(s: CareerState, crew: number, gull: number, offer: Offer, roll: Dice): CareerState {
  let out = endTalk(s, crew, gull);
  const g = out.gulls[gull];
  const known = g.known[crew];
  let patience = g.patience, scout: number | null = null;
  if (known && known.by !== null && !known.used) {
    const by = out.gulls[known.by];
    const persuasion = by.role === 'scout' ? effective(by as GullOf<'scout'>, null).persuasion : 0;
    if (persuades(persuasion, known.day, out.day, roll.roll('persuade'))) {
      patience = Math.min(M.patienceMost, patience + 1);
      scout = known.by;
    }
  }
  const settled = g.contract?.crew === crew && closing(out, g.contract) ? true : g.silenced;
  const gulls = [...out.gulls];
  gulls[gull] = { ...g, patience, silenced: settled, known: known ? { ...g.known, [crew]: { ...known, used: true } } : g.known };
  const day = answerDay(out, crew, gull);
  const talk: Talk = { id: out.ids.talk, crew, gull, offer, made: out.day, answer: day, counter: null, scout };
  out = { ...out, gulls, talks: [...out.talks, talk], ids: { ...out.ids, talk: talk.id + 1 } };
  out = schedule(out, day, { kind: 'answer', talk: talk.id });
  const theirs = g.contract;
  if (theirs && theirs.crew !== crew) {
    out = post(out, { crew: theirs.crew, category: 'market', sender: s.crews[crew].staff.manager, kind: 'approached',
      slots: { gull, crew, day }, links: [{ to: 'gull', id: gull }, { to: 'crew', id: crew }] });
  }
  return out;
}

/** A state with a crew's talk with a gull ended (withdrawn or replaced), its events off the queue. */
export function endTalk(s: CareerState, crew: number, gull: number): CareerState {
  const t = s.talks.find((x) => x.crew === crew && x.gull === gull);
  if (!t) return s;
  const out = unscheduled(s, (e) => (e.kind === 'answer' || e.kind === 'lapse') && e.talk === t.id);
  return { ...out, talks: out.talks.filter((x) => x.id !== t.id) };
}

/** Whether a rival meets a gull's counter: payable within its manager's Finance, at most the ask × counterMost. */
export function meetsCounter(s: CareerState, t: Talk, counter: Offer): boolean {
  const c = s.crews[t.crew];
  const manager = c.staff.manager === null ? null : s.gulls[c.staff.manager];
  if (!manager || manager.role !== 'manager') return false;
  const g = s.gulls[t.gull];
  const ask = askOf(s, g, c).wage;
  const stats = effective(manager as GullOf<'manager'>, null);
  const room = commitment(stats.finance, c.coin, c.debtFloor);
  const cost = counter.fee + breakCost(s, g, t.crew);
  const most = ask * TUNING.rivals.counterMost * (bidShare(stats.negotiation) / bidShare(0));
  return counter.wage <= most && cost <= room && signableCheck(s, t.crew, t.gull, counter) === null;
}

/** Mail to the player of an answer to their offer. */
const told = (s: CareerState, t: Talk, kind: string): CareerState =>
  post(s, { crew: t.crew, category: 'market', sender: null, kind, slots: { gull: t.gull, talk: t.id }, links: [{ to: 'gull', id: t.gull }] });

/** A gull answers every offer due today at once (the others' events then find their talk answered, and do nothing): patience paid for each lowball (at none, silence for 30 days and
 *  every offer refused); of the offers they would accept, the highest score is signed and the rest refused; with none
 *  to accept, each offer from 0.85 is countered and the rest refused. A rival meets a counter at once if worth it. */
export function hear(s: CareerState, e: Extract<Event, { kind: 'answer' }>): CareerState {
  const first = s.talks.find((t) => t.id === e.talk);
  if (!first || first.counter !== null) return s;
  const due = s.talks.filter((t) => t.gull === first.gull && t.counter === null && t.answer === first.answer);
  const ids = new Set(due.map((t) => t.id));
  let out = s;
  const gull = first.gull;
  let g = out.gulls[gull];
  for (const t of due) if (lowball(out, g, out.crews[t.crew], t.offer)) g = { ...g, patience: g.patience - 1 };
  const silent = g.patience <= 0;
  if (silent) g = { ...g, patience: TUNING.patience, silentUntil: out.day + M.silentDays };
  const gulls = [...out.gulls];
  gulls[gull] = g;
  out = { ...out, gulls, talks: out.talks.filter((t) => !ids.has(t.id)) };
  if (silent) return due.reduce((acc, t) => told(acc, t, 'silent'), out);
  const valid = due.filter((t) => signableCheck(out, t.crew, gull, t.offer) === null);
  const answers = valid.map((t) => ({ t, a: answer(out, g, out.crews[t.crew], t.offer), sc: score(out, g, out.crews[t.crew], t.offer) }));
  const yes = answers.filter((x) => x.a.kind === 'accept').sort((a, b) => b.sc - a.sc || a.t.id - b.t.id)[0];
  if (yes) {
    out = signed(out, { crew: yes.t.crew, gull, offer: yes.t.offer });
    out = told(out, yes.t, 'accepted');
    return due.filter((t) => t !== yes.t).reduce((acc, t) => told(acc, t, 'signedElsewhere'), out);
  }
  // rivals first: one that meets its counter signs the gull, and the rest are told they signed elsewhere
  const order = [...due].sort((a, b) => Number(out.crews[a.crew].player) - Number(out.crews[b.crew].player) || a.id - b.id);
  for (const [i, t] of order.entries()) {
    const x = answers.find((y) => y.t === t);
    if (!x || x.a.kind !== 'counter') {
      out = told(out, t, x ? 'refused' : 'lapsedPost');
      continue;
    }
    const counter = x.a.offer;
    if (!out.crews[t.crew].player && meetsCounter(out, t, counter)) {
      out = signed(out, { crew: t.crew, gull, offer: counter });
      return order.slice(i + 1).reduce((acc, u) => told(acc, u, 'signedElsewhere'), out);
    }
    out = { ...out, talks: [...out.talks, { ...t, counter }] };
    out = schedule(out, out.day + M.counterDays, { kind: 'lapse', talk: t.id });
    out = told(out, t, 'counter');
  }
  return out;
}

/** A counter not taken lapses. */
export function lapse(s: CareerState, e: Extract<Event, { kind: 'lapse' }>): CareerState {
  const t = s.talks.find((x) => x.id === e.talk);
  if (!t) return s;
  return told({ ...s, talks: s.talks.filter((x) => x.id !== t.id) }, t, 'counterLapsed');
}

/** The last days of this season's contracts open: the player is told of each of theirs. */
export function closingOpens(s: CareerState, e: Extract<Event, { kind: 'closing' }>): CareerState {
  const me = mine(s);
  if (me === null) return s;
  let out = s;
  for (const g of s.gulls) {
    if (g.contract?.crew !== me || g.contract.ends !== e.season || g.player) continue;
    out = post(out, { crew: me, category: 'market', sender: null, kind: 'contractClosing', slots: { gull: g.id }, links: [{ to: 'gull', id: g.id }] });
  }
  return out;
}

/** Those whose contracts end this season and who have been offered no renewal by now lose morale, once. */
export function silenceFalls(s: CareerState, e: Extract<Event, { kind: 'silence' }>): CareerState {
  const gulls = s.gulls.map((g) => (g.contract && g.contract.ends === e.season && !g.player && g.role !== 'elder' && !g.silenced && g.retired === null
    ? { ...g, morale: moraleIn(g.morale + silenceMove()), silenced: true } : g));
  return { ...s, gulls };
}

/** The player's crew, or the refusal. */
function myCrew(s: CareerState): { crew: number } | { no: NonNullable<Check> } {
  if (!s.player) return { no: why('unfounded', 'Found a crew first.') };
  const me = mine(s);
  return me === null ? { no: why('sacked', 'You have no crew: take one of the posts offered.') } : { crew: me };
}

/** Whether the player may dismiss a gull. */
export function dismissCheck(s: CareerState, gull: number): Check {
  const m = myCrew(s);
  if ('no' in m) return m.no;
  if (!whole(gull, 0, s.gulls.length - 1)) return why('who', 'No such gull.');
  const g = s.gulls[gull];
  if (g.contract?.crew !== m.crew || g.player || g.role === 'elder' || g.role === 'manager') return why('notYours', 'You can dismiss only your own staff.');
  if (s.race?.started) return why('racing', 'The race is under way.');
  if (!canSpend(s.crews[m.crew], dismissalCost(s, g))) return why('coin', 'The elder will not let the coin fall that low.');
  return null;
}

export const HIRING: Handlers = {
  OfferContract: (s, c, roll) => {
    const m = myCrew(s);
    if ('no' in m) return refuse(m.no.code, m.no.sentence);
    const no = offerCheck(s, m.crew, c.gull, c.offer);
    return no ? refuse(no.code, no.sentence) : accept(offered(s, m.crew, c.gull, c.offer, roll));
  },
  AcceptCounter: (s, c) => {
    const m = myCrew(s);
    if ('no' in m) return refuse(m.no.code, m.no.sentence);
    const t = s.talks.find((x) => x.crew === m.crew && x.gull === c.gull);
    if (!t || t.counter === null) return refuse('noCounter', 'They have made you no counter.');
    const no = signableCheck(s, m.crew, c.gull, t.counter);
    if (no) return refuse(no.code, no.sentence);
    return accept(signed(endTalk(s, m.crew, c.gull), { crew: m.crew, gull: c.gull, offer: t.counter }));
  },
  WithdrawOffer: (s, c) => {
    const m = myCrew(s);
    if ('no' in m) return refuse(m.no.code, m.no.sentence);
    if (!s.talks.some((x) => x.crew === m.crew && x.gull === c.gull)) return refuse('noTalk', 'You are not talking with them.');
    return accept(endTalk(s, m.crew, c.gull));
  },
  Dismiss: (s, c) => {
    const no = dismissCheck(s, c.gull);
    if (no) return refuse(no.code, no.sentence);
    const g = s.gulls[c.gull];
    const crew = g.contract!.crew;
    return accept(released(paid(s, crew, dismissalCost(s, g), { kind: 'dismissal', what: `${g.given} ${g.family} dismissed` }), c.gull));
  },
};
