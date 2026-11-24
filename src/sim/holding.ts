import type { Crew } from './battle.ts';
import { SHIELD } from './tuning.ts';
import { healed } from './health.ts';
import type { Cap } from './storm.ts';

interface Shares {
  share(id: number): number;
}

export const calmShare = (share: number, cap: Cap) =>
  cap.radius >= Math.PI
    ? share
    : Math.min(1, share / ((1 - Math.cos(cap.radius)) / 2));

export const regainRate = (share: number, rate: number) =>
  rate * Math.min(1, share / SHIELD.held);

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
    const rate = regainRate(
      calmShare(held.share(c.id), cap),
      c.values.shieldRate
    );
    if (rate <= 0) return c;
    const health = healed(c.health, rate * dt, 'shield');
    if (health === c.health) return c;
    regained.push({ id: c.id, shield: health.shield - c.health.shield });
    return { ...c, health };
  });
  return { crews: after, regained };
}
