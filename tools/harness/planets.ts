// The planets the harness measures on (PLAN section 5): five to tune on and
// five held out, each a random 32-bit seed drawn once and kept here. Until
// these every rating ran on the game's own planet (3) and the fixes were found
// on its coasts; a change is now measured over the five tuned on, and gated on
// the five held out, which nothing is ever tuned against. The game's planet
// has no place among them.
//
// Node only (tools/).

import type { Spec } from './run.ts';

export const PLANETS = {
  tune: [2782603917, 2181054939, 1608152839, 2741876522, 228980884],
  held: [319182809, 2807500422, 916188085, 3865060314, 911717611],
} as const;

export type Kept = keyof typeof PLANETS;
export const KEPT = ['tune', 'held'] as const satisfies readonly Kept[];

/** The planets of a pool by name: `tune`, `held`, or `all` (tune first). */
export function planetsOf(pool: string): number[] {
  if (pool === 'all') return [...PLANETS.tune, ...PLANETS.held];
  if (pool === 'tune' || pool === 'held') return [...PLANETS[pool]];
  throw new Error(`no pool "${pool}": tune, held or all`);
}

/** Which set a planet is of (null: neither). */
export const keptOf = (planet: number): Kept | null =>
  (PLANETS.tune as readonly number[]).includes(planet)
    ? 'tune'
    : (PLANETS.held as readonly number[]).includes(planet)
      ? 'held'
      : null;

/**
 * Matches `from` to `from + count - 1` on each planet of `planets`, a fleet of
 * `brains` mixed (one brain: every ship sails it), the rest of each spec as
 * `base`. Planet by planet, so a worker mostly keeps one planet made.
 */
export function poolSpecs(
  planets: readonly number[],
  count: number,
  { from = 1, brains = ['default'], ...base }: Partial<Spec> & { from?: number }
): Spec[] {
  const specs: Spec[] = [];
  for (const planet of planets)
    for (let match = from; match < from + count; match++)
      specs.push({ ...base, planet, match, brains });
  return specs;
}
