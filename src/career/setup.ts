// LEGACY: the old game's career (commit 2025e68), kept only because tests/tools/tournament.ts and the sim tests
// that run it still import it. Portolan's career does not use this file: see src/career/index.ts.
// Whoever retires or rewrites the tournament may delete this file, and the other legacy career files with it.
import { startingFittings } from '../sim/items.ts';
import type { MatchSetup, Outfit } from '../sim/state.ts';
import { knownSites, mindOf } from './learn.ts';
import { CAPTAINS, captainGull, captainOutfit, draw } from './league.ts';
import { LEAGUE, tierOf, type Career } from './state.ts';

export const GENTLE = { gunnery: 0.2 } as const;

export function toSetup(career: Career, seed: number): { setup: MatchSetup; drawn: number[] } {
  const drawn = draw(career), { player } = career, first = career.match === 0;
  const outfit = (id: number): Outfit => ({
    ...(first ? { ...captainOutfit(career, id), fittings: startingFittings(1), gull: captainGull(1, CAPTAINS[id].temperament), gunnery: GENTLE.gunnery } : captainOutfit(career, id)),
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
