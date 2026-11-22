// Where a person works on a team (Phase B sections 3 and 5): a seat of its staff. A signing takes an open seat of the
// person's role, or the seat of the person they replace; a release leaves the seat open for the team to fill. Seats are
// fixed by the epic's section 5: two drivers (the player's team one, ship one being the player's), a reserve, a mechanic
// a ship, a designer, a scout a crow's-nest level, four pit crew members each on a job.

import type { Job } from '../race.ts';
import type { Role, Ship, Status } from '../office.ts';
import { without } from './ageing.ts';
import { JOBS } from './service.ts';
import type { Team, Hands, Staff } from './state.ts';
import { TUNING } from './tuning.ts';

/** A seat of a team's staff. */
export type Seat =
  | { kind: 'manager' }
  | { kind: 'driver'; ship: Ship }
  | { kind: 'reserve' }
  | { kind: 'mechanic'; ship: Ship }
  | { kind: 'designer' }
  | { kind: 'scout' }
  | { kind: 'pit'; job: Job };

/** The seat a person holds on a team, or null. */
export function seatOf(
  c: Team,
  id: number,
  jobOf: (id: number) => Job | null
): Seat | null {
  const st = c.staff;
  if (st.manager === id) return { kind: 'manager' };
  for (const ship of [0, 1] as const) {
    if (st.ships[ship].driver === id) return { kind: 'driver', ship };
    if (st.ships[ship].mechanic === id) return { kind: 'mechanic', ship };
  }
  if (st.reserve === id) return { kind: 'reserve' };
  if (st.designer === id) return { kind: 'designer' };
  if (st.scouts.includes(id)) return { kind: 'scout' };
  if (st.pit.includes(id)) return { kind: 'pit', job: jobOf(id) ?? JOBS[0] };
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

/** The first open seat of a role and status on a team, or null. The player's ship one has no driver seat (D8). */
export function openSeat(
  c: Team,
  role: Role,
  status: Status,
  jobsHeld: readonly (Job | null)[]
): Seat | null {
  const st = c.staff;
  switch (role) {
    case 'driver':
      if (status === 'reserve')
        return st.reserve === null ? { kind: 'reserve' } : null;
      for (const ship of [0, 1] as const)
        if (st.ships[ship].driver === null && !(c.player && ship === 0))
          return { kind: 'driver', ship };
      return null;
    case 'mechanic':
      for (const ship of [0, 1] as const)
        if (st.ships[ship].mechanic === null) return { kind: 'mechanic', ship };
      return null;
    case 'designer':
      return st.designer === null ? { kind: 'designer' } : null;
    case 'scout':
      return st.scouts.length < c.buildings.crowsNest.level
        ? { kind: 'scout' }
        : null;
    case 'pit': {
      if (st.pit.length >= TUNING.world.pit) return null;
      const job = JOBS.find((j) => !jobsHeld.includes(j));
      return job ? { kind: 'pit', job } : null;
    }
    case 'manager':
      return st.manager === null ? { kind: 'manager' } : null;
    default:
      return null;
  }
}

/** A staff with a person seated (the seat must be open). */
export function seated(st: Staff, seat: Seat, id: number): Staff {
  const hand = (h: Hands, key: 'driver' | 'mechanic'): Hands => ({
    ...h,
    [key]: id,
  });
  switch (seat.kind) {
    case 'manager':
      return { ...st, manager: id };
    case 'driver':
    case 'mechanic': {
      const ships: [Hands, Hands] = [st.ships[0], st.ships[1]];
      ships[seat.ship] = hand(ships[seat.ship], seat.kind);
      return { ...st, ships };
    }
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
