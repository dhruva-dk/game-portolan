// Race day's commands (Phase B section 13): the race plan (SetPlan), the player's race begun (RaceStarted), a league's
// result (RecordRace; the round closes when all three are in), and a forfeit (D27). And race day itself: the yards are
// brought to the day, so the cards read today's parts.

import type { RaceResult } from '../race.ts';
import type { Plan } from '../office.ts';
import type { EventHandler } from './advance.ts';
import { accept, refuse, whole, why, type Check, type Handlers } from './command.ts';
import { drawn } from './dilemmas.ts';
import { flagged } from './flags.ts';
import { lineups, maySail, sides, STANCES } from './lineup.ts';
import { fitCheck, fitted } from './parts.ts';
import { mine, post } from './post.ts';
import { roundClosed } from './round.ts';
import { JOBS } from './service.ts';
import type { CareerState } from './state.ts';
import { yardsTo } from './yard.ts';

const CALLS = ['withMe', 'attack', 'hold', 'free'];

/** Race day: the round is due, every yard brought to today. Advance stops (career/advance.ts). */
export const raceDay: EventHandler<'race'> = (s, e) => ({ ...yardsTo(s), round: e.round, race: { round: e.round, started: false, results: s.leagues.map(() => null) } });

/** The player's crew, or why there is none. */
function myCrew(s: CareerState): number | Check {
  const me = mine(s);
  return me === null ? why('sacked', 'You have no crew: take one of the posts offered.') : me;
}

/** Whether a race plan is one the player may set: ship two's captain may sail (theirs or a free agent's for the race,
 *  fit); each part theirs and fittable, named once; a stance and a call; the flight's order every job once; each job a
 *  flight gull of theirs, each once; an objective a patron slot, within that patron's list. */
export function planCheck(s: CareerState, crew: number, p: Plan): Check {
  if (s.race?.started) return why('racing', 'The race is under way.');
  if (!p || typeof p !== 'object') return why('plan', 'That is no race plan.');
  const c = s.crews[crew];
  if (!whole(p.captain, 0, s.gulls.length - 1)) return why('captain', 'No such captain.');
  const g = s.gulls[p.captain];
  if (g.role !== 'captain' || g.player || g.retired !== null || (g.contract !== null && g.contract.crew !== crew)) return why('captain', 'Only your own captains, or a free one for the race, may sail ship two.');
  if (!maySail(s, crew, p.captain)) return why('unfit', 'That captain is unfit to sail.');
  if (!Array.isArray(p.parts) || new Set(p.parts.map((x) => x?.part)).size !== p.parts.length) return why('parts', 'Name each part once.');
  for (const x of p.parts) {
    if (!x || (x.ship !== 0 && x.ship !== 1) || !c.parts.some((q) => q.id === x.part)) return why('parts', 'That part is not your crew\'s.');
    const q = c.parts.find((y) => y.id === x.part)!;
    if (q.ship !== x.ship && fitCheck(s, crew, x.part, x.ship) !== null) return fitCheck(s, crew, x.part, x.ship);
  }
  if (!STANCES.includes(p.stance)) return why('stance', 'No such stance.');
  if (!CALLS.includes(p.call)) return why('call', 'No such call.');
  if (!Array.isArray(p.order) || p.order.length !== JOBS.length || !JOBS.every((j) => p.order.includes(j))) return why('order', 'The flight\'s order names every job once.');
  if (!p.jobs || typeof p.jobs !== 'object') return why('jobs', 'Each job needs a flight gull.');
  const workers = JOBS.map((j) => p.jobs[j]);
  if (!workers.every((w) => c.staff.flight.includes(w)) || new Set(workers).size !== workers.length) return why('jobs', 'Each job needs its own flight gull of yours.');
  if (!Array.isArray(p.objectives) || p.objectives.length > c.patrons.length) return why('objectives', 'One objective a patron slot.');
  for (const [slot, o] of p.objectives.entries()) {
    const patron = c.patrons[slot];
    if (o === null) continue;
    if (!patron || !whole(o, 0, patron.objectives.length - 1)) return why('objectives', 'That patron has no such objective.');
  }
  return null;
}

/** A state with the plan set: its parts fitted, its jobs worked, the plan kept (checked first). */
export function planned(s: CareerState, crew: number, p: Plan): CareerState {
  let out = s;
  for (const x of p.parts) if (out.crews[crew].parts.find((q) => q.id === x.part)!.ship !== x.ship) out = fitted(out, crew, x.part, x.ship);
  const gulls = [...out.gulls];
  for (const j of JOBS) gulls[p.jobs[j]] = { ...gulls[p.jobs[j]], job: j };
  const crews = [...out.crews];
  crews[crew] = { ...out.crews[crew], plan: { ...p, parts: [...p.parts], order: [...p.order], jobs: { ...p.jobs }, objectives: [...p.objectives] } };
  return { ...out, gulls, crews };
}

/** Whether a result is one the career may record now: today's round, a league not yet recorded (the player's only once
 *  their race began), its order every ship of the card once, every id it names on the card. */
export function recordCheck(s: CareerState, r: RaceResult): Check {
  if (s.race === null) return why('noRace', 'No race is due.');
  if (!r || typeof r !== 'object' || !whole(r.league, 0, s.leagues.length - 1)) return why('league', 'No such league.');
  if (r.round !== s.race.round) return why('round', 'That is not today\'s race.');
  if (s.race.results[r.league] !== null) return why('recorded', 'That race is recorded already.');
  const me = mine(s);
  if (me !== null && s.crews[me].league === r.league && !s.race.started) return why('notStarted', 'Your race has not begun.');
  const n = sides(s, r.league).length * 2;
  const id = (x: unknown) => whole(x, 0, n - 1);
  if (!Array.isArray(r.order) || r.order.length !== n || new Set(r.order).size !== n || !r.order.every(id)) return why('order', 'The order must name every ship once.');
  const lists = [r.sinkings, r.seaHeld, r.faults, r.stops, r.hits];
  if (!lists.every((l) => Array.isArray(l) && l.every((x) => x && id(x.id)))) return why('result', 'The result names ships not on the card.');
  if (!r.sinkings.every((k) => k.by === null || id(k.by))) return why('result', 'The result names ships not on the card.');
  return null;
}

/** A state with a result recorded; the round closed once all three are in, and the dilemmas drawn. */
function recorded(s: CareerState, r: RaceResult, roll: Parameters<typeof roundClosed>[1]): CareerState {
  const results = s.race!.results.map((x, i) => (i === r.league ? r : x));
  const out: CareerState = { ...s, race: { ...s.race!, results } };
  return results.every((x) => x !== null) ? drawn(roundClosed(out, roll), roll) : out;
}

export const RACING: Handlers = {
  SetPlan: (s, c) => {
    const me = myCrew(s);
    if (typeof me !== 'number') return refuse(me!.code, me!.sentence);
    const no = planCheck(s, me, c.plan);
    return no ? refuse(no.code, no.sentence) : accept(planned(s, me, c.plan));
  },
  RaceStarted: (s, c) => {
    const me = myCrew(s);
    if (typeof me !== 'number') return refuse(me!.code, me!.sentence);
    if (s.race === null) return refuse('noRace', 'No race is due.');
    if (c.round !== s.race.round) return refuse('round', 'That is not today\'s race.');
    if (s.race.started) return refuse('started', 'Your race has begun already.');
    if (lineups(s)[me].ships[1].forfeit) return refuse('shipTwo', 'No captain is fit to sail ship two, and none is free to stand in.');
    return accept({ ...s, race: { ...s.race, started: true } });
  },
  RecordRace: (s, c, roll) => {
    const no = recordCheck(s, c.result);
    return no ? refuse(no.code, no.sentence) : accept(recorded(s, c.result, roll));
  },
  Forfeit: (s, c) => {
    const me = myCrew(s);
    if (typeof me !== 'number') return refuse(me!.code, me!.sentence);
    if (s.race === null || c.round !== s.race.round) return refuse('round', 'That is not today\'s race.');
    if (!s.race.started) return refuse('notStarted', 'Your race has not begun.');
    if (s.race.results[s.crews[me].league] !== null) return refuse('recorded', 'That race is recorded already.');
    const out = flagged(s, `forfeit:${me}`, s.day);
    return accept(post(out, { crew: me, category: 'league', sender: null, kind: 'forfeit', slots: {}, links: [] }));
  },
};
