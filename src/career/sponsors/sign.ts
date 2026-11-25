import { announce } from '../announce.ts';
import type { Reason } from '../commands.ts';
import { SPONSOR_ROSTER } from '../names.ts';
import type { CareerState } from '../state.ts';
import { updateTeam } from '../teams.ts';
import { fillSlot } from './slots.ts';

export const signRefusal = (
  state: CareerState,
  team: number,
  slot: number
): Reason | null =>
  state.teams[team].sponsors[slot] === null ? null : 'locked';

export function signSponsor(
  state: CareerState,
  team: number,
  offer: number,
  slot: number
): CareerState {
  const signed = state.teams[team].offers[offer];
  return announce(
    updateTeam(state, team, (t) => ({
      ...t,
      sponsors: fillSlot(t.sponsors, slot, signed),
      offers: t.offers.filter((_, index) => index !== offer),
    })),
    {
      kind: 'sponsorSigned',
      team,
      sponsor: SPONSOR_ROSTER[signed.sponsor].name,
    }
  );
}
