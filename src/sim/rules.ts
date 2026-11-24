import { LOOT, type LootTable } from './loot.ts';
import { STORM, type StormTable } from './storm.ts';
import { merged, type Changes } from './tables.ts';

export interface Rules {
  readonly loot: LootTable;
  readonly storm: StormTable;
}

export const DEFAULT_RULES: Rules = { loot: LOOT, storm: STORM };

type RulesOver = Changes<Rules>;

export const ruled = (over: RulesOver, base: Rules = DEFAULT_RULES): Rules => ({
  loot: merged('loot', base.loot, over.loot),
  storm: merged('storm', base.storm, over.storm),
});
