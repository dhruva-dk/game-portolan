import { STORM, type StormTable } from './storm.ts';

export interface Rules {
  readonly storm: StormTable;
}

export const DEFAULT_RULES: Rules = { storm: STORM };
