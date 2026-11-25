import type { MatchResult } from '../../sim/result.ts';
import { objectiveMet } from '../rules/objective.ts';
import { mapSlots, signed } from '../sponsors/slots.ts';
import type { CareerState, SponsorRow } from '../state.ts';
import { teamShips } from './finish.ts';

export const sponsorRows = (
  state: CareerState,
  result: MatchResult,
  team: number
): SponsorRow[] =>
  signed(state.teams[team].sponsors).map((sponsor) => {
    const met = objectiveMet(
      sponsor.objective,
      teamShips(result, team),
      result.sea[team]
    );
    return {
      sponsor: sponsor.sponsor,
      objective: sponsor.objective,
      met,
      amount: sponsor.fee + (met ? sponsor.bonus : 0),
    };
  });

export const countDownSponsors = (state: CareerState): CareerState => ({
  ...state,
  teams: state.teams.map((team) => ({
    ...team,
    sponsors: mapSlots(team.sponsors, (sponsor) =>
      sponsor === null || sponsor.racesLeft <= 1
        ? null
        : { ...sponsor, racesLeft: sponsor.racesLeft - 1 }
    ),
  })),
});
