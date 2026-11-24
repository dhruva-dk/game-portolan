// The match types the harness can be told to run, by name: each of the game's
// own (sim/persona.ts TYPES: mixed, bloodbath, gold rush, cagey), every match
// of it; or, not named, each match of the type the game deals it.
//
// Node only (tools/).

import { TYPES, type MatchType } from '../../src/sim/persona.ts';

/** Each match's type by its seed: every one `name` (as the game deals them if not given). */
export function typeNamed(
  name?: string
): ((seed: number) => MatchType) | undefined {
  if (name === undefined) return undefined;
  const t = TYPES.find((k) => k.name === name);
  if (!t)
    throw new Error(
      `no match type ${name}: ${TYPES.map((k) => k.name).join(', ')}`
    );
  return () => t;
}
