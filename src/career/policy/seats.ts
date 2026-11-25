import { seatHolder } from '../lookup.ts';
import { stars } from '../rules/person.ts';
import { ROLES, type CareerState, type Role } from '../state.ts';
import { POLICY } from '../tuning.ts';

export function holderStars(
  state: CareerState,
  team: number,
  role: Role
): number {
  const holder = seatHolder(state, team, role);
  return holder === null ? POLICY.emptySeatStars : stars(holder.stats);
}

export function weakSeat(state: CareerState, team: number): Role {
  let weak = ROLES[0];
  for (const role of ROLES)
    if (holderStars(state, team, role) < holderStars(state, team, weak))
      weak = role;
  return weak;
}
