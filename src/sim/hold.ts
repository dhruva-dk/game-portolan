// A ship's hold: besides her one gun (gun.ts), three slots of things to mend with, 0117's consumables (src/sim/items.ts,
// tables.ts USES) with its numbers. A slot holds a stack of one kind, up to that kind's most; what she picks up goes
// onto a stack of its kind with room, or else into an empty slot (0117's roomFor and give).
//
// Using one takes its time (0117's useTime), and as it is used she sails at USING of her speed (0117's SHIP.using; the
// game and the bots ask it of her helm). When it is done it tops up her shield or mends her hull by its amount, up to
// its cap, and one is gone from the stack. One that would do nothing is not begun (0117's useful): a shield at its cap,
// a hull at its. A blow that strikes (a ball or a ram, not the storm's steady wear: 0117's interrupt and steady), or
// her choosing another slot, breaks it off and nothing is spent.
//
// The slot in hand (`chosen`): 0 her gun's, 1–3 the items'. Her gun fires by its own button whatever is in hand; the
// slot in hand is the one a second tap uses (0117's hotbar: a tap chooses, a tap on the chosen uses).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import type { Use } from '../kinds.ts';
import { HEALTH } from './handling.ts';
import { healed, sunk, type Health } from './health.ts';

/** What mends: 0117's four consumables (kinds.ts). */
export type { Use };

/** 0117's consumables (tables.ts USES): the shield or hull each gives, the cap it gives up to, its time (s), and the
 *  most of it a slot holds. */
export const USES: Readonly<Record<Use, { shield: number; hull: number; cap: number; time: number; stack: number }>> = {
  smallShield: { shield: 25, hull: 0, cap: 50, time: 1, stack: 6 },
  bigShield: { shield: 50, hull: 0, cap: 100, time: 2.6, stack: 3 },
  repairKit: { shield: 0, hull: 15, cap: 75, time: 1.8, stack: 8 },
  fullRepair: { shield: 0, hull: 100, cap: 100, time: 5, stack: 2 },
};

/** Her speed while she mends, as a share of what she asks (0117's SHIP.using). */
export const USING = 0.6;

/** The item slots. */
export const SLOTS = 3;

/** A stack in a slot. */
export interface Stack { kind: Use; count: number }

/** The hold: the item slots (null: empty), the slot in hand (0 the gun's, then the items'), and what she is using:
 *  the slot, and seconds left. */
export interface Hold { items: readonly (Stack | null)[]; chosen: number; using: { slot: number; left: number } | null }

/** An empty hold, her gun's slot in hand. */
export const emptyHold = (): Hold => ({ items: Array.from({ length: SLOTS }, () => null), chosen: 0, using: null });

/** Where some of `kind` would go: a stack of it with room, else an empty slot; -1 if neither (0117's roomFor). As an
 *  index into the items. */
export function roomFor(h: Hold, kind: Use): number {
  const i = h.items.findIndex((s) => s && s.kind === kind && s.count < USES[kind].stack);
  return i >= 0 ? i : h.items.findIndex((s) => s === null);
}

/** `count` of `kind` put in the hold, as much as fits: the hold after, and how many are left over (0117's give). */
export function stowed(h: Hold, kind: Use, count: number): { hold: Hold; left: number } {
  const items = [...h.items];
  let n = count;
  while (n > 0) {
    const i = roomFor({ ...h, items }, kind);
    if (i < 0) break;
    const had = items[i]?.count ?? 0, take = Math.min(n, USES[kind].stack - had);
    items[i] = { kind, count: had + take };
    n -= take;
  }
  return { hold: { ...h, items }, left: n };
}

/** The most a use of `kind` mends her to: its cap, and a hull's no more than her own most (`most`, fit.ts). */
const capOf = (kind: Use, most: number) => (USES[kind].shield > 0 ? USES[kind].cap : Math.min(USES[kind].cap, most));

/** Whether using `kind` would do anything for her now (0117's useful), her most hull `most`. */
export const useful = (health: Health, kind: Use, most: number = HEALTH.hull) =>
  !sunk(health) && (USES[kind].shield > 0 ? health.shield : health.hull) < capOf(kind, most);

/** What a tap on slot `slot` (0 the gun's, 1–3 the items') does (0117's hotbar): another slot is taken in hand,
 *  breaking off what she is using; the slot in hand, if it holds something that would mend her, is begun. */
export function tapped(h: Hold, slot: number, health: Health, most: number = HEALTH.hull): Hold {
  if (slot < 0 || slot > SLOTS) return h;
  if (slot !== h.chosen) return { ...h, chosen: slot, using: null };
  return slot === 0 ? h : begun(h, slot, health, most);
}

/** Item slot `slot` (1–3) begun, if it holds something that would mend her and she isn't using anything. */
export function begun(h: Hold, slot: number, health: Health, most: number = HEALTH.hull): Hold {
  const s = h.items[slot - 1];
  if (h.using || !s || s.count <= 0 || !useful(health, s.kind, most)) return h;
  return { ...h, chosen: slot, using: { slot, left: USES[s.kind].time } };
}

/** What she is using broken off (a blow struck her). */
export const broken = (h: Hold): Hold => (h.using ? { ...h, using: null } : h);

/** dt seconds of using: once it is done, its shield or hull given her (her hull no more than `most`) and one gone from
 *  its stack. The hold and her health after. */
export function stepUse(h: Hold, health: Health, dt: number, most: number = HEALTH.hull): { hold: Hold; health: Health; done: Use | null } {
  if (!h.using) return { hold: h, health, done: null };
  const left = h.using.left - dt;
  if (left > 1e-9) return { hold: { ...h, using: { ...h.using, left } }, health, done: null };
  const i = h.using.slot - 1, s = h.items[i];
  if (!s) return { hold: { ...h, using: null }, health, done: null };
  const u = USES[s.kind];
  const mended = u.shield > 0 ? healed(health, u.shield, 'shield', u.cap) : healed(health, u.hull, 'hull', capOf(s.kind, most));
  const items = [...h.items];
  items[i] = s.count > 1 ? { ...s, count: s.count - 1 } : null;
  return { hold: { ...h, items, using: null }, health: mended, done: s.kind };
}

/** How far through what she is using she is, 0…1, or null. */
export function progress(h: Hold): number | null {
  if (!h.using) return null;
  const s = h.items[h.using.slot - 1];
  return s ? 1 - h.using.left / USES[s.kind].time : null;
}
