// A bot's brain: what each part of her is tuned by, gathered, and her nature
// (her seed, her brain and the temperament they give her), fixed for her life.
// The brain adds nothing of its own: each slice is a part's own table, kept and
// documented where that part reads it (BOTS.md 1.3), and a part reads only its
// own slices, from the brain it is given (tests/architecture-bots.test.ts).
// Every ship in the game sails with DEFAULT_BRAIN; the harness (tools/) gives
// others.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { CHOICE } from './bot.ts';
import { CLAIMER } from './claimer.ts';
import { MIND } from './fighting.ts';
import { GUNNERY } from './gunner.ts';
import { HELM } from './helmsman.ts';
import { HUNTING } from './hunter.ts';
import { SIGHT } from './lookout.ts';
import { PURSER } from './purser.ts';
import { ROAMING } from './roaming.ts';
import { STORMING } from './storming.ts';
import { RAMMING } from './tactician.ts';
import { merged, type Changes, type Widen } from './tables.ts';
import { STYLES, temper, type Temper } from './temper.ts';

/**
 * What each part of a bot is tuned by: the weights of her options (bot.ts), her
 * sight (lookout.ts), her weighing of a fight and a run (fighting.ts), her
 * roaming (roaming.ts) and her storm (storming.ts), her ramming
 * (tactician.ts), her helm (helmsman.ts), her stores (purser.ts), her water
 * (claimer.ts), her ear (hunter.ts), how she fights her guns (gunner.ts), and
 * the temperaments she may be born to (temper.ts).
 */
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
  readonly styles: Widen<typeof STYLES>;
}

/** The brain every ship in the game sails with. */
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
  styles: STYLES,
};

/**
 * What a variant of a brain changes: any keys of any of its tables, and the
 * temperaments whole.
 */
export type Over = Changes<Omit<Brain, 'styles'>> & {
  readonly styles?: Brain['styles'];
};

/**
 * A whole brain: `base` with `over`'s changes, every slice and key in the
 * default's order (one shape for every brain: tables.ts).
 */
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
    styles: over.styles ?? base.styles,
  };
}

/**
 * A bot's nature, fixed for her life: her seed (her chance's start, and the
 * steps she thinks on), her brain, and the temperament they give her.
 */
export interface Nature {
  readonly seed: number;
  readonly brain: Brain;
  readonly temper: Temper;
}

/** The nature of a bot of this seed and brain. */
export const nature = (seed: number, brain: Brain = DEFAULT_BRAIN): Nature => ({
  seed,
  brain,
  temper: temper(seed, brain.styles),
});
