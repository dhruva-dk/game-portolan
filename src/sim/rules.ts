// A match's rules: what it lays on the water (loot.ts LOOT) and how its storm
// closes (storm.ts STORM). The game's own are its tables as written; others
// are written as only what they change and made whole by `ruled`, every key in
// the default's order (tables.ts). Made once a match and carried on it
// (play/state.ts Match), read where the loot is laid and the storm is planned.
//
// What isn't a match's to vary stays where it is: how a piece lies on the
// water (loot.ts PIECE); and the guns (handling.ts), which no match varies.
//
// Pure: no three, so it runs in node for the tests.

import { LOOT, type LootTable } from './loot.ts';
import { STORM, type StormTable } from './storm.ts';
import { merged, type Changes } from './tables.ts';

/** A match's rules. */
export interface Rules {
  readonly loot: LootTable;
  readonly storm: StormTable;
}

/** The game's own rules. */
export const DEFAULT_RULES: Rules = { loot: LOOT, storm: STORM };

/** What a variant of the rules changes: any keys of either table. */
export type RulesOver = Changes<Rules>;

/** Whole rules: `base` with `over`'s changes, keys in `base`'s order. */
export const ruled = (over: RulesOver, base: Rules = DEFAULT_RULES): Rules => ({
  loot: merged('loot', base.loot, over.loot),
  storm: merged('storm', base.storm, over.storm),
});
