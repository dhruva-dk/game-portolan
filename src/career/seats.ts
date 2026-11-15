// Where a gull works on a crew (Phase B sections 3 and 5): a seat of its staff. A signing takes an open seat of the
// gull's role, or the seat of the gull they replace; a release leaves the seat open for the crew to fill. Seats are
// fixed by the epic's section 5: two captains (the player's crew one, ship one being the player's), a reserve, a bosun
// a ship, a shipwright, a scout a crow's-nest level, four flight gulls each on a job.

import type { Job } from '../race.ts';
import type { Role, Ship, Status } from '../office.ts';
import { without } from './ageing.ts';
import { JOBS } from './service.ts';
import type { Crew, Hands, Staff } from './state.ts';
import { TUNING } from './tuning.ts';

/** A seat of a crew's staff. */
export type Seat =
  | { kind: 'manager' }
  | { kind: 'captain'; ship: Ship }
  | { kind: 'reserve' }
  | { kind: 'bosun'; ship: Ship }
  | { kind: 'shipwright' }
  | { kind: 'scout' }
  | { kind: 'flight'; job: Job };

/** The seat a gull holds on a crew, or null. */
export function seatOf(c: Crew, id: number, jobOf: (id: number) => Job | null): Seat | null {
  const st = c.staff;
  if (st.manager === id) return { kind: 'manager' };
  for (const ship of [0, 1] as const) {
    if (st.ships[ship].captain === id) return { kind: 'captain', ship };
    if (st.ships[ship].bosun === id) return { kind: 'bosun', ship };
  }
  if (st.reserve === id) return { kind: 'reserve' };
  if (st.shipwright === id) return { kind: 'shipwright' };
  if (st.scouts.includes(id)) return { kind: 'scout' };
  if (st.flight.includes(id)) return { kind: 'flight', job: jobOf(id) ?? JOBS[0] };
  return null;
}

/** The role and contract status a seat is for. */
export function seatRole(seat: Seat): { role: Role; status: Status } {
  switch (seat.kind) {
    case 'captain': return { role: 'captain', status: 'ship' };
    case 'reserve': return { role: 'captain', status: 'reserve' };
    default: return { role: seat.kind, status: 'staff' };
  }
}

/** The status a role's contract may name: a captain sails a ship or is the reserve; every other role is staff. */
export const statuses = (role: Role): readonly Status[] => (role === 'captain' ? ['ship', 'reserve'] : ['staff']);

/** The first open seat of a role and status on a crew, or null. The player's ship one has no captain seat (D8). */
export function openSeat(c: Crew, role: Role, status: Status, jobsHeld: readonly (Job | null)[]): Seat | null {
  const st = c.staff;
  switch (role) {
    case 'captain':
      if (status === 'reserve') return st.reserve === null ? { kind: 'reserve' } : null;
      for (const ship of [0, 1] as const) if (st.ships[ship].captain === null && !(c.player && ship === 0)) return { kind: 'captain', ship };
      return null;
    case 'bosun':
      for (const ship of [0, 1] as const) if (st.ships[ship].bosun === null) return { kind: 'bosun', ship };
      return null;
    case 'shipwright': return st.shipwright === null ? { kind: 'shipwright' } : null;
    case 'scout': return st.scouts.length < c.buildings.crowsNest.level ? { kind: 'scout' } : null;
    case 'flight': {
      if (st.flight.length >= TUNING.world.flight) return null;
      const job = JOBS.find((j) => !jobsHeld.includes(j));
      return job ? { kind: 'flight', job } : null;
    }
    case 'manager': return st.manager === null ? { kind: 'manager' } : null;
    default: return null;
  }
}

/** A staff with a gull seated (the seat must be open). */
export function seated(st: Staff, seat: Seat, id: number): Staff {
  const hand = (h: Hands, key: 'captain' | 'bosun'): Hands => ({ ...h, [key]: id });
  switch (seat.kind) {
    case 'manager': return { ...st, manager: id };
    case 'captain':
    case 'bosun': {
      const ships: [Hands, Hands] = [st.ships[0], st.ships[1]];
      ships[seat.ship] = hand(ships[seat.ship], seat.kind);
      return { ...st, ships };
    }
    case 'reserve': return { ...st, reserve: id };
    case 'shipwright': return { ...st, shipwright: id };
    case 'scout': return { ...st, scouts: [...st.scouts, id] };
    case 'flight': return { ...st, flight: [...st.flight, id] };
  }
}

/** A staff with a gull taken off (their seat left open), the manager's post included. */
export const unseated = (st: Staff, id: number): Staff => {
  const out = without(st, id);
  return out.manager === id ? { ...out, manager: null } : out;
};
