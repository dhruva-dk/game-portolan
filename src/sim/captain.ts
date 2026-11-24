import { add, cross, scale, type Vec3 } from '../world/sphere.ts';
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

export const BOT = { every: 6, open: 0.3 } as const;

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

export interface Sea {
  depth: Depth;
  chart?: Chart | null;
  storm?: Storm | null;
  loot?: readonly Loot[];
  holdings?: Holdings | null;
  gunfire?: readonly Report[];
  calm?: Calm | null;
}

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
  | 'hunt';

export interface Intent {
  goal: Vec3;
  foe: number;
  arrive: 'through' | 'gently';
}

interface Chance {
  rand: number;
}

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

export const rotate = (p: Vec3, t: Vec3, a: number): Vec3 =>
  add(scale(t, Math.cos(a)), cross(p, t), Math.sin(a));
export const velocity = (o: Seen): Vec3 =>
  add(scale(o.ship.heading, o.ship.speed), o.shove ?? [0, 0, 0]);

export const unitHash = (a: number, b: number) =>
  random((Math.imul(a, 0x9e3779b1) ^ Math.imul(b, 0x85ebca6b)) >>> 0)();
export const roll = (m: Memory) => {
  const r = random(m.rand)();
  m.rand = (m.rand + 0x6d2b79f5) >>> 0;
  return r;
};
export const between = (m: Memory, lo: number, hi: number) =>
  lo + (hi - lo) * roll(m);

export const open = (c: Ctx, p: Vec3) =>
  c.sea.depth(p) >= SHIP.draft + BOT.open;

export const aggroOf = (c: Ctx) =>
  Math.min(1, Math.max(0, c.t.aggro + c.m.heat));

export const mate = (c: Ctx, o: Seen) =>
  c.own.team !== undefined && o.team === c.own.team;

export const inSight = (c: Ctx) =>
  c.m.foe >= 0 && c.m.clock - c.m.seen < (BOT.every - 0.5) * STEP;
