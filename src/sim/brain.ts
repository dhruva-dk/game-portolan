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
import { merged, type Changes, type Widen } from './tables.ts';
import { STYLES } from './temper.ts';

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
  readonly styles: Widen<typeof STYLES>;
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
  styles: STYLES,
};

export type Over = Changes<Omit<Brain, 'styles'>> & {
  readonly styles?: Brain['styles'];
};

export function variant(over: Over, base: Brain = DEFAULT_BRAIN): Brain {
  return {
    choice: merged('choice', base.choice, over.choice),
    sight: merged('sight', base.sight, over.sight),
    mind: merged('mind', base.mind, over.mind),
    roaming: merged('roaming', base.roaming, over.roaming),
    storming: merged('storming', base.storming, over.storming),
    ramming: merged('ramming', base.ramming, over.ramming),
    helm: merged('helm', base.helm, over.helm),
    purser: merged('purser', base.purser, over.purser),
    claimer: merged('claimer', base.claimer, over.claimer),
    hunting: merged('hunting', base.hunting, over.hunting),
    gunnery: merged('gunnery', base.gunnery, over.gunnery),
    placing: merged('placing', base.placing, over.placing),
    logbook: merged('logbook', base.logbook, over.logbook),
    styles: over.styles ?? base.styles,
  };
}
