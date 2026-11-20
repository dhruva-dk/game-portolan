// A ship's hit points: her hull, and the shield before it. A blow is taken by the shield first and what it can't hold
// goes on to the hull in the same blow; a blow that is past the shield (the storm's wear) goes to the hull alone.
// The shield never comes back by itself, only by healing, as the hull. At 0 hull she is sunk, and takes nothing more.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import { HEALTH } from './handling.ts';

/** Her hit points. */
export interface Health {
  hull: number;
  shield: number;
}

/** What a blow did: her health after it, what it took off the shield and off the hull. */
interface Harm {
  health: Health;
  shield: number;
  hull: number;
}

/** A ship as she puts to sea. */
export const whole = (): Health => ({ hull: HEALTH.hull, shield: HEALTH.start });

/** Sunk: no hull left. */
export const sunk = (h: Health) => h.hull <= 0;

/** `damage` hit points dealt her, through the shield first unless `past` it. */
export function harmed(h: Health, damage: number, past = false): Harm {
  if (sunk(h) || !(damage > 0)) return { health: h, shield: 0, hull: 0 };
  const shield = past ? 0 : Math.min(h.shield, damage);
  const hull = Math.min(h.hull, damage - shield);
  return { health: { hull: h.hull - hull, shield: h.shield - shield }, shield, hull };
}

/** `amount` hit points mended into her hull or her shield, up to `cap` (its most by default); nothing once sunk. */
export function healed(h: Health, amount: number, to: 'hull' | 'shield', cap: number = HEALTH[to]): Health {
  if (sunk(h) || !(amount > 0) || h[to] >= cap) return h;
  return { ...h, [to]: Math.min(cap, h[to] + amount) };
}
