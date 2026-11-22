// Who sails each ship on race day, and under what call. A pure function of the
// state: the card builder (career/card.ts) and the round's close
// (career/round.ts) read the same lineup, and while the player's race is under
// way the career takes no order that could change it (career/career.ts).
//
// A ship's driver: the first ship of the player's team is the player's (null).
// The player's other ships take the plan's drivers where they may sail. Then
// each ship still open takes her own driver if fit, else the team's reserve if
// fit and not aboard another, else a stand-in: the best fit free-agent driver
// not already engaged (the player's team first, then by team id), paid for the
// one race at their ask. With none, the ship is forfeit: no ship ever starts
// without someone to sail her.

import { CALLS, type Call, type Persona } from '../race.ts';
import { SHIPS } from '../office/command.ts';
import { effective } from './effective.ts';
import { seeded, type Rand } from './dice.ts';
import { tacticsHolds } from './leadership.ts';
import { unfit } from './morale.ts';
import { hasRole, type Person } from './roles.ts';
import { stars } from './stars.ts';
import type { CareerState, Team } from './state.ts';

/** Who sails a ship: a person (null: the player), whether hired for the race, whether she is forfeit. */
interface Aboard {
  driver: number | null;
  standIn: boolean;
  forfeit: boolean;
}

/** A team's race: who sails each ship, the call it sails under, and the sponsor objectives chosen. */
export interface Sailing {
  team: number;
  ships: readonly Aboard[];
  call: Call;
  objectives: readonly (number | null)[];
}

/** The call each persona sails at its best. */
const CALL: Readonly<Record<Persona, Call>> = {
  hunter: 'attack',
  homesteader: 'hold',
  raider: 'attack',
  turtle: 'hold',
  scavenger: 'free',
  brawler: 'attack',
};

const HERS: Aboard = { driver: null, standIn: false, forfeit: false };
const NOBODY: Aboard = { driver: null, standIn: false, forfeit: true };

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

/** A rival's call for the race: the one its first driver's persona sails best if its manager's Tactics holds, else drawn. */
function rivalCall(s: CareerState, c: Team, driver: number | null): Call {
  const rand = raceRand(s, 100000 + c.id);
  const m = c.staff.manager === null ? undefined : s.people[c.staff.manager];
  const tactics = m && hasRole(m, 'manager') ? effective(m, null).tactics : 0;
  const persona = driver === null ? null : (s.people[driver]?.persona ?? null);
  const drawn = CALLS[Math.floor(rand() * CALLS.length)] ?? 'free';
  return persona && tacticsHolds(tactics, rand) ? CALL[persona] : drawn;
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
  const mine = s.player && !s.player.sacked ? s.teams[s.player.team] : null;
  const plan = mine?.plan ?? null;
  const wanted = (ship: number): number | null => {
    const d = plan?.drivers[ship - 1];
    return mine && d !== undefined && maySail(s, mine.id, d) ? d : null;
  };
  // the plan's free agents are engaged before any rival looks for a stand-in
  for (const ship of SHIPS) {
    const d = wanted(ship);
    if (d !== null && s.people[d]?.contract === null) taken.add(d);
  }
  const order = mine
    ? [mine, ...s.teams.filter((c) => c.id !== mine.id)]
    : s.teams;
  const out = new Map<number, Sailing>();
  for (const c of order) {
    const used = new Set<number>();
    const ships = new Map<number, Aboard>();
    const board = (ship: number, g: number) => {
      used.add(g);
      ships.set(ship, {
        driver: g,
        standIn: s.people[g]?.contract === null,
        forfeit: false,
      });
    };
    if (c === mine) {
      ships.set(0, HERS);
      for (const ship of SHIPS) {
        const d = ship === 0 ? null : wanted(ship);
        if (d !== null && !used.has(d)) board(ship, d);
      }
    }
    for (const ship of SHIPS) {
      if (ships.has(ship)) continue;
      const own = c.staff.ships[ship]?.driver ?? null;
      const fit = [own, c.staff.reserve].find(
        (g) => g !== null && !used.has(g) && maySail(s, c.id, g)
      );
      const g = fit ?? hire();
      if (g === null) ships.set(ship, NOBODY);
      else board(ship, g);
    }
    const aboard = SHIPS.map((ship) => ships.get(ship) ?? NOBODY);
    out.set(c.id, {
      team: c.id,
      ships: aboard,
      call:
        c === mine
          ? (plan?.call ?? 'free')
          : rivalCall(
              s,
              c,
              aboard.find((a) => a.driver !== null)?.driver ?? null
            ),
      objectives: c === mine && plan ? plan.objectives : [],
    });
  }
  return s.teams.map(
    (c) =>
      out.get(c.id) ?? { team: c.id, ships: [], call: 'free', objectives: [] }
  );
}

/** The teams of a tier's race in the card's order: in the player's tier theirs first, then the others by id. */
export function grid(s: CareerState, tier: number): number[] {
  const teams = [...(s.championships[tier]?.teams ?? [])].sort((a, b) => a - b);
  const me = s.player && !s.player.sacked ? s.player.team : null;
  return me !== null && s.teams[me]?.tier === tier
    ? [me, ...teams.filter((c) => c !== me)]
    : teams;
}
