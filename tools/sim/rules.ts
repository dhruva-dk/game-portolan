import { dealt, type MatchType } from '../../src/sim/persona.ts';
import { ruled, type Rules } from '../../src/sim/rules.ts';

type Over = Parameters<typeof ruled>[0];

export const RULES: Record<string, (r: Rules) => Over> = {
  default: () => ({}),
  sparse: ({ loot }) => ({ loot: { spots: Math.round(loot.spots * (2 / 3)) } }),
  rich: ({ loot }) => ({ loot: { spots: Math.round(loot.spots * 1.5) } }),
  gunless: ({ loot }) => ({ loot: { gun: loot.gun * (2 / 3) } }),
  rare: ({ loot: { weights: w } }) => ({
    loot: {
      weights: [w[0] / 2, w[1] / Math.SQRT2, w[2], w[3] * Math.SQRT2, w[4] * 2],
    },
  }),
  noAssist: ({ aim }) => ({ aim: { assist: aim.assist.map(() => 0) } }),
  quick: ({ storm }) => ({
    storm: {
      phases: storm.phases.map((p) => ({ ...p, wait: p.wait * (2 / 3) })),
    },
  }),
};

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
