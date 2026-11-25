import type { Mode } from './captain.ts';
import type { TRICKS } from './tuning.ts';

export type Trick = keyof typeof TRICKS;

export interface Temper {
  fight: number;
  notice: number;
  run: number;
  margin: number;
  standoff: number;
  loot: number;
  mend: number;
  claim: number;
  skill: number;
  aggro: number;
  gunnery: number;
  helm: number;
  react: number;
  setOff: number;
  loop: number;
  wants: Readonly<Record<Mode, number>>;
  tricks: Readonly<Record<Trick, boolean>>;
}
