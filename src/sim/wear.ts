// A ship's parts in a race (#58 step 7, D11): six parts feed her seven handling numbers, their performance already in
// the card's handling. Each part's condition starts at the card's (race.ts Fitted) and wears through the race: a share
// a second by her captain's Seamanship, and a share for every hull point she loses. At launch each part draws the
// condition it fails at, uniform in [0, 1 − reliability] (reliability 1 never fails), seeded by the race, the ship and
// the part. Failed, a part's fault multiplies her handling until the flight (flight.ts) repairs it, when its condition
// is set a little over the threshold it failed at, to wear on again.
//
// | Part    | Handling        | Fault                                       |
// | sails   | top             | torn: top × 0.7                             |
// | rigging | gather          | fouled: gather × 0.5                        |
// | rudder  | turn, answer    | jammed: turn × 0.6                          |
// | hull    | hull            | sprung plank: a hull point lost a second    |
// | keel    | spread          | loose ballast: spread × 1.5                 |
// | mounts  | reload          | seized: reload × 1.5                        |
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import type { Fitted, Handling, PartType } from '../race.ts';
import { hash, random } from '../world/random.ts';
import { WEAR } from './handling.ts';
import { harmed, type Health } from './health.ts';

/** The six parts, in the card's order. */
export const PART_TYPES: readonly PartType[] = ['sails', 'rigging', 'rudder', 'hull', 'keel', 'mounts'];

/** A part as she sails: its type, its condition now (0–1), the condition it fails below, and whether it has failed. */
export interface Part { type: PartType; condition: number; threshold: number; failed: boolean }

/** Her parts as she puts to sea in the race of `seed`, ship `id`: each at the card's condition, its threshold drawn. */
export function fitOut(fitted: readonly Fitted[], seed: number, id: number): Part[] {
  return fitted.map((f) => {
    const draw = random(hash(hash(seed, id), PART_TYPES.indexOf(f.type)))();
    return { type: f.type, condition: f.condition, threshold: draw * (1 - f.reliability), failed: false };
  });
}

/** How much a part's condition falls a second, for a captain of Seamanship `u` (her stat over 20, 0–1). */
export const wearRate = (u: number) => (WEAR.base - u) / WEAR.per;

/** dt seconds on, her captain's Seamanship `u` (her stat over 20, 0–1), `lost` hull points lost in them: each part worn, and the
 *  types that failed in them. */
export function worn(parts: readonly Part[], dt: number, u: number, lost: number): { parts: Part[]; failed: PartType[] } {
  const by = wearRate(u) * dt + WEAR.hull * Math.max(0, lost), failed: PartType[] = [];
  const after = parts.map((p) => {
    const condition = Math.max(0, p.condition - by);
    if (p.failed || condition >= p.threshold) return { ...p, condition };
    failed.push(p.type);
    return { ...p, condition, failed: true };
  });
  return { parts: after, failed };
}

/** A failed part repaired: its condition set WEAR.after over its threshold. */
export const repaired = (p: Part): Part => ({ ...p, failed: false, condition: Math.min(1, p.threshold + WEAR.after) });

/** Whether a part of `type` has failed. */
export const failedOf = (parts: readonly Part[], type: PartType) => parts.some((p) => p.type === type && p.failed);

/** Her handling with her faults: `base` (the card's) multiplied by each failed part's (the hull's leaks instead). */
export function faulted(base: Handling, parts: readonly Part[]): Handling {
  if (!parts.some((p) => p.failed)) return base;
  const f = (type: PartType, k: number) => (failedOf(parts, type) ? k : 1);
  return {
    ...base,
    top: base.top * f('sails', WEAR.torn), gather: base.gather * f('rigging', WEAR.fouled), turn: base.turn * f('rudder', WEAR.jammed),
    spread: base.spread * f('keel', WEAR.ballast), reload: base.reload * f('mounts', WEAR.seized),
  };
}

/** dt seconds of a sprung plank: WEAR.plank hull points a second, past the shield, never below WEAR.floor. */
export function leaked(h: Health, parts: readonly Part[], dt: number): Health {
  if (!failedOf(parts, 'hull') || h.hull <= WEAR.floor) return h;
  return harmed(h, Math.min(WEAR.plank * dt, h.hull - WEAR.floor), true).health;
}
