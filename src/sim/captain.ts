// What a bot is, shared by all her parts (bot.ts her mind, lookout.ts,
// storming.ts, fighting.ts, roaming.ts, tactician.ts, pilot.ts, helmsman.ts,
// gunner.ts, purser.ts, claimer.ts, hunter.ts, pitting.ts): what they all are
// tuned by, how she sees a ship, what she carries from one step to the next (each
// part's own, gathered), what she means, what a step of her weighs, and the few
// bits of the sphere and of chance they all reach for.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { add, along, cross, scale, type Vec3 } from '../world/sphere.ts';
import { random } from '../world/random.ts';
import { STEP } from './fixed.ts';
import { SHIP } from './handling.ts';
import type { Gunner } from './gunner.ts';
import type { ShipState } from './ship.ts';
import type { Chart, Field } from './route.ts';
import type { Depth } from './shoal.ts';
import type { Cap, Storm } from './storm.ts';
import type { Temper } from './temper.ts';
import type { Brain } from './brain.ts';
import type { Crew } from './battle.ts';
import type { Loot } from './loot.ts';
import type { ClaimMemory, Holdings } from './claimer.ts';
import type { MindMemory } from './bot.ts';
import type { MoodMemory } from './fighting.ts';
import type { HelmMemory } from './helmsman.ts';
import type { HuntMemory, Report } from './hunter.ts';
import type { LookMemory } from './lookout.ts';
import type { PilotMemory } from './pilot.ts';
import type { PlaceMemory } from './placing.ts';
import type { LogMemory } from './logbook.ts';
import type { PurseMemory } from './purser.ts';
import type { TacticMemory } from './tactician.ts';

/**
 * What every part of a bot shares: how often she thinks, and what water is open
 * to her. Each part keeps the rest of its tuning itself (brain.ts gathers
 * them).
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
 * hold and gust), without which she pays her stores no heed; and, in a race
 * sailed in teams, her team (none: she sails for herself).
 */
export interface Seen {
  id: number;
  ship: ShipState;
  shove?: Vec3;
  hull?: number;
  shield?: number;
  armed?: boolean;
  crew?: Crew;
  team?: number;
}

/**
 * What a bot knows of the sea besides the ships on it: how deep it is; its
 * chart (route.ts), without which she finds no routes round land, only feels
 * her way along it; the storm now (storm.ts), without which she pays it no
 * heed; and the loot on the water (loot.ts); and who holds it (territory.ts),
 * without which she claims none; and the guns ringing out (hunter.ts), without
 * which she hears none; and the chart's way into the calm, without which a
 * mark in it she finds no route to she makes for as near as the route goes.
 */
export interface Sea {
  depth: Depth;
  chart?: Chart | null;
  storm?: Storm | null;
  loot?: readonly Loot[];
  holdings?: Holdings | null;
  gunfire?: readonly Report[];
  calm?: Calm | null;
}

/**
 * The calm the storm closes to next, and the chart's field (route.ts) into its
 * heart (the water within `heart` m of its centre), found once a phase for
 * every ship.
 */
interface Calm {
  readonly cap: Cap;
  readonly field: Field;
  readonly heart: number;
}

export type Mode =
  | 'roam'
  | 'fight'
  | 'flee'
  | 'storm'
  | 'heal'
  | 'loot'
  | 'claim'
  | 'hunt'
  | 'pit';

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
 * written by that part alone: her mind's
 * (bot.ts), her mood (fighting.ts), her lookout's, her tactician's, pilot's and helm's, her
 * purser's, claimer's and hunter's, her place's, her log's, her gunner's; and her chance. This is the
 * crew's roster: a new part's memory is added here.
 */
export interface Memory
  extends Chance,
    MindMemory,
    LookMemory,
    TacticMemory,
    PilotMemory,
    HelmMemory,
    PurseMemory,
    ClaimMemory,
    HuntMemory,
    PlaceMemory,
    LogMemory,
    MoodMemory,
    Gunner {}

/**
 * What a think and a step weigh: her, the others afloat, the sea, her memory
 * (written to), her brain (each part reads its own slice: brain.ts) and
 * temperament, her foe as she sees her now and how far off, and her seed.
 */
export interface Ctx {
  own: Seen;
  others: readonly Seen[];
  sea: Sea;
  m: Memory;
  b: Brain;
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

/** The bearings round her she looks along for water, and how many rings out. */
const LOOKS = 8,
  RINGS = 3;
/**
 * The nearest water that is `mine` (by where it lies) within `reach` m of her,
 * on LOOKS bearings and RINGS rings: where she is, if she lies in it; null with
 * none open to her.
 */
export function waterNear(
  c: Ctx,
  reach: number,
  mine: (p: Vec3) => boolean
): Vec3 | null {
  const { ship } = c.own;
  if (mine(ship.at)) return ship.at;
  for (let r = 1; r <= RINGS; r++)
    for (let k = 0; k < LOOKS; k++) {
      const way = rotate(ship.at, ship.heading, (2 * Math.PI * k) / LOOKS),
        p = along(ship.at, way, (r * reach) / RINGS).p;
      if (mine(p) && open(c, p)) return p;
    }
  return null;
}

/**
 * Her mood now: her temperament's aggro, moved by what has befallen her (her
 * mind's heat: fighting.ts mood), 0–1.
 */
export const aggroOf = (c: Ctx) =>
  Math.min(1, Math.max(0, c.t.aggro + c.m.heat));

/**
 * Whether the ship `o` sails for her team (a race sailed in teams): no foe of
 * hers, never her mark, and no stranger to keep clear of.
 */
export const mate = (c: Ctx, o: Seen) =>
  c.own.team !== undefined && o.team === c.own.team;

/** Whether she saw her foe when she last looked. */
export const inSight = (c: Ctx) =>
  c.m.foe >= 0 && c.m.clock - c.m.seen < (BOT.every - 0.5) * STEP;
