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

import { MIND, ROAMING, SIGHT, STORMING } from './bot.ts';
import { CLAIMER } from './claimer.ts';
import { HELM } from './helmsman.ts';
import { PURSER } from './purser.ts';
import { RAMMING } from './tactician.ts';
import { STYLES, temper, type Temper } from './temper.ts';

/**
 * A table as a brain holds it: its numbers any numbers, not the ones it was
 * written with (so a variant may give others), its lists and tables alike.
 */
type Widen<T> = T extends number
  ? number
  : T extends string
    ? string
    : { readonly [K in keyof T]: Widen<T[K]> };

/**
 * What each part of a bot is tuned by: her sight, her mind's weighing, her
 * roaming and her storm (bot.ts), her ramming (tactician.ts), her helm
 * (helmsman.ts), her stores (purser.ts), her water (claimer.ts), and the
 * temperaments she may be born to (temper.ts).
 */
export interface Brain {
  readonly sight: Widen<typeof SIGHT>;
  readonly mind: Widen<typeof MIND>;
  readonly roaming: Widen<typeof ROAMING>;
  readonly storming: Widen<typeof STORMING>;
  readonly ramming: Widen<typeof RAMMING>;
  readonly helm: Widen<typeof HELM>;
  readonly purser: Widen<typeof PURSER>;
  readonly claimer: Widen<typeof CLAIMER>;
  readonly styles: Widen<typeof STYLES>;
}

/** The brain every ship in the game sails with. */
export const DEFAULT_BRAIN: Brain = {
  sight: SIGHT,
  mind: MIND,
  roaming: ROAMING,
  storming: STORMING,
  ramming: RAMMING,
  helm: HELM,
  purser: PURSER,
  claimer: CLAIMER,
  styles: STYLES,
};

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
