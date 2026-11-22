// Who sails each ship on race day, and how (Phase B section 13). A pure function of the state: the card builder
// (career/card.ts) and the round's close (career/round.ts) read the same lineup, and while the player's race is under
// way the career takes no order that could change it (career/career.ts).
//
// A ship's captain: the player's ship one is the player's (null). Ship two of the player's crew is the plan's captain
// if they may sail. Otherwise each ship takes her own captain if fit, else the crew's reserve if fit and not on the
// other ship, else a stand-in: the best fit free-agent captain not already engaged (the player's crew first, then by
// crew id), paid for the one race at their ask. With none, the ship is forfeit (sunk at the start): no ship ever
// starts without someone to sail her.

import type { Job, Stance, Style } from '../race.ts';
import { effective } from './effective.ts';
import { seeded, type Rand } from './dice.ts';
import { tacticsHolds } from './leadership.ts';
import { unfit } from './morale.ts';
import type { Gull, GullOf } from './roles.ts';
import { JOBS } from './service.ts';
import { stars } from './stars.ts';
import type { CareerState, Crew } from './state.ts';

/** Who sails a ship: a gull (null: the player), whether hired for the race, whether she is forfeit. */
export interface Aboard {
  captain: number | null;
  standIn: boolean;
  forfeit: boolean;
}

/** A crew's race: who sails each ship, ship two's stance (both ships' for a rival), the flight's order, and the
 *  patron objectives chosen. */
export interface Sailing {
  crew: number;
  ships: readonly [Aboard, Aboard];
  stance: Stance;
  order: readonly Job[];
  objectives: readonly (number | null)[];
}

/** The stance each style sails at its best. */
const STANCE: Readonly<Record<Style, Stance>> = {
  hunter: 'hunt',
  homesteader: 'hold',
  raider: 'loot',
  turtle: 'hold',
  scavenger: 'loot',
  brawler: 'hunt',
};
export const STANCES: readonly Stance[] = ['hunt', 'hold', 'loot', 'shadow'];

/** A number for today's race of a crew or gull to seed its draws (form, a rival's plan): the same all race day. */
export const raceRand = (s: CareerState, salt: number): Rand =>
  seeded(s.seed + 7919 * (s.season * 16 + s.round + 1), salt);

/** Whether a gull may sail a race for a crew: a captain, not retired, fit, and the crew's or free (never the player). */
export function maySail(s: CareerState, crew: number, gull: number): boolean {
  const g = s.gulls[gull];
  if (!g || g.role !== 'captain' || g.retired !== null || g.player || unfit(g))
    return false;
  return g.contract === null || g.contract.crew === crew;
}

/** The fit free-agent captains, best first: the stand-ins. */
function freeCaptains(s: CareerState): Gull[] {
  return s.gulls
    .filter(
      (g) =>
        g.role === 'captain' &&
        g.contract === null &&
        g.retired === null &&
        !g.player &&
        !unfit(g)
    )
    .sort((a, b) => stars(b) - stars(a) || a.id - b.id);
}

/** A rival's stance for the race: the one its captains' style sails best if its manager's Tactics holds, else drawn. */
function rivalStance(s: CareerState, c: Crew, captain: number | null): Stance {
  const rand = raceRand(s, 100000 + c.id);
  const m = c.staff.manager === null ? null : s.gulls[c.staff.manager];
  const tactics =
    m && m.role === 'manager'
      ? effective(m as GullOf<'manager'>, null).tactics
      : 0;
  const style = captain === null ? null : s.gulls[captain].style;
  return style && tacticsHolds(tactics, rand)
    ? STANCE[style]
    : STANCES[Math.floor(rand() * STANCES.length)];
}

/** Every crew's race on race day, by crew id. */
export function lineups(s: CareerState): Sailing[] {
  const free = freeCaptains(s);
  const taken = new Set<number>();
  const hire = (): number | null => {
    const g = free.find((x) => !taken.has(x.id));
    if (!g) return null;
    taken.add(g.id);
    return g.id;
  };
  const me = s.player && !s.player.sacked ? s.player.crew : null;
  const planned = me === null ? null : s.crews[me].plan;
  if (
    planned &&
    maySail(s, me!, planned.captain) &&
    s.gulls[planned.captain].contract === null
  )
    taken.add(planned.captain);
  const order =
    me === null
      ? s.crews
      : [s.crews[me], ...s.crews.filter((c) => c.id !== me)];
  const out: Sailing[] = new Array(s.crews.length);
  for (const c of order) {
    const used = new Set<number>();
    const aboard = (ship: 0 | 1): Aboard => {
      if (c.id === me && ship === 0)
        return { captain: null, standIn: false, forfeit: false };
      const choice =
        c.id === me && planned && maySail(s, c.id, planned.captain)
          ? planned.captain
          : null;
      const own = c.staff.ships[ship].captain,
        reserve = c.staff.reserve;
      for (const g of [choice, own, reserve]) {
        if (g !== null && !used.has(g) && maySail(s, c.id, g)) {
          used.add(g);
          return {
            captain: g,
            standIn: s.gulls[g].contract === null,
            forfeit: false,
          };
        }
      }
      const g = hire();
      if (g !== null) used.add(g);
      return g === null
        ? { captain: null, standIn: false, forfeit: true }
        : { captain: g, standIn: true, forfeit: false };
    };
    const ships = [aboard(0), aboard(1)] as const;
    const mine = c.id === me && planned;
    out[c.id] = {
      crew: c.id,
      ships,
      stance: mine
        ? planned.stance
        : rivalStance(s, c, ships[0].captain ?? ships[1].captain),
      order: mine ? planned.order : JOBS,
      objectives: mine ? planned.objectives : [],
    };
  }
  return out;
}

/** The crews of a league's race in side order: in the player's league theirs first, then the others by id. */
export function sides(s: CareerState, league: number): number[] {
  const crews = [...s.leagues[league].crews].sort((a, b) => a - b);
  const me = s.player && !s.player.sacked ? s.player.crew : null;
  return me !== null && s.crews[me].league === league
    ? [me, ...crews.filter((c) => c !== me)]
    : crews;
}
