// Where a person works on a team: a seat of its staff. A signing takes an open
// seat of the person's role, or the seat of the one they replace; a release
// leaves the seat open for the team to fill. The seats: a driver a ship (race.ts
// TEAM of them; on the player's team the first ship's is the player's own), a
// reserve driver, a race mechanic a ship, a lead designer, a scout a
// crow's-nest level, the pit crew.

import { SHIPS, type Role, type Ship, type Status } from '../office/command.ts';
import { without } from './ageing.ts';
import type { Hands, Staff, Team } from './state.ts';
import { TUNING } from './tuning.ts';

/** A seat of a team's staff. */
export type Seat =
  | { kind: 'manager' }
  | { kind: 'driver'; ship: Ship }
  | { kind: 'reserve' }
  | { kind: 'mechanic'; ship: Ship }
  | { kind: 'designer' }
  | { kind: 'scout' }
  | { kind: 'pit' };

/** The seat a person holds on a team, or null. */
export function seatOf(c: Team, id: number): Seat | null {
  const st = c.staff;
  if (st.manager === id) return { kind: 'manager' };
  for (const ship of SHIPS) {
    if (st.ships[ship]?.driver === id) return { kind: 'driver', ship };
    if (st.ships[ship]?.mechanic === id) return { kind: 'mechanic', ship };
  }
  if (st.reserve === id) return { kind: 'reserve' };
  if (st.designer === id) return { kind: 'designer' };
  if (st.scouts.includes(id)) return { kind: 'scout' };
  if (st.pit.includes(id)) return { kind: 'pit' };
  return null;
}

/** The role and contract status a seat is for. */
export function seatRole(seat: Seat): { role: Role; status: Status } {
  switch (seat.kind) {
    case 'driver':
      return { role: 'driver', status: 'ship' };
    case 'reserve':
      return { role: 'driver', status: 'reserve' };
    default:
      return { role: seat.kind, status: 'staff' };
  }
}

/** The status a role's contract may name: a driver sails a ship or is the reserve; every other role is staff. */
export const statuses = (role: Role): readonly Status[] =>
  role === 'driver' ? ['ship', 'reserve'] : ['staff'];

/** The ships of a team a hired driver may sail: all but the player's own on the player's team. */
const hiredShips = (c: Team): readonly Ship[] =>
  c.player ? SHIPS.slice(1) : SHIPS;

/** A team's ships as the player takes it over: she sails ship 0, the drivers kept sail the rest in order, every
 *  mechanic stays. */
export const playerAboard = (
  ships: Staff['ships'],
  kept: readonly { id: number }[]
): Staff['ships'] =>
  ships.map((h, ship) => ({
    driver: ship === 0 ? null : (kept[ship - 1]?.id ?? null),
    mechanic: h.mechanic,
  }));

/** The first open seat of a role and status on a team, or null. The player's own ship has no driver's seat. */
export function openSeat(c: Team, role: Role, status: Status): Seat | null {
  const st = c.staff;
  switch (role) {
    case 'driver': {
      if (status === 'reserve')
        return st.reserve === null ? { kind: 'reserve' } : null;
      const ship = hiredShips(c).find((k) => st.ships[k]?.driver === null);
      return ship === undefined ? null : { kind: 'driver', ship };
    }
    case 'mechanic': {
      const ship = SHIPS.find((k) => st.ships[k]?.mechanic === null);
      return ship === undefined ? null : { kind: 'mechanic', ship };
    }
    case 'designer':
      return st.designer === null ? { kind: 'designer' } : null;
    case 'scout':
      return st.scouts.length < c.buildings.crowsNest.level
        ? { kind: 'scout' }
        : null;
    case 'pit':
      return st.pit.length < TUNING.world.pit ? { kind: 'pit' } : null;
    case 'manager':
      return st.manager === null ? { kind: 'manager' } : null;
    default:
      return null;
  }
}

/** A staff with a person seated (the seat must be open). */
export function seated(st: Staff, seat: Seat, id: number): Staff {
  switch (seat.kind) {
    case 'manager':
      return { ...st, manager: id };
    case 'driver':
    case 'mechanic':
      return {
        ...st,
        ships: st.ships.map(
          (h, k): Hands => (k === seat.ship ? { ...h, [seat.kind]: id } : h)
        ),
      };
    case 'reserve':
      return { ...st, reserve: id };
    case 'designer':
      return { ...st, designer: id };
    case 'scout':
      return { ...st, scouts: [...st.scouts, id] };
    case 'pit':
      return { ...st, pit: [...st.pit, id] };
  }
}

/** A staff with a person taken off (their seat left open), the manager's post included. */
export const unseated = (st: Staff, id: number): Staff => {
  const out = without(st, id);
  return out.manager === id ? { ...out, manager: null } : out;
};
