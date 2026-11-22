// The season's end and start (Phase B section 13). At the end, in order: prize money; the teams' season reputations
// and the player's mail of their place; retirements; new people; trusted managers renewed; contracts expire; the rules
// turn; the chairmen' verdicts, sackings and hirings (on the season's standings, before the championships change); promotion
// and relegation (four each way); knowledge marked; growth; traits; suppliers cleared; next season's parts (under the
// new tier's rules); then the new season: its calendar, the chairmen' money and targets, its events. On the new
// season's first day the player is mailed its planets and the suppliers' choice.

import { known } from './canon.ts';
import type { EventHandler } from './advance.ts';
import { newsworthy, retirements, seasonGrowth, traitTurns } from './ageing.ts';
import { rulesTurned } from './admiralty.ts';
import { makeCalendar, nextStart, scheduleSeason } from './calendar.ts';
import {
  expired,
  scoutingStopped,
  talksEnded,
  youngPeople,
} from './contracts.ts';
import type { Dice } from './dice.ts';
import { managersRenewed, seasonStart, verdicts } from './chairmen.ts';
import { standingOf } from './standings.ts';
import { knowledgeTurned } from './knowledge.ts';
import { prizeAt, prizes } from './money.ts';
import { carried } from './parts.ts';
import { mine, post } from './post.ts';
import { reputationAtEnd } from './reputation.ts';
import type { CareerState, Championship, Standing } from './state.ts';
import { suppliersCleared } from './suppliers.ts';
import { TUNING } from './tuning.ts';

const SWAP = TUNING.race.swap;

/** Each tier's teams in final order (1 first). */
const finalOrder = (s: CareerState): number[][] =>
  s.championships.map((l) =>
    [...l.teams].sort((a, b) => standingOf(s, a) - standingOf(s, b))
  );

/** Where each team goes: −1 up a tier, +1 down, 0 stays. The bottom four of each tier but the last go down, the
 *  top four of each but the first go up. */
export function movesOf(
  order: readonly (readonly number[])[]
): Map<number, number> {
  const moves = new Map<number, number>();
  order.forEach((teams, tier) => {
    if (tier > 0) for (const c of teams.slice(0, SWAP)) moves.set(c, -1);
    if (tier < order.length - 1)
      for (const c of teams.slice(-SWAP)) moves.set(c, 1);
  });
  return moves;
}

const fresh = (team: number): Standing => ({
  team,
  points: 0,
  wins: 0,
  podiums: 0,
  sinkings: 0,
});

/** A state with the championships remade by the moves: teams moved, every standing reset. */
function promoted(s: CareerState, moves: Map<number, number>): CareerState {
  const teams = s.teams.map((c) => ({
    ...c,
    tier: c.tier + (moves.get(c.id) ?? 0),
  }));
  const championships = s.championships.map((l): Championship => {
    const ids = teams.filter((c) => c.tier === l.id).map((c) => c.id);
    return { ...l, teams: ids, standings: ids.map(fresh), drivers: [] };
  });
  return { ...s, teams, championships };
}

/** The season's first part: money and reputation by the final standings, and the player told where they finished. */
function judged(
  s: CareerState,
  order: readonly (readonly number[])[],
  moves: Map<number, number>
): CareerState {
  let out = prizes(s);
  for (const c of s.teams) {
    const move = moves.get(c.id) ?? 0;
    out = reputationAtEnd(
      out,
      c.id,
      order[c.tier][0] === c.id,
      move < 0,
      move > 0
    );
  }
  const me = mine(out);
  if (me === null) return out;
  const tier = s.teams[me].tier,
    place = standingOf(s, me);
  return post(out, {
    team: me,
    category: 'tier',
    sender: null,
    kind: 'seasonEnded',
    slots: {
      tier,
      place,
      prize: prizeAt(s, tier, place),
      moved: -(moves.get(me) ?? 0),
    },
    links: [{ to: 'screen', id: 'standings' }],
  });
}

/** The people' season: retirements (the player told of those worth news), new people, contracts ended. */
function turnover(s: CareerState, roll: Dice): CareerState {
  const r = retirements(s, roll);
  let out = r.state;
  for (const id of r.retired)
    out = scoutingStopped(talksEnded(out, id, null), id);
  for (const id of r.retired)
    if (newsworthy(s, s.people[id]))
      out = post(out, {
        team: null,
        category: 'team',
        sender: null,
        kind: 'retired',
        slots: { person: id },
        links: [{ to: 'person', id }],
      });
  return expired(managersRenewed(youngPeople(out, roll)));
}

/** Traits turned, the player told of their own people' and the famous. */
function traitsTurned(s: CareerState, roll: Dice): CareerState {
  const t = traitTurns(s, roll);
  let out = t.state;
  for (const ch of t.changes) {
    if (!newsworthy(out, out.people[ch.person])) continue;
    for (const trait of ch.gained)
      out = post(out, {
        team: null,
        category: 'team',
        sender: null,
        kind: 'traitGained',
        slots: { person: ch.person, trait },
        links: [{ to: 'person', id: ch.person }],
      });
    for (const trait of ch.lost)
      out = post(out, {
        team: null,
        category: 'team',
        sender: null,
        kind: 'traitLost',
        slots: { person: ch.person, trait },
        links: [{ to: 'person', id: ch.person }],
      });
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
  for (const c of out.teams) out = carried(out, c.id);
  const calendar = makeCalendar(
    s.season + 1,
    nextStart(known(s.calendar).start),
    roll.roll('calendar')
  );
  out = seasonStart({ ...out, season: s.season + 1, round: 0, calendar });
  return scheduleSeason(out, calendar);
};

/** The season's first day: the player told of its planets and that the suppliers wait. */
export const seasonBegun: EventHandler<'seasonStart'> = (s) => {
  const cal = s.calendar;
  if (!cal || mine(s) === null) return s;
  const first = cal.rounds[0];
  const out = post(s, {
    team: null,
    category: 'tier',
    sender: null,
    kind: 'seasonPlanets',
    slots: {
      season: cal.season,
      planet: first.planet.name,
      firstDay: first.day,
    },
    links: [{ to: 'screen', id: 'calendar' }],
  });
  return post(out, {
    team: null,
    category: 'finance',
    sender: null,
    kind: 'supplierDue',
    slots: {},
    links: [{ to: 'screen', id: 'suppliers' }],
  });
};
