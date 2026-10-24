// Producing a match (progress.html A4 matchSetup): the career fits out the fleet for a match on a seed: the player's
// chosen form and trained gull, and the nine captains drawn, by their rank. Part B adds the first voyage's gentlest
// captains and what each captain has learned of the player.
import type { MatchSetup } from '../sim/state.ts';
import { captainOutfit, draw } from './league.ts';
import { LEAGUE, type Career } from './state.ts';

/** The match the career sails next on `seed`, and the captains in it in fleet order after the player's (fleet[k + 1] is captain drawn[k]). */
export function toSetup(career: Career, seed: number): { setup: MatchSetup; drawn: number[] } {
  const drawn = draw(career), { player } = career;
  return {
    setup: {
      seed: seed >>> 0,
      rank: player.tier,
      firstVoyage: career.match === 0,
      fleet: [{ form: player.form, pigment: LEAGUE, pattern: 0, gull: { ...player.gull } }, ...drawn.map((id) => captainOutfit(career, id))],
    },
    drawn,
  };
}
