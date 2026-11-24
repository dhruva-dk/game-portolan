import { GUN } from './handling.ts';
import { LOOT, type LootTable } from './loot.ts';
import { STORM, type StormTable } from './storm.ts';
import { merged, type Changes } from './tables.ts';

interface AimTable {
  readonly assist: readonly number[];
}

const AIM: AimTable = { assist: GUN.assist };

export interface Rules {
  readonly loot: LootTable;
  readonly storm: StormTable;
  readonly aim: AimTable;
}

export const DEFAULT_RULES: Rules = { loot: LOOT, storm: STORM, aim: AIM };

type RulesOver = Changes<Rules>;

export const ruled = (over: RulesOver, base: Rules = DEFAULT_RULES): Rules => ({
  loot: merged('loot', base.loot, over.loot),
  storm: merged('storm', base.storm, over.storm),
  aim: merged('aim', base.aim, over.aim),
});
