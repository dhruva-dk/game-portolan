import { announce, updateTeam } from './change.ts';
import type { Reason } from './commands.ts';
import { pick, raceKey, uniform, whole, type Key } from './draw.ts';
import { SPONSOR_ROSTER } from './names.ts';
import { sponsorBonus, sponsorFee } from './rules/money.ts';
import type { Span } from './rules/person.ts';
import { reputations } from './rules/standing.ts';
import {
  OBJECTIVES,
  type CareerState,
  type Sponsor,
  type Team,
} from './state.ts';
import { SPONSORS } from './tuning.ts';

type Slots = Team['sponsors'];

const perSlot = (f: (slot: number) => Sponsor | null): Slots => [
  f(0),
  f(1),
  f(2),
];

export const mapSlots = (
  slots: Slots,
  f: (sponsor: Sponsor | null) => Sponsor | null
): Slots => perSlot((slot) => f(slots[slot]));

export const fillSlot = (slots: Slots, slot: number, sponsor: Sponsor): Slots =>
  perSlot((i) => (i === slot ? sponsor : slots[i]));

export const slotsOf = (sponsors: readonly Sponsor[]): Slots =>
  perSlot((slot) => sponsors.at(slot) ?? null);

export const signed = (slots: Slots): Sponsor[] =>
  slots.filter((sponsor) => sponsor !== null);

export type Dealing = {
  seed: string;
  season: number;
  race: number;
  team: number;
  reputation: number;
  held: readonly number[];
  races: Span;
};

const ROSTER = SPONSOR_ROSTER.map((_, index) => index);

export function drawOffers(dealing: Dealing): Sponsor[] {
  const { seed, season, race, team, reputation, races } = dealing;
  const offers: Sponsor[] = [];
  for (let index = 0; index < SPONSORS.offers; index++) {
    const key: Key[] = ['offer', season, race, team, index];
    const taken = [...dealing.held, ...offers.map((offer) => offer.sponsor)];
    const free = ROSTER.filter((sponsor) => !taken.includes(sponsor));
    const { lo, hi } = SPONSORS.factor;
    const fee = sponsorFee(reputation, uniform(lo, hi, seed, ...key, 'fee'));
    offers.push({
      sponsor: pick(free, seed, ...key, 'sponsor'),
      fee,
      bonus: sponsorBonus(fee),
      objective: pick(OBJECTIVES, seed, ...key, 'objective'),
      racesLeft: whole(races.lo, races.hi, seed, ...key, 'racesLeft'),
    });
  }
  return offers;
}

export function dealOffers(state: CareerState): CareerState {
  const reputation = reputations(state);
  return {
    ...state,
    teams: state.teams.map((team, index) => ({
      ...team,
      offers: drawOffers({
        seed: state.seed,
        season: state.season,
        race: raceKey(state),
        team: index,
        reputation: reputation[index],
        held: signed(team.sponsors).map((sponsor) => sponsor.sponsor),
        races: SPONSORS.races,
      }),
    })),
  };
}

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
