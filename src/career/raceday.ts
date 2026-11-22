// Race day's commands: the race plan (SetPlan), the player's race begun
// (RaceStarted), a championship's result (RecordRace; the round closes when all
// three are in), and a forfeit. And race day itself: every team's part
// improvement is brought to the day, so the cards read today's parts.

import { CALLS, TEAM, type RaceResult } from '../race.ts';
import { SHIPS, type Plan } from '../office/command.ts';
import type { EventHandler } from './advance.ts';
import {
  accept,
  refuse,
  refused,
  whole,
  why,
  type Check,
  type Handlers,
} from './command.ts';
import type { Dice } from './dice.ts';
import { drawn } from './dilemmas.ts';
import { flagged, today } from './flags.ts';
import { improvementsTo } from './improvement.ts';
import { grid, lineups, maySail } from './lineup.ts';
import { fitCheck, fitted } from './parts.ts';
import { mine, post } from './post.ts';
import { roundClosed } from './round.ts';
import { teamOf, withTeam, type CareerState } from './state.ts';

/** Race day: the round is due, every team's part improvement brought to today. Advance stops (career/advance.ts). */
export const raceDay: EventHandler<'race'> = (s, e) => ({
  ...improvementsTo(s),
  round: e.round,
  race: {
    round: e.round,
    started: false,
    results: s.championships.map(() => null),
  },
});

const NO_TEAM = why(
  'sacked',
  'You have no team: take one of the posts offered.'
);

/** Whether a person is one the player's team may put aboard: a driver of theirs, or a free one for the race, fit. */
function driverCheck(s: CareerState, team: number, person: unknown): Check {
  if (!whole(person, 0, s.people.length - 1))
    return why('driver', 'No such driver.');
  const g = s.people[person];
  if (
    !g ||
    g.role !== 'driver' ||
    g.player ||
    g.retired !== null ||
    (g.contract !== null && g.contract.team !== team)
  )
    return why(
      'driver',
      'Only your own drivers, or a free one for the race, may sail your ships.'
    );
  return maySail(s, team, person)
    ? null
    : why('unfit', 'That driver is unfit to sail.');
}

/**
 * Whether a race plan is one the player may set: a driver for each ship after
 * their own, each named once, who may sail (theirs or a free agent's for the
 * race, fit); each part theirs and fittable, named once; a call; an objective
 * a sponsor slot, within that sponsor's list.
 */
function planCheck(s: CareerState, team: number, p: Plan): Check {
  if (s.race?.started) return why('racing', 'The race is under way.');
  if (!p || typeof p !== 'object') return why('plan', 'That is no race plan.');
  const c = teamOf(s, team);
  if (
    !Array.isArray(p.drivers) ||
    p.drivers.length !== TEAM - 1 ||
    new Set(p.drivers).size !== p.drivers.length
  )
    return why('driver', 'Name a driver for each ship after your own, once.');
  for (const d of p.drivers) {
    const no = driverCheck(s, team, d);
    if (no) return no;
  }
  if (
    !Array.isArray(p.parts) ||
    new Set(p.parts.map((x) => x?.part)).size !== p.parts.length
  )
    return why('parts', 'Name each part once.');
  for (const x of p.parts) {
    const q = x ? c.parts.find((y) => y.id === x.part) : undefined;
    if (!q || !whole(x.ship, 0, SHIPS.length - 1))
      return why('parts', "That part is not your team's.");
    const no = q.ship === x.ship ? null : fitCheck(s, team, x.part, x.ship);
    if (no) return no;
  }
  if (!CALLS.includes(p.call)) return why('call', 'No such call.');
  if (!Array.isArray(p.objectives) || p.objectives.length > c.sponsors.length)
    return why('objectives', 'One objective a sponsor slot.');
  for (const [slot, o] of p.objectives.entries()) {
    const sponsor = c.sponsors[slot];
    if (o === null) continue;
    if (!sponsor || !whole(o, 0, sponsor.objectives.length - 1))
      return why('objectives', 'That sponsor has no such objective.');
  }
  return null;
}

/** A state with the plan set: its parts fitted, the plan kept (checked first). */
function planned(s: CareerState, team: number, p: Plan): CareerState {
  let out = s;
  for (const x of p.parts)
    if (teamOf(out, team).parts.find((q) => q.id === x.part)?.ship !== x.ship)
      out = fitted(out, team, x.part, x.ship);
  return withTeam(out, {
    ...teamOf(out, team),
    plan: {
      drivers: [...p.drivers],
      parts: [...p.parts],
      call: p.call,
      objectives: [...p.objectives],
    },
  });
}

/**
 * Whether a result is one the career may record now: today's round, a
 * championship not yet recorded (the player's only once their race began), its
 * order every ship of the card once, every id it names on the card.
 */
function recordCheck(s: CareerState, r: RaceResult): Check {
  if (s.race === null) return why('noRace', 'No race is due.');
  if (
    !r ||
    typeof r !== 'object' ||
    !whole(r.tier, 0, s.championships.length - 1)
  )
    return why('tier', 'No such championship.');
  if (r.round !== s.race.round)
    return why('round', "That is not today's race.");
  if (s.race.results[r.tier] !== null)
    return why('recorded', 'That race is recorded already.');
  const me = mine(s);
  if (me !== null && s.teams[me]?.tier === r.tier && !s.race.started)
    return why('notStarted', 'Your race has not begun.');
  const n = grid(s, r.tier).length * TEAM;
  const id = (x: unknown) => whole(x, 0, n - 1);
  if (
    !Array.isArray(r.order) ||
    r.order.length !== n ||
    new Set(r.order).size !== n ||
    !r.order.every(id)
  )
    return why('order', 'The order must name every ship once.');
  const lists = [r.sinkings, r.seaHeld, r.faults, r.pits, r.hits];
  if (
    !lists.every((l) => Array.isArray(l) && l.every((x) => x && id(x.id))) ||
    !r.sinkings.every((k) => k.by === null || id(k.by)) ||
    typeof r.hash !== 'string'
  )
    return why('result', 'The result names ships not on the card.');
  return null;
}

/** A state with a result recorded; the round closed once all three are in, and the dilemmas drawn. */
function recorded(s: CareerState, r: RaceResult, roll: Dice): CareerState {
  if (!s.race) return s;
  const results = s.race.results.map((x, i) => (i === r.tier ? r : x));
  const out: CareerState = { ...s, race: { ...s.race, results } };
  return results.every((x) => x !== null)
    ? drawn(roundClosed(out, roll), roll)
    : out;
}

export const RACING: Handlers = {
  SetPlan: (s, c) => {
    const me = mine(s);
    if (me === null) return refused(NO_TEAM);
    const no = planCheck(s, me, c.plan);
    return no ? refused(no) : accept(planned(s, me, c.plan));
  },
  RaceStarted: (s, c) => {
    const me = mine(s);
    if (me === null) return refused(NO_TEAM);
    if (s.race === null) return refuse('noRace', 'No race is due.');
    if (c.round !== s.race.round)
      return refuse('round', "That is not today's race.");
    if (s.race.started)
      return refuse('started', 'Your race has begun already.');
    if (lineups(s)[me]?.ships.some((a) => a.forfeit))
      return refuse(
        'noDriver',
        'A ship of yours has no driver fit to sail her, and none is free to stand in.'
      );
    return accept({ ...s, race: { ...s.race, started: true } });
  },
  RecordRace: (s, c, roll) => {
    const no = recordCheck(s, c.result);
    return no ? refused(no) : accept(recorded(s, c.result, roll));
  },
  Forfeit: (s, c) => {
    const me = mine(s);
    if (me === null) return refused(NO_TEAM);
    if (s.race === null || c.round !== s.race.round)
      return refuse('round', "That is not today's race.");
    if (!s.race.started)
      return refuse('notStarted', 'Your race has not begun.');
    if (s.race.results[teamOf(s, me).tier] !== null)
      return refuse('recorded', 'That race is recorded already.');
    if (today(s, `forfeit:${me}`))
      return refuse('forfeited', 'Your team has forfeited this race already.');
    const out = flagged(s, `forfeit:${me}`, s.day);
    return accept(
      post(out, {
        team: me,
        category: 'tier',
        sender: null,
        kind: 'forfeit',
        slots: {},
        links: [],
      })
    );
  },
};
