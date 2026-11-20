// The match types the harness can be told to run, by name: each of the game's
// own (sim/persona.ts), every match of it; or, not named, each match of the
// type the game deals it.
//
// Node only (tools/).

import { MIXED, type MatchType } from '../../src/sim/persona.ts';

const TYPES: Readonly<Record<string, MatchType>> = { mixed: MIXED };

/** Each match's type by its seed: every one `name` (as the game deals them if not given). */
export function typeNamed(
  name?: string
): ((seed: number) => MatchType) | undefined {
  if (name === undefined) return undefined;
  const t = TYPES[name];
  if (!t)
    throw new Error(`no match type ${name}: ${Object.keys(TYPES).join(', ')}`);
  return () => t;
}
