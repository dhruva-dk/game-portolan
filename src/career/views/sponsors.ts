import { SPONSOR_ROSTER } from '../names.ts';
import {
  YOURS,
  type CareerState,
  type Objective,
  type Sponsor,
} from '../state.ts';

export type { Objective };

export type SponsorCard = {
  sponsor: number;
  name: string;
  emblem: number;
  fee: number;
  bonus: number;
  objective: Objective;
  figure: number | null;
  percent: boolean;
  racesLeft: number;
  pays: number;
};

export type OfferCard = SponsorCard & { signable: boolean };

export type SponsorsView = {
  slots: readonly (SponsorCard | null)[];
  offers: readonly OfferCard[];
  open: readonly number[];
};

function card(sponsor: Sponsor): SponsorCard {
  const named = SPONSOR_ROSTER[sponsor.sponsor];
  return {
    sponsor: sponsor.sponsor,
    name: named.name,
    emblem: named.emblem,
    fee: sponsor.fee,
    bonus: sponsor.bonus,
    objective: sponsor.objective,
    figure: sponsor.target,
    percent: sponsor.objective === 'sea',
    racesLeft: sponsor.racesLeft,
    pays: sponsor.fee * sponsor.racesLeft,
  };
}

export function sponsorsView(state: CareerState): SponsorsView {
  const team = state.teams[YOURS];
  const open = team.sponsors.flatMap((held, slot) =>
    held === null ? [slot] : []
  );
  return {
    slots: team.sponsors.map((held) => (held === null ? null : card(held))),
    offers: team.offers.map((offer) => ({
      ...card(offer),
      signable: open.length > 0,
    })),
    open,
  };
}
