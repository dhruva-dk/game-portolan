// A team's call on its bots, in a race
// sailed by a card: free, attack, hold (our water), form (on the first ship of
// the team). A call biases the weights her brain already chooses by (bot.ts
// CHOICE, as her persona's crew has them): each of her options' weights times
// its number on CALLED, and nothing else of her choosing, so she still weighs
// every option herself and takes the one that scores best. Under form, besides,
// when she roams she roams about the first ship of her team afloat
// (roaming.ts), looking to her mark again every few seconds as that ship sails
// on. Her pit stops are her own: no call weighs them.
//
// Free is her brain as it is, to the bit. A called brain is made once for each
// brain and call, and kept, so every bot of one persona under one call shares
// it; and calling a called brain anew starts from the brain it was made of.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import type { Call } from '../race.ts';
import { variant, type Brain } from './brain.ts';
import type { Mode } from './captain.ts';

/**
 * What each call makes of her options' weights (times; an option not named is
 * left), and what a call to form makes of her roaming (roaming.ts ROAMING:
 * about her lead, a new mark every `roam` s).
 */
export const CALLED = {
  weights: {
    free: {},
    attack: { fight: 1.3, hunt: 1.6, flee: 0.85, claim: 0.6 },
    hold: { claim: 1.6, hunt: 0.5, loot: 0.8 },
    form: { roam: 4, hunt: 0.5, claim: 0.6, loot: 0.7 },
  } satisfies Record<Call, Partial<Record<Mode, number>>>,
  form: { lead: 1, roam: 3 },
} as const;

/** A brain's weights, each times its number in `by`. */
const weighed = (
  c: Brain['choice'],
  by: Partial<Record<Mode, number>>
): Brain['choice'] => ({
  storm: c.storm * (by.storm ?? 1),
  heal: c.heal * (by.heal ?? 1),
  flee: c.flee * (by.flee ?? 1),
  fight: c.fight * (by.fight ?? 1),
  hunt: c.hunt * (by.hunt ?? 1),
  loot: c.loot * (by.loot ?? 1),
  claim: c.claim * (by.claim ?? 1),
  pit: c.pit * (by.pit ?? 1),
  roam: c.roam * (by.roam ?? 1),
});

/** The called brains made, by the brain each was made of; and that brain, by each. */
const made = new WeakMap<Brain, Map<Call, Brain>>(),
  plain = new WeakMap<Brain, Brain>();

/**
 * `brain` under `call`: its options' weights biased by the call. Free, or a
 * call back to free, is the brain it was before a call was laid on it.
 */
export function called(brain: Brain, call: Call): Brain {
  const base = plain.get(brain) ?? brain;
  if (call === 'free') return base;
  let calls = made.get(base);
  if (!calls) made.set(base, (calls = new Map()));
  let b = calls.get(call);
  if (!b) {
    b = variant(
      {
        choice: weighed(base.choice, CALLED.weights[call]),
        roaming: call === 'form' ? CALLED.form : {},
      },
      base
    );
    calls.set(call, b);
    plain.set(b, base);
  }
  return b;
}
