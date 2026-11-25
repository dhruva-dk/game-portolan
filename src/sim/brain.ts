import { CHOICE } from './bot.ts';
import { CLAIMER } from './claimer.ts';
import { MIND } from './fighting.ts';
import { GUNNERY } from './gunner.ts';
import { HELM } from './helmsman.ts';
import { HUNTING } from './hunter.ts';
import { LOGBOOK } from './logbook.ts';
import { SIGHT } from './lookout.ts';
import { PLACING } from './placing.ts';
import { PURSER } from './purser.ts';
import { ROAMING } from './roaming.ts';
import { STORMING } from './storming.ts';
import { RAMMING } from './tactician.ts';
import type { Widen } from './tables.ts';

export interface Brain {
  readonly choice: Widen<typeof CHOICE>;
  readonly sight: Widen<typeof SIGHT>;
  readonly mind: Widen<typeof MIND>;
  readonly roaming: Widen<typeof ROAMING>;
  readonly storming: Widen<typeof STORMING>;
  readonly ramming: Widen<typeof RAMMING>;
  readonly helm: Widen<typeof HELM>;
  readonly purser: Widen<typeof PURSER>;
  readonly claimer: Widen<typeof CLAIMER>;
  readonly hunting: Widen<typeof HUNTING>;
  readonly gunnery: Widen<typeof GUNNERY>;
  readonly placing: Widen<typeof PLACING>;
  readonly logbook: Widen<typeof LOGBOOK>;
}

export const DEFAULT_BRAIN: Brain = {
  choice: CHOICE,
  sight: SIGHT,
  mind: MIND,
  roaming: ROAMING,
  storming: STORMING,
  ramming: RAMMING,
  helm: HELM,
  purser: PURSER,
  claimer: CLAIMER,
  hunting: HUNTING,
  gunnery: GUNNERY,
  placing: PLACING,
  logbook: LOGBOOK,
};
