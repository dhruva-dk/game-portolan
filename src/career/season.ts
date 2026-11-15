// The season's end and start (Phase B section 13). At the end, in order: prize money; the crews' season reputations
// and the player's mail of their place; retirements; new gulls; trusted managers renewed; contracts expire; the rules
// turn; the elders' verdicts, sackings and hirings (on the season's standings, before the leagues change); promotion
// and relegation (four each way); knowledge marked; growth; traits; suppliers cleared; next season's parts (under the
// new league's rules); then the new season: its calendar, the elders' money and targets, its events. On the new
// season's first day the player is mailed its planets and the suppliers' choice.

import type { EventHandler } from './advance.ts';
import { newsworthy, retirements, seasonGrowth, traitTurns } from './ageing.ts';
import { rulesTurned } from './admiralty.ts';
import { makeCalendar, nextStart, scheduleSeason } from './calendar.ts';
import { expired, scoutingStopped, talksEnded, youngGulls } from './contracts.ts';
import type { Dice } from './dice.ts';
import { managersRenewed, seasonStart, standingOf, verdicts } from './elders.ts';
import { knowledgeTurned } from './knowledge.ts';
import { prizeAt, prizes } from './money.ts';
import { carried } from './parts.ts';
import { mine, post } from './post.ts';
import { reputationAtEnd } from './reputation.ts';
import type { CareerState, League, Standing } from './state.ts';
import { suppliersCleared } from './suppliers.ts';
import { TUNING } from './tuning.ts';

const SWAP = TUNING.race.swap;

/** Each league's crews in final order (1 first). */
export const finalOrder = (s: CareerState): number[][] =>
  s.leagues.map((l) => [...l.crews].sort((a, b) => standingOf(s, a) - standingOf(s, b)));

/** Where each crew goes: −1 up a league, +1 down, 0 stays. The bottom four of each league but the last go down, the
 *  top four of each but the first go up. */
export function movesOf(order: readonly (readonly number[])[]): Map<number, number> {
  const moves = new Map<number, number>();
  order.forEach((crews, league) => {
    if (league > 0) for (const c of crews.slice(0, SWAP)) moves.set(c, -1);
    if (league < order.length - 1) for (const c of crews.slice(-SWAP)) moves.set(c, 1);
  });
  return moves;
}

const fresh = (crew: number): Standing => ({ crew, points: 0, wins: 0, podiums: 0, sinkings: 0 });

/** A state with the leagues remade by the moves: crews moved, every standing reset. */
function promoted(s: CareerState, moves: Map<number, number>): CareerState {
  const crews = s.crews.map((c) => ({ ...c, league: c.league + (moves.get(c.id) ?? 0) }));
  const leagues = s.leagues.map((l): League => {
    const ids = crews.filter((c) => c.league === l.id).map((c) => c.id);
    return { ...l, crews: ids, standings: ids.map(fresh) };
  });
  return { ...s, crews, leagues };
}

/** The season's first part: money and reputation by the final standings, and the player told where they finished. */
function judged(s: CareerState, order: readonly (readonly number[])[], moves: Map<number, number>): CareerState {
  let out = prizes(s);
  for (const c of s.crews) {
    const move = moves.get(c.id) ?? 0;
    out = reputationAtEnd(out, c.id, order[c.league][0] === c.id, move < 0, move > 0);
  }
  const me = mine(out);
  if (me === null) return out;
  const league = s.crews[me].league, place = standingOf(s, me);
  return post(out, { crew: me, category: 'league', sender: null, kind: 'seasonEnded',
    slots: { league, place, prize: prizeAt(s, league, place), moved: -(moves.get(me) ?? 0) }, links: [{ to: 'screen', id: 'standings' }] });
}

/** The gulls' season: retirements (the player told of those worth news), new gulls, contracts ended. */
function turnover(s: CareerState, roll: Dice): CareerState {
  const r = retirements(s, roll);
  let out = r.state;
  for (const id of r.retired) out = scoutingStopped(talksEnded(out, id, null), id);
  for (const id of r.retired) if (newsworthy(s, s.gulls[id])) out = post(out, { crew: null, category: 'crew', sender: null, kind: 'retired', slots: { gull: id }, links: [{ to: 'gull', id }] });
  return expired(managersRenewed(youngGulls(out, roll)));
}

/** Traits turned, the player told of their own gulls' and the famous. */
function traitsTurned(s: CareerState, roll: Dice): CareerState {
  const t = traitTurns(s, roll);
  let out = t.state;
  for (const ch of t.changes) {
    if (!newsworthy(out, out.gulls[ch.gull])) continue;
    for (const trait of ch.gained) out = post(out, { crew: null, category: 'crew', sender: null, kind: 'traitGained', slots: { gull: ch.gull, trait }, links: [{ to: 'gull', id: ch.gull }] });
    for (const trait of ch.lost) out = post(out, { crew: null, category: 'crew', sender: null, kind: 'traitLost', slots: { gull: ch.gull, trait }, links: [{ to: 'gull', id: ch.gull }] });
  }
  return out;
}

/** The season's end. */
export const seasonEnded: EventHandler<'seasonEnd'> = (s, _e, roll) => {
  const order = finalOrder(s);
  const moves = movesOf(order);
  let out = judged(s, order, moves);
  out = rulesTurned(turnover(out, roll));
  out = verdicts(out, roll);
  out = promoted(out, moves);
  out = traitsTurned(seasonGrowth(knowledgeTurned(out)), roll);
  out = suppliersCleared(out);
  for (const c of out.crews) out = carried(out, c.id);
  const calendar = makeCalendar(s.season + 1, nextStart(s.calendar!.start), roll.roll('calendar'));
  out = seasonStart({ ...out, season: s.season + 1, round: 0, calendar });
  return scheduleSeason(out, calendar);
};

/** The season's first day: the player told of its planets and that the suppliers wait. */
export const seasonBegun: EventHandler<'seasonStart'> = (s) => {
  const cal = s.calendar;
  if (!cal || mine(s) === null) return s;
  const first = cal.rounds[0];
  const out = post(s, { crew: null, category: 'league', sender: null, kind: 'seasonPlanets', slots: { season: cal.season, planet: first.planet.name, firstDay: first.day },
    links: [{ to: 'screen', id: 'calendar' }] });
  return post(out, { crew: null, category: 'finance', sender: null, kind: 'supplierDue', slots: {}, links: [{ to: 'screen', id: 'suppliers' }] });
};
