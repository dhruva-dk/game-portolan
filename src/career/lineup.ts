// Who sails each ship on race day, and how (Phase B section 13). A pure function of the state: the card builder
// (career/card.ts) and the round's close (career/round.ts) read the same lineup, and while the player's race is under
// way the career takes no order that could change it (career/career.ts).
//
// A ship's driver: the player's ship one is the player's (null). Ship two of the player's team is the plan's driver
// if they may sail. Otherwise each ship takes her own driver if fit, else the team's reserve if fit and not on the
// other ship, else a stand-in: the best fit free-agent driver not already engaged (the player's team first, then by
// team id), paid for the one race at their ask. With none, the ship is forfeit (sunk at the start): no ship ever
// starts without someone to sail her.

import type { Job, Stance, Persona } from '../race.ts';
import { effective } from './effective.ts';
import { seeded, type Rand } from './dice.ts';
import { tacticsHolds } from './leadership.ts';
import { unfit } from './morale.ts';
import type { Person, PersonOf } from './roles.ts';
import { JOBS } from './service.ts';
import { stars } from './stars.ts';
import type { CareerState, Team } from './state.ts';

/** Who sails a ship: a person (null: the player), whether hired for the race, whether she is forfeit. */
export interface Aboard {
  driver: number | null;
  standIn: boolean;
  forfeit: boolean;
}

/** A team's race: who sails each ship, ship two's stance (both ships' for a rival), the pit crew's order, and the
 *  sponsor objectives chosen. */
export interface Sailing {
  team: number;
  ships: readonly [Aboard, Aboard];
  stance: Stance;
  order: readonly Job[];
  objectives: readonly (number | null)[];
}

/** The stance each persona sails at its best. */
const STANCE: Readonly<Record<Persona, Stance>> = {
  hunter: 'hunt',
  homesteader: 'hold',
  raider: 'loot',
  turtle: 'hold',
  scavenger: 'loot',
  brawler: 'hunt',
};
export const STANCES: readonly Stance[] = ['hunt', 'hold', 'loot', 'shadow'];

/** A number for today's race of a team or person to seed its draws (form, a rival's plan): the same all race day. */
export const raceRand = (s: CareerState, salt: number): Rand =>
  seeded(s.seed + 7919 * (s.season * 16 + s.round + 1), salt);

/** Whether a person may sail a race for a team: a driver, not retired, fit, and the team's or free (never the player). */
export function maySail(s: CareerState, team: number, person: number): boolean {
  const g = s.people[person];
  if (!g || g.role !== 'driver' || g.retired !== null || g.player || unfit(g))
    return false;
  return g.contract === null || g.contract.team === team;
}

/** The fit free-agent drivers, best first: the stand-ins. */
function freeDrivers(s: CareerState): Person[] {
  return s.people
    .filter(
      (g) =>
        g.role === 'driver' &&
        g.contract === null &&
        g.retired === null &&
        !g.player &&
        !unfit(g)
    )
    .sort((a, b) => stars(b) - stars(a) || a.id - b.id);
}

/** A rival's stance for the race: the one its drivers' persona sails best if its manager's Tactics holds, else drawn. */
function rivalStance(s: CareerState, c: Team, driver: number | null): Stance {
  const rand = raceRand(s, 100000 + c.id);
  const m = c.staff.manager === null ? null : s.people[c.staff.manager];
  const tactics =
    m && m.role === 'manager'
      ? effective(m as PersonOf<'manager'>, null).tactics
      : 0;
  const persona = driver === null ? null : s.people[driver].persona;
  return persona && tacticsHolds(tactics, rand)
    ? STANCE[persona]
    : STANCES[Math.floor(rand() * STANCES.length)];
}

/** Every team's race on race day, by team id. */
export function lineups(s: CareerState): Sailing[] {
  const free = freeDrivers(s);
  const taken = new Set<number>();
  const hire = (): number | null => {
    const g = free.find((x) => !taken.has(x.id));
    if (!g) return null;
    taken.add(g.id);
    return g.id;
  };
  const me = s.player && !s.player.sacked ? s.player.team : null;
  const planned = me === null ? null : s.teams[me].plan;
  if (
    planned &&
    maySail(s, me!, planned.driver) &&
    s.people[planned.driver].contract === null
  )
    taken.add(planned.driver);
  const order =
    me === null
      ? s.teams
      : [s.teams[me], ...s.teams.filter((c) => c.id !== me)];
  const out: Sailing[] = new Array(s.teams.length);
  for (const c of order) {
    const used = new Set<number>();
    const aboard = (ship: 0 | 1): Aboard => {
      if (c.id === me && ship === 0)
        return { driver: null, standIn: false, forfeit: false };
      const choice =
        c.id === me && planned && maySail(s, c.id, planned.driver)
          ? planned.driver
          : null;
      const own = c.staff.ships[ship].driver,
        reserve = c.staff.reserve;
      for (const g of [choice, own, reserve]) {
        if (g !== null && !used.has(g) && maySail(s, c.id, g)) {
          used.add(g);
          return {
            driver: g,
            standIn: s.people[g].contract === null,
            forfeit: false,
          };
        }
      }
      const g = hire();
      if (g !== null) used.add(g);
      return g === null
        ? { driver: null, standIn: false, forfeit: true }
        : { driver: g, standIn: true, forfeit: false };
    };
    const ships = [aboard(0), aboard(1)] as const;
    const mine = c.id === me && planned;
    out[c.id] = {
      team: c.id,
      ships,
      stance: mine
        ? planned.stance
        : rivalStance(s, c, ships[0].driver ?? ships[1].driver),
      order: mine ? planned.order : JOBS,
      objectives: mine ? planned.objectives : [],
    };
  }
  return out;
}

/** The teams of a tier's race in side order: in the player's tier theirs first, then the others by id. */
export function sides(s: CareerState, tier: number): number[] {
  const teams = [...s.championships[tier].teams].sort((a, b) => a - b);
  const me = s.player && !s.player.sacked ? s.player.team : null;
  return me !== null && s.teams[me].tier === tier
    ? [me, ...teams.filter((c) => c !== me)]
    : teams;
}
