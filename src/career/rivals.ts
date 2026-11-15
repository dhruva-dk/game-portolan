// Rival managers (Phase B section 6): a rival crew runs every rule the player runs, decided by its manager at its
// weekly review (each crew every 7 days, staggered by crew id) and on its own events (a scout's report). Each row of
// the section's table is a decision read from the manager's stats and personality; the personality orders the rows
// and sets how much of its Finance commitment the crew spends. Every offer and scouting goes through the player's own
// checks (hiring.ts offerCheck, scouting.ts scoutCheck) and the same `offered` and `sent`.
//
// The hiring rows (fill, replace, renew, poach, bid, scout) are career/bidding.ts's. The rows of parts, buildings,
// patrons, suppliers and the Admiralty's vote (yard, design, build, patrons, suppliers, vote) are career/works.ts's;
// a rival yet to vote when the count comes votes by its measure then (admiralty.ts counted). The race plan
// (section 13) is decided on its own event with the same Mind.

import type { Personality } from '../office.ts';
import { fill, poach, renew, replace, scout } from './bidding.ts';
import type { Dice } from './dice.ts';
import { effective } from './effective.ts';
import { hireManager } from './elders.ts';
import { commitment } from './leadership.ts';
import { roomOf } from './money.ts';
import { schedule, type Event } from './queue.ts';
import type { GullOf, StatsOf } from './roles.ts';
import { reported } from './scouting.ts';
import type { CareerState } from './state.ts';
import { TUNING } from './tuning.ts';
import { build, design, patrons, suppliers, vote, yard } from './works.ts';

const R = TUNING.rivals;

/** The rows of section 6's table a review runs, in an order set by personality. */
export type Row = keyof (typeof R.personalities)[Personality]['order'];

/** What a rival manager brings to a decision: their crew, their effective stats, their personality, and the Coin
 *  still to commit this review (each row's spending takes from it). */
export interface Mind {
  crew: number;
  manager: number;
  stats: StatsOf<'manager'>;
  personality: Personality;
  room: number;
  known: () => readonly number[];                    // the gulls of other crews or none the crew knows, read once a review when asked
}

/** A row: the state after the decision, and the Mind with what it spent taken off. */
export type Decide = (s: CareerState, mind: Mind, roll: Dice) => { state: CareerState; mind: Mind };

/** The rows a review runs. */
export const ROWS: Readonly<Partial<Record<Row, Decide>>> = { fill, replace, renew, poach, scout, yard, design, build, patrons, suppliers, vote };

/** A crew's manager's mind, or null if the post is open (the elder hires first) or the crew is the player's. */
export function mindOf(s: CareerState, crew: number): Mind | null {
  const c = s.crews[crew];
  if (c.player || c.staff.manager === null) return null;
  const g = s.gulls[c.staff.manager];
  if (g.role !== 'manager' || g.player) return null;
  const stats = effective(g as GullOf<'manager'>, null);
  const personality = g.personality ?? 'steady';
  const room = Math.min(roomOf(s, crew, stats.finance), commitment(stats.finance, c.coin, c.debtFloor)) * R.personalities[personality].spend;
  const key = String(crew);
  let seen: readonly number[] | null = null;
  const known = (): readonly number[] =>
    (seen ??= s.gulls.filter((x) => x.known[key] !== undefined && x.contract?.crew !== crew && x.retired === null && !x.player).map((x) => x.id));
  return { crew, manager: g.id, stats, personality, room, known };
}

/** A personality's rows, first acted on first (equal weights in the table's order). */
export function rowsFor(personality: Personality): Row[] {
  const order: Readonly<Partial<Record<Row, number>>> = R.personalities[personality].order;
  return (Object.keys(order) as Row[]).sort((a, b) => (order[b] ?? 0) - (order[a] ?? 0));
}

/** A state with a crew's rows run in its manager's order (those of `only`, if given). */
export function decide(s: CareerState, crew: number, roll: Dice, only: readonly Row[] | null): CareerState {
  let mind = mindOf(s, crew);
  if (!mind) return s;
  let out = s;
  for (const row of rowsFor(mind.personality)) {
    const act = ROWS[row];
    if (!act || (only && !only.includes(row))) continue;
    const r = act(out, mind, roll);
    out = r.state;
    mind = r.mind;
  }
  return out;
}

/** A crew's weekly review: the next scheduled; an open manager's post filled by the elder; then the manager's rows.
 *  The player's crew reviews nothing (the player decides), but keeps its turn for when it is a rival's again. */
function review(s: CareerState, e: Extract<Event, { kind: 'review' }>, roll: Dice): CareerState {
  let out = schedule(s, s.day + R.review, { kind: 'review', crew: e.crew });
  const c = out.crews[e.crew];
  if (c.player) return out;
  if (c.staff.manager === null) out = hireManager(out, e.crew, roll, true);
  return decide(out, e.crew, roll, null);
}

/** A scout reports to a rival: its manager acts on what is now known (fill and replace). */
function report(s: CareerState, e: Extract<Event, { kind: 'report' }>, roll: Dice): CareerState {
  const out = reported(s, e);
  return out.crews[e.crew].player ? out : decide(out, e.crew, roll, ['fill', 'replace', 'poach']);
}

/** The rivals' event handlers. */
export const RIVAL_EVENTS = { review, report };
