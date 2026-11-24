import { HEALTH } from './handling.ts';

export interface Health {
  hull: number;
  shield: number;
  most?: number;
}

export const hullCap = (h: Health, cap: number = HEALTH.hull): number =>
  h.most === undefined ? cap : (cap * h.most) / HEALTH.hull;

interface Harm {
  health: Health;
  shield: number;
  hull: number;
}

export const whole = (): Health => ({
  hull: HEALTH.hull,
  shield: HEALTH.start,
});

export const sunk = (h: Health) => h.hull <= 0;

export const SMOKE = { light: 0.4, heavy: 0.25 } as const;

export const wearOf = (h: Health): 0 | 1 | 2 => {
  const share = h.hull / hullCap(h);
  return share < SMOKE.heavy ? 2 : share < SMOKE.light ? 1 : 0;
};

export function harmed(h: Health, damage: number, past = false): Harm {
  if (sunk(h) || !(damage > 0)) return { health: h, shield: 0, hull: 0 };
  const shield = past ? 0 : Math.min(h.shield, damage);
  const hull = Math.min(h.hull, damage - shield);
  return {
    health: { ...h, hull: h.hull - hull, shield: h.shield - shield },
    shield,
    hull,
  };
}

export function healed(
  h: Health,
  amount: number,
  to: 'hull' | 'shield',
  cap: number = HEALTH[to]
): Health {
  const top = to === 'hull' ? hullCap(h, cap) : cap;
  if (sunk(h) || !(amount > 0) || h[to] >= top) return h;
  return { ...h, [to]: Math.min(top, h[to] + amount) };
}
