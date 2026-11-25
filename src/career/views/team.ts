import { releaseCostOf } from '../hiring/cost.ts';
import { personOf, seatHolder } from '../lookup.ts';
import { ROLES, YOURS, type CareerState, type Role } from '../state.ts';
import { CONTRACTS } from '../tuning.ts';
import { exactCard, uncleCard, type CardView } from './card.ts';

export type SeatView = {
  role: Role;
  card: CardView | null;
  scouting: boolean;
  deal: number[];
  renew: { faint: boolean } | null;
  release: { cost: number } | null;
};

export type TeamView = { seats: SeatView[] };

function seatOf(state: CareerState, role: Role): SeatView {
  const team = state.teams[YOURS];
  const holder = seatHolder(state, YOURS, role);
  const deal = (team.deals[role]?.candidates ?? []).flatMap((id) => {
    const person = personOf(state, id);
    return person === null ? [] : [person.portrait];
  });
  const base = { role, scouting: team.scoutSeat === role, deal };
  if (holder === null)
    return {
      ...base,
      card: role === 'driver' ? uncleCard() : null,
      renew: null,
      release: null,
    };
  const racesLeft = holder.contract?.racesLeft ?? 0;
  return {
    ...base,
    card: exactCard(holder),
    renew: { faint: racesLeft > CONTRACTS.renewWithin },
    release: { cost: releaseCostOf(holder) },
  };
}

export const teamView = (state: CareerState): TeamView => ({
  seats: ROLES.map((role) => seatOf(state, role)),
});
