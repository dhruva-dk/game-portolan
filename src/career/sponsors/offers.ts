import { pick, raceKey, uniform, whole, type Key } from '../draw.ts';
import { SPONSOR_ROSTER } from '../names.ts';
import type { Span } from '../rules/person.ts';
import { reputations } from '../rules/standing.ts';
import { sponsorBonus, sponsorFee } from '../rules/money.ts';
import { OBJECTIVES, type CareerState, type Sponsor } from '../state.ts';
import { SPONSORS } from '../tuning.ts';
import { signed } from './slots.ts';

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
