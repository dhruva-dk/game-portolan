import type { Reason } from '../commands.ts';
import type { CareerState } from '../state.ts';
import { updateTeam } from '../teams.ts';
import { fillSlot } from './slots.ts';

export const signRefusal = (
  state: CareerState,
  team: number,
  slot: number
): Reason | null =>
  state.teams[team].sponsors[slot] === null ? null : 'locked';

export const signSponsor = (
  state: CareerState,
  team: number,
  offer: number,
  slot: number
): CareerState =>
  updateTeam(state, team, (t) => ({
    ...t,
    sponsors: fillSlot(t.sponsors, slot, t.offers[offer]),
    offers: t.offers.filter((_, index) => index !== offer),
  }));
