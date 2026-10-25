// Producing a match (progress.html A4 matchSetup): the career fits out the fleet for a match on a seed: the player's
// chosen form and trained gull, and the nine captains drawn, by their rank; on the first voyage the nine lowest, at
// their gentlest (PROMPT.md, The first voyage); what each captain brings of the player (learn.ts mindOf); and the find
// sites the player's chart marks.
import { startingFittings } from '../sim/items.ts';
import type { MatchSetup, Outfit } from '../sim/state.ts';
import { knownSites, mindOf } from './learn.ts';
import { CAPTAINS, captainGull, captainOutfit, draw } from './league.ts';
import { LEAGUE, tierOf, type Career } from './state.ts';

/** The first voyage's captains at their gentlest: the first rank's kit and gull, and gunners who barely lead a moving ship; their minds say `gentle`. */
export const GENTLE = { gunnery: 0.2 } as const;

/** The match the career sails next on `seed`, and the captains in it in fleet order after the player's (fleet[k + 1] is captain drawn[k]). */
export function toSetup(career: Career, seed: number): { setup: MatchSetup; drawn: number[] } {
  const drawn = draw(career), { player } = career, first = career.match === 0;
  const outfit = (id: number): Outfit => ({
    ...(first ? { ...captainOutfit(career, id), fittings: startingFittings(1, CAPTAINS[id].temperament), gull: captainGull(1, CAPTAINS[id].temperament), gunnery: GENTLE.gunnery } : captainOutfit(career, id)),
    captain: { temperament: CAPTAINS[id].temperament, tier: first ? 1 : tierOf(career.captains[id].points) },
  });
  return {
    setup: {
      seed: seed >>> 0,
      rank: player.tier,
      firstVoyage: first,
      fleet: [{ form: player.form, pigment: LEAGUE, pattern: 0, gull: { ...player.gull } }, ...drawn.map(outfit)],
      minds: [null, ...drawn.map((id) => mindOf(career, id))],
      known: knownSites(career),
    },
    drawn,
  };
}
