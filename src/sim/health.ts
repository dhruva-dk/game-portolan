// A ship's hit points: her hull, and the shield before it. A blow is taken by
// the shield first and what it can't hold goes on to the hull in the same blow;
// a blow that is past the shield (the storm's wear) goes to the hull alone. The
// shield never comes back by itself, only by healing, as the hull. At 0 hull
// she is sunk, and takes nothing more.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs.

import { HEALTH } from './handling.ts';

/**
 * Her hit points; and her most hull, where it is her own build's and not the
 * table's (a race sailed by a card: play/fitted.ts).
 */
export interface Health {
  hull: number;
  shield: number;
  most?: number;
}

/**
 * The hull a cap of `cap` on the table's hull (HEALTH.hull, if not given) is
 * on hers: the same share of her most.
 */
export const hullCap = (h: Health, cap: number = HEALTH.hull): number =>
  h.most === undefined ? cap : (cap * h.most) / HEALTH.hull;

/**
 * What a blow did: her health after it, what it took off the shield and off the
 * hull.
 */
interface Harm {
  health: Health;
  shield: number;
  hull: number;
}

/** A ship as she puts to sea. */
export const whole = (): Health => ({
  hull: HEALTH.hull,
  shield: HEALTH.start,
});

/** Sunk: no hull left. */
export const sunk = (h: Health) => h.hull <= 0;

/** Under these shares of her most hull she smokes, and smokes heavily. */
export const SMOKE = { light: 0.4, heavy: 0.25 } as const;

/** Her hull's wear, for her smoke: 0 whole enough, 1 smoking, 2 heavily. */
export const wearOf = (h: Health): 0 | 1 | 2 => {
  const share = h.hull / hullCap(h);
  return share < SMOKE.heavy ? 2 : share < SMOKE.light ? 1 : 0;
};

/** `damage` hit points dealt her, through the shield first unless `past` it. */
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

/**
 * `amount` hit points mended into her hull or her shield, up to `cap` (its most
 * by default; a hull's cap is on the table's hull, and is hers by hullCap);
 * nothing once sunk.
 */
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
