import { TYPES, type MatchType } from '../../src/sim/persona.ts';

export function typeNamed(
  name?: string
): ((seed: number) => MatchType) | undefined {
  if (name === undefined) return undefined;
  const t = TYPES.find((k) => k.name === name);
  if (!t)
    throw new Error(
      `no match type ${name}: ${TYPES.map((k) => k.name).join(', ')}`
    );
  return () => t;
}
