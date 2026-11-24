import { GUST } from './handling.ts';

export interface Gust {
  charges: number;
  recharge: number;
  blowing: number;
}

export const gustOf = (): Gust => ({
  charges: GUST.charges,
  recharge: 0,
  blowing: 0,
});

export const ready = (g: Gust) => g.charges > 0 && g.blowing <= 0;

export function spent(g: Gust): { gust: Gust; blew: boolean } {
  if (!ready(g)) return { gust: g, blew: false };
  return {
    gust: { ...g, charges: g.charges - 1, blowing: GUST.time },
    blew: true,
  };
}

export function stepGust(g: Gust, dt: number): Gust {
  const blowing = Math.max(0, g.blowing - dt);
  if (g.charges >= GUST.charges)
    return { charges: g.charges, recharge: 0, blowing };
  const recharge = g.recharge + dt;
  return recharge >= GUST.recharge
    ? { charges: g.charges + 1, recharge: 0, blowing }
    : { charges: g.charges, recharge, blowing };
}

export const charging = (g: Gust) =>
  g.charges >= GUST.charges ? 1 : g.recharge / GUST.recharge;
