// The rules the harness can run a match under, by name: variants of the game's
// loot and storm tables (sim/rules.ts), apart from the brains (brains.ts), as
// they are the game's rules and not a mind's. Each is a change made on the
// rules its match type deals (sim/persona.ts TYPES), as a share of their own
// where it can be, so a bloodbath under `sparse` is still a bloodbath, with
// less on the water.
//   node tools/harness/cli.ts --rules sparse
//
// Node only (tools/).

import { dealt, type MatchType } from '../../src/sim/persona.ts';
import { ruled, type Rules } from '../../src/sim/rules.ts';

type Over = Parameters<typeof ruled>[0];

/** The variants by name: what each changes of the rules it is given. */
export const RULES: Record<string, (r: Rules) => Over> = {
  /** The game's rules as the match type deals them. */
  default: () => ({}),
  /** A third fewer spots of loot. */
  sparse: ({ loot }) => ({ loot: { spots: Math.round(loot.spots * (2 / 3)) } }),
  /** Half as many spots again. */
  rich: ({ loot }) => ({ loot: { spots: Math.round(loot.spots * 1.5) } }),
  /** Guns a third as rare on the water. */
  gunless: ({ loot }) => ({ loot: { gun: loot.gun * (2 / 3) } }),
  /** Rarer guns twice as likely, the commonest half. */
  rare: ({ loot: { weights: w } }) => ({
    loot: {
      weights: [w[0] / 2, w[1] / Math.SQRT2, w[2], w[3] * Math.SQRT2, w[4] * 2],
    },
  }),
  /** The storm waits two thirds as long at each phase. */
  quick: ({ storm }) => ({
    storm: {
      phases: storm.phases.map((p) => ({ ...p, wait: p.wait * (2 / 3) })),
    },
  }),
};

/**
 * Each match's type by its seed, as `typeOf` deals it (the game's way if not
 * given), its rules changed by the variant `name`; `typeOf` as it was if no
 * variant is named, so a run without one is the game's to the bit.
 */
export function ruledBy(
  typeOf: ((seed: number) => MatchType) | undefined,
  name?: string
): ((seed: number) => MatchType) | undefined {
  if (name === undefined) return typeOf;
  const change = RULES[name];
  if (!change)
    throw new Error(`no rules "${name}" (${Object.keys(RULES).join(', ')})`);
  const of = typeOf ?? dealt;
  return (seed) => {
    const t = of(seed);
    return { ...t, rules: ruled(change(t.rules), t.rules) };
  };
}
