// A match's rules: what it lays on the water (loot.ts LOOT), how its storm
// closes (storm.ts STORM) and how far its guns' assist reaches (AIM). The
// game's own are its tables as written; others are written as only what they
// change and made whole by `ruled`, every key in the default's order
// (tables.ts). Made once a match and carried on it (play/state.ts Match), read
// where the loot is laid, the storm is planned and the fighting begun.
//
// What isn't a match's to vary stays where it is: how a piece lies on the
// water (loot.ts PIECE); and the guns themselves (handling.ts).
//
// Pure: no three, so it runs in node for the tests.

import { GUN } from './handling.ts';
import { LOOT, type LootTable } from './loot.ts';
import { STORM, type StormTable } from './storm.ts';
import { merged, type Changes } from './tables.ts';

/**
 * The aim: the guns' assist, its cone (radians) by rarity (gun.ts laid): the
 * game's own handling.ts GUN.assist; the harness's variants measure what it
 * gives a player (tools/harness/player.ts).
 */
interface AimTable {
  readonly assist: readonly number[];
}

const AIM: AimTable = { assist: GUN.assist };

/** A match's rules. */
export interface Rules {
  readonly loot: LootTable;
  readonly storm: StormTable;
  readonly aim: AimTable;
}

/** The game's own rules. */
export const DEFAULT_RULES: Rules = { loot: LOOT, storm: STORM, aim: AIM };

/** What a variant of the rules changes: any keys of any table. */
type RulesOver = Changes<Rules>;

/** Whole rules: `base` with `over`'s changes, keys in `base`'s order. */
export const ruled = (over: RulesOver, base: Rules = DEFAULT_RULES): Rules => ({
  loot: merged('loot', base.loot, over.loot),
  storm: merged('storm', base.storm, over.storm),
  aim: merged('aim', base.aim, over.aim),
});
