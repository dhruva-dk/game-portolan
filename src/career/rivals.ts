// Rival managers (Phase B section 6): a rival team runs every rule the player runs, decided by its manager at its
// weekly review (each team every 7 days, staggered by team id) and on its own events (a scout's report). Each row of
// the section's table is a decision read from the manager's stats and personality; the personality orders the rows
// and sets how much of its Finance commitment the team spends. Every offer and scouting goes through the player's own
// checks (hiring.ts offerCheck, scouting.ts scoutCheck) and the same `offered` and `sent`.
//
// The hiring rows (fill, replace, renew, poach, bid, scout) are career/bidding.ts's. The rows of parts, buildings,
// sponsors, suppliers and the Admiralty's vote (improvement, design, build, sponsors, suppliers, vote) are career/works.ts's;
// a rival yet to vote when the count comes votes by its measure then (admiralty.ts counted). The race plan
// (section 13) is decided on its own event with the same Mind.

import type { Personality } from '../office.ts';
import { fill, poach, renew, replace, scout } from './bidding.ts';
import type { Dice } from './dice.ts';
import { effective } from './effective.ts';
import { hireManager } from './chairmen.ts';
import { knownTo } from './knowledge.ts';
import { commitment } from './leadership.ts';
import { roomOf } from './money.ts';
import { schedule, type Event } from './queue.ts';
import type { PersonOf, StatsOf } from './roles.ts';
import { reported } from './scouting.ts';
import type { CareerState } from './state.ts';
import { TUNING } from './tuning.ts';
import {
  build,
  design,
  sponsors,
  suppliers,
  vote,
  improvement,
} from './works.ts';

const R = TUNING.rivals;

/** The rows of section 6's table a review runs, in an order set by personality. */
export type Row = keyof (typeof R.personalities)[Personality]['order'];

/** What a rival manager brings to a decision: their team, their effective stats, their personality, and the Coin
 *  still to commit this review (each row's spending takes from it). */
export interface Mind {
  team: number;
  manager: number;
  stats: StatsOf<'manager'>;
  personality: Personality;
  room: number;
  known: () => readonly number[]; // the people of other teams or none the team knows, read once a review when asked
}

/** A row: the state after the decision, and the Mind with what it spent taken off. */
export type Decide = (
  s: CareerState,
  mind: Mind,
  roll: Dice
) => { state: CareerState; mind: Mind };

/** The rows a review runs. */
export const ROWS: Readonly<Partial<Record<Row, Decide>>> = {
  fill,
  replace,
  renew,
  poach,
  scout,
  improvement,
  design,
  build,
  sponsors,
  suppliers,
  vote,
};

/** A team's manager's mind, or null if the post is open (the chairman hires first) or the team is the player's. */
export function mindOf(s: CareerState, team: number): Mind | null {
  const c = s.teams[team];
  if (c.player || c.staff.manager === null) return null;
  const g = s.people[c.staff.manager];
  if (g.role !== 'manager' || g.player) return null;
  const stats = effective(g as PersonOf<'manager'>, null);
  const personality = g.personality ?? 'steady';
  const room =
    Math.min(
      roomOf(s, team, stats.finance),
      commitment(stats.finance, c.balance, c.debtFloor)
    ) * R.personalities[personality].spend;
  let seen: readonly number[] | null = null;
  const known = (): readonly number[] =>
    (seen ??= knownTo(s, team).filter((id) => {
      const x = s.people[id];
      return x.contract?.team !== team && x.retired === null && !x.player;
    }));
  return { team, manager: g.id, stats, personality, room, known };
}

/** A personality's rows, first acted on first (equal weights in the table's order). */
export function rowsFor(personality: Personality): Row[] {
  const order: Readonly<Partial<Record<Row, number>>> =
    R.personalities[personality].order;
  return (Object.keys(order) as Row[]).sort(
    (a, b) => (order[b] ?? 0) - (order[a] ?? 0)
  );
}

/** A state with a team's rows run in its manager's order (those of `only`, if given). */
export function decide(
  s: CareerState,
  team: number,
  roll: Dice,
  only: readonly Row[] | null
): CareerState {
  let mind = mindOf(s, team);
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

/** A team's weekly review: the next scheduled; an open manager's post filled by the chairman; then the manager's rows.
 *  The player's team reviews nothing (the player decides), but keeps its turn for when it is a rival's again. */
function review(
  s: CareerState,
  e: Extract<Event, { kind: 'review' }>,
  roll: Dice
): CareerState {
  let out = schedule(s, s.day + R.review, { kind: 'review', team: e.team });
  const c = out.teams[e.team];
  if (c.player) return out;
  if (c.staff.manager === null) out = hireManager(out, e.team, roll, true);
  return decide(out, e.team, roll, null);
}

/** A scout reports to a rival: its manager acts on what is now known (fill and replace). */
function report(
  s: CareerState,
  e: Extract<Event, { kind: 'report' }>,
  roll: Dice
): CareerState {
  const out = reported(s, e);
  return out.teams[e.team].player
    ? out
    : decide(out, e.team, roll, ['fill', 'replace', 'poach']);
}

/** The rivals' event handlers. */
export const RIVAL_EVENTS = { review, report };
