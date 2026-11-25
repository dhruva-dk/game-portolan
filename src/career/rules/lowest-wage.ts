import { NEGOTIATION } from '../tuning.ts';

export function lowestWage(
  scoreAt: (wage: number) => number,
  target: number
): number | null {
  const { least, most, step } = NEGOTIATION.wage;
  const base = scoreAt(least);
  const perStep = scoreAt(least + step) - base;
  if (perStep <= 0) return base >= target ? least : null;
  let wage = least + Math.max(0, Math.ceil((target - base) / perStep)) * step;
  while (wage > least && scoreAt(wage - step) >= target) wage -= step;
  while (wage <= most && scoreAt(wage) < target) wage += step;
  return wage <= most ? wage : null;
}
