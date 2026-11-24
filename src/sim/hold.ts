import { rankOf, type Rarity } from './kinds.ts';
import { healed, sunk, type Health } from './health.ts';
import type { ShipValues } from './setup.ts';
import { HEAL } from './tuning.ts';

export interface Hold {
  items: readonly (Rarity | null)[];
  using: { slot: number; left: number; of: number } | null;
}

export const emptyHold = (): Hold => ({
  items: Array.from({ length: HEAL.slots }, () => null),
  using: null,
});

export const restored = (
  heal: Rarity,
  values: Pick<ShipValues, 'hullPoints' | 'healFactor'>
): number => HEAL.restores[heal] * values.hullPoints * values.healFactor;

export function lowest(h: Hold): number {
  let at = -1;
  h.items.forEach((k, i) => {
    if (k === null || h.using?.slot === i) return;
    const held = h.items[at];
    if (at < 0 || (held && rankOf(k) < rankOf(held))) at = i;
  });
  return at;
}

export function stowing(h: Hold, heal: Rarity): number {
  const free = h.items.indexOf(null);
  if (free >= 0) return free;
  const low = lowest(h),
    held = h.items[low];
  return held && rankOf(heal) > rankOf(held) ? low : -1;
}

export function stowed(
  h: Hold,
  heal: Rarity
): { hold: Hold; slot: number; dropped: Rarity | null } | null {
  const slot = stowing(h, heal);
  if (slot < 0) return null;
  const items = [...h.items],
    dropped = items[slot];
  items[slot] = heal;
  return { hold: { ...h, items }, slot, dropped };
}

export const useful = (health: Health) =>
  !sunk(health) && health.hull < health.most;

export function begun(
  h: Hold,
  slot: number,
  health: Health,
  time: number
): Hold {
  if (h.using || !h.items[slot] || !useful(health)) return h;
  return { ...h, using: { slot, left: time, of: time } };
}

export function stepUse(
  h: Hold,
  health: Health,
  values: Pick<ShipValues, 'hullPoints' | 'healFactor'>,
  dt: number
): { hold: Hold; health: Health; done: Rarity | null } {
  if (!h.using) return { hold: h, health, done: null };
  const left = h.using.left - dt;
  if (left > 1e-9)
    return { hold: { ...h, using: { ...h.using, left } }, health, done: null };
  const slot = h.using.slot,
    heal = h.items[slot];
  if (!heal) return { hold: { ...h, using: null }, health, done: null };
  const items = [...h.items];
  items[slot] = null;
  return {
    hold: { items, using: null },
    health: healed(health, restored(heal, values), 'hull'),
    done: heal,
  };
}

export const progress = (h: Hold): number | null =>
  h.using ? 1 - h.using.left / h.using.of : null;
