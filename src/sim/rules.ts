import { STORM, type StormTable } from './storm.ts';
import { merged, type Changes } from './tables.ts';

export interface Rules {
  readonly storm: StormTable;
}

export const DEFAULT_RULES: Rules = { storm: STORM };

type RulesOver = Changes<Rules>;

export const ruled = (over: RulesOver, base: Rules = DEFAULT_RULES): Rules => ({
  storm: merged('storm', base.storm, over.storm),
});
