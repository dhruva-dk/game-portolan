// What a bot is, shared by all her parts (bot.ts her mind, tactician.ts,
// pilot.ts, helmsman.ts, gunner.ts, purser.ts, claimer.ts): what they all are
// tuned by, how she sees a ship, what she carries from one step to the next (each
// part's own, gathered), what she means, what a step of her weighs, and the few
// bits of the sphere and of chance they all reach for.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { add, cross, scale, type Vec3 } from '../world/sphere.ts';
import { random } from '../world/random.ts';
import { STEP } from './fixed.ts';
import { SHIP } from './handling.ts';
import type { Gunner } from './gunner.ts';
import type { ShipState } from './ship.ts';
import type { Chart } from './route.ts';
import type { Depth } from './shoal.ts';
import type { Storm } from './storm.ts';
import type { Temper } from './temper.ts';
import type { Crew } from './battle.ts';
import type { Loot } from './loot.ts';
import type { ClaimMemory, Holdings } from './claimer.ts';
import type { MindMemory } from './bot.ts';
import type { HelmMemory } from './helmsman.ts';
import type { PilotMemory } from './pilot.ts';
import type { PurseMemory } from './purser.ts';
import type { TacticMemory } from './tactician.ts';

/**
 * What every part of a bot shares: how often she thinks, and what water is open
 * to her. Each part keeps the rest of its tuning itself (bot.ts SIGHT, MIND,
 * ROAM and STORMING; helmsman.ts HELM and RAMMING).
 */
export const BOT = {
  /** Think every this many steps (0.2 s). */
  every: 6,
  /** Water open to her: this deep past her draught. */
  open: 0.3,
} as const;

/**
 * A ship as a bot sees her: who she is, how she sails, the shove she is carried
 * on by, her hull and shield (health.ts; whole and none when not given), and
 * whether she carries a gun; and her own, what she carries (battle.ts Crew: her
 * hold and gust), without which she pays her stores no heed.
 */
export interface Seen {
  id: number;
  ship: ShipState;
  shove?: Vec3;
  hull?: number;
  shield?: number;
  armed?: boolean;
  crew?: Crew;
}

/**
 * What a bot knows of the sea besides the ships on it: how deep it is; its
 * chart (route.ts), without which she finds no routes round land, only feels
 * her way along it; the storm now (storm.ts), without which she pays it no
 * heed; and the loot on the water (loot.ts); and who holds it (territory.ts),
 * without which she claims none.
 */
export interface Sea {
  depth: Depth;
  chart?: Chart | null;
  storm?: Storm | null;
  loot?: readonly Loot[];
  holdings?: Holdings | null;
}

export type Mode =
  | 'roam'
  | 'fight'
  | 'flee'
  | 'storm'
  | 'heal'
  | 'loot'
  | 'claim';

/**
 * What she means, as her mind hands it to her tactician (tactician.ts): where
 * she means to be, the ship she means to fight (-1: none), and whether she
 * makes for her goal `gently` (easing up near it, as for loot or mending) or
 * `through` it.
 */
export interface Intent {
  goal: Vec3;
  foe: number;
  arrive: 'through' | 'gently';
}

/** Her random draws' state: written by roll alone. */
interface Chance {
  rand: number;
}

/**
 * What a bot carries from one step to the next: each part's own, declared and
 * written by that part alone (tests/architecture-bots.test.ts): her mind's
 * (bot.ts), her tactician's, pilot's and helm's, her purser's and claimer's,
 * her gunner's; and her chance.
 */
export interface Memory
  extends Chance,
    MindMemory,
    TacticMemory,
    PilotMemory,
    HelmMemory,
    PurseMemory,
    ClaimMemory,
    Gunner {}

/**
 * What a think and a step weigh: her, the others afloat, the sea, her memory
 * (written to), her temperament, her foe as she sees her now and how far off,
 * and her seed.
 */
export interface Ctx {
  own: Seen;
  others: readonly Seen[];
  sea: Sea;
  m: Memory;
  t: Temper;
  foe: Seen | null;
  foeD: number;
  seed: number;
}

// ---------------------------------------------------------------- the sphere

/** Tangent t at p turned `a` radians to port. */
export const rotate = (p: Vec3, t: Vec3, a: number): Vec3 =>
  add(scale(t, Math.cos(a)), cross(p, t), Math.sin(a));
/**
 * A ship's way through the water and her shove: m/s, a tangent at her place.
 */
export const velocity = (o: Seen): Vec3 =>
  add(scale(o.ship.heading, o.ship.speed), o.shove ?? [0, 0, 0]);

// ---------------------------------------------------------------- chance and
// the water

/** A number 0..1 fixed by its two keys, for a choice made once and kept. */
export const unitHash = (a: number, b: number) =>
  random((Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca6b)) >>> 0)();
/** Her next draw, 0..1. */
export const roll = (m: Memory) => {
  const r = random(m.rand)();
  m.rand = (m.rand + 0x6d2b79f5) >>> 0;
  return r;
};
export const between = (m: Memory, lo: number, hi: number) =>
  lo + (hi - lo) * roll(m);

/** Whether the water at p is open to her. */
export const open = (c: Ctx, p: Vec3) =>
  c.sea.depth(p) >= SHIP.draught + BOT.open;

/** Whether she saw her foe when she last looked. */
export const inSight = (c: Ctx) =>
  c.m.foe >= 0 && c.m.clock - c.m.seen < (BOT.every - 0.5) * STEP;
