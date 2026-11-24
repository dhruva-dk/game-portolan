import type { Use } from './kinds.ts';
import { healed, sunk, type Health } from './health.ts';

export type { Use };

export const USES: Readonly<
  Record<
    Use,
    { shield: number; hull: number; cap: number; time: number; stack: number }
  >
> = {
  smallShield: { shield: 25, hull: 0, cap: 50, time: 1, stack: 6 },
  bigShield: { shield: 50, hull: 0, cap: 100, time: 2.6, stack: 3 },
  repairKit: { shield: 0, hull: 15, cap: 75, time: 1.8, stack: 8 },
  fullRepair: { shield: 0, hull: 100, cap: 100, time: 5, stack: 2 },
};

export const USING = 0.6;

const PERCENT = 100;
const hullTop = (health: Health, cap: number) => (cap * health.most) / PERCENT;

const SLOTS = 3;

interface Stack {
  kind: Use;
  count: number;
}

export interface Hold {
  items: readonly (Stack | null)[];
  chosen: number;
  using: { slot: number; left: number } | null;
}

export const emptyHold = (): Hold => ({
  items: Array.from({ length: SLOTS }, () => null),
  chosen: 0,
  using: null,
});

export function roomFor(h: Hold, kind: Use): number {
  const i = h.items.findIndex(
    (s) => s && s.kind === kind && s.count < USES[kind].stack
  );
  return i >= 0 ? i : h.items.findIndex((s) => s === null);
}

export function stowed(
  h: Hold,
  kind: Use,
  count: number
): { hold: Hold; left: number } {
  const items = [...h.items];
  let n = count;
  while (n > 0) {
    const i = roomFor({ ...h, items }, kind);
    if (i < 0) break;
    const had = items[i]?.count ?? 0,
      take = Math.min(n, USES[kind].stack - had);
    items[i] = { kind, count: had + take };
    n -= take;
  }
  return { hold: { ...h, items }, left: n };
}

export const useful = (health: Health, kind: Use) => {
  const u = USES[kind];
  return (
    !sunk(health) &&
    (u.shield > 0
      ? health.shield < u.cap
      : health.hull < hullTop(health, u.cap))
  );
};

export function tapped(h: Hold, slot: number, health: Health): Hold {
  if (slot < 0 || slot > SLOTS) return h;
  if (slot !== h.chosen) return { ...h, chosen: slot, using: null };
  return slot === 0 ? h : begun(h, slot, health);
}

export function begun(h: Hold, slot: number, health: Health): Hold {
  const s = h.items[slot - 1];
  if (h.using || !s || s.count <= 0 || !useful(health, s.kind)) return h;
  return { ...h, chosen: slot, using: { slot, left: USES[s.kind].time } };
}

export const broken = (h: Hold): Hold => (h.using ? { ...h, using: null } : h);

export function stepUse(
  h: Hold,
  health: Health,
  dt: number
): { hold: Hold; health: Health; done: Use | null } {
  if (!h.using) return { hold: h, health, done: null };
  const left = h.using.left - dt;
  if (left > 1e-9)
    return { hold: { ...h, using: { ...h.using, left } }, health, done: null };
  const i = h.using.slot - 1,
    s = h.items[i];
  if (!s) return { hold: { ...h, using: null }, health, done: null };
  const u = USES[s.kind];
  const mended =
    u.shield > 0
      ? healed(health, u.shield, 'shield', u.cap)
      : healed(health, u.hull, 'hull', hullTop(health, u.cap));
  const items = [...h.items];
  items[i] = s.count > 1 ? { ...s, count: s.count - 1 } : null;
  return { hold: { ...h, items, using: null }, health: mended, done: s.kind };
}

export function progress(h: Hold): number | null {
  if (!h.using) return null;
  const s = h.items[h.using.slot - 1];
  return s ? 1 - h.using.left / USES[s.kind].time : null;
}
