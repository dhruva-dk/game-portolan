import type { Crew } from './battle.ts';
import { HOLDING } from './handling.ts';
import { healed } from './health.ts';
import type { Cap } from './storm.ts';

interface Shares {
  share(id: number): number;
}

export const calmShare = (share: number, cap: Cap) =>
  cap.radius >= Math.PI
    ? share
    : Math.min(1, share / ((1 - Math.cos(cap.radius)) / 2));

export const regainRate = (share: number) =>
  HOLDING.shield * Math.min(1, share / HOLDING.full);

export interface Regained {
  id: number;
  shield: number;
}

export function regain(
  crews: readonly Crew[],
  afloat: readonly number[],
  held: Shares,
  cap: Cap,
  dt: number
): { crews: Crew[]; regained: Regained[] } {
  const regained: Regained[] = [];
  const after = crews.map((c) => {
    if (!afloat.includes(c.id)) return c;
    const rate = regainRate(calmShare(held.share(c.id), cap));
    if (rate <= 0) return c;
    const health = healed(c.health, rate * dt, 'shield');
    if (health === c.health) return c;
    regained.push({ id: c.id, shield: health.shield - c.health.shield });
    return { ...c, health };
  });
  return { crews: after, regained };
}
