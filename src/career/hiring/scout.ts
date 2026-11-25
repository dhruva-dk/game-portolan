import type { Reason } from '../commands.ts';
import type { CareerState, Role } from '../state.ts';
import { updateTeam } from '../teams.ts';

export const scoutRefusal = (
  state: CareerState,
  team: number,
  role: Role
): Reason | null => (state.teams[team].scoutSeat === role ? 'same' : null);

export const setScoutSeat = (
  state: CareerState,
  team: number,
  role: Role
): CareerState => updateTeam(state, team, (t) => ({ ...t, scoutSeat: role }));
