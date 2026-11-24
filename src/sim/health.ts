import { SHIELD } from './tuning.ts';

export interface Health {
  hull: number;
  shield: number;
  most: number;
}

interface Harm {
  health: Health;
  shield: number;
  hull: number;
}

export const whole = (most: number): Health => ({
  hull: most,
  shield: SHIELD.start,
  most,
});

export const sunk = (h: Health) => h.hull <= 0;

export const SMOKE = { light: 0.4, heavy: 0.25 } as const;

export const wearOf = (h: Health): 0 | 1 | 2 => {
  const share = h.hull / h.most;
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
  to: 'hull' | 'shield'
): Health {
  const cap = to === 'hull' ? h.most : SHIELD.most;
  if (sunk(h) || !(amount > 0) || h[to] >= cap) return h;
  return { ...h, [to]: Math.min(cap, h[to] + amount) };
}
