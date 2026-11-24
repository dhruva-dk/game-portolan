import type { GunKind, LootKind } from '../sim/kinds.ts';
import type { Cap } from '../sim/storm.ts';
import type { ReadCells } from '../world/cells.ts';
import type { ShipPose } from '../world/pose.ts';
import type { Vec3 } from '../world/sphere.ts';
import { lookAt, type Turn } from '../world/turn.ts';

export interface Eye {
  kind: 'air' | 'space';
  position: Vec3;
  orientation: Turn;
  fov: number;
  center?: readonly [number, number];
  size?: number;
}

export const AIR_FOV = 50;

export interface Look {
  paint: Vec3;
  sail: Vec3;
  pattern: 'plain' | 'band' | 'stripes';
}

export const SAIL_MARKS = {
  arm: 0.13,
  flare: 0.34,
  reach: 0.66,
  band: [0.36, 0.64],
  stripes: 5,
  fringe: 0.2,
} as const;

export interface ShipDraw {
  id: number;
  pose: ShipPose;
  look: Look;
  velocity: Vec3;
  afloat: boolean;
  gun: { kind: GunKind; rarity: number; aim: Vec3 } | null;
  wear: 0 | 1 | 2;
}

export type Blast =
  | { kind: 'shot'; time: number; from: Vec3; dir: Vec3; gun: GunKind }
  | { kind: 'splash'; time: number; at: Vec3; land: boolean; gun: GunKind }
  | {
      kind: 'strike';
      time: number;
      at: Vec3;
      ram: boolean;
      shield: boolean;
      broke: boolean;
    }
  | { kind: 'sink'; time: number; at: Vec3 };

export interface BallDraw {
  at: Vec3;
  way: Vec3;
  gun: GunKind;
  to: Vec3;
}

export interface LootDraw {
  id: number;
  at: Vec3;
  kind: LootKind;
  rarity: number;
  born: number;
}

export type SeaChange =
  | { seq: number; time: number; kind: 'paint'; ship: number; cells: ReadCells }
  | {
      seq: number;
      time: number;
      kind: 'claim';
      ship: number;
      cells: ReadCells;
      loop: number;
    }
  | {
      seq: number;
      time: number;
      kind: 'home';
      ship: number;
      cells: ReadCells;
      at: Vec3;
    }
  | {
      seq: number;
      time: number;
      kind: 'drain';
      ship: number | null;
      cells: ReadCells;
    };

export interface Sea {
  generation: number;
  owner: ReadCells;
  seq: number;
  changes: readonly SeaChange[];
  colors: readonly Vec3[];
}

export interface StormDraw extends Cap {
  closing: boolean;
}

export interface Snapshot {
  eye: Eye;
  clock: number;
  storm: StormDraw;
  ships: readonly ShipDraw[];
  own: number | null;
  balls: readonly BallDraw[];
  loot: readonly LootDraw[];
  blasts: readonly Blast[];
  sea?: Sea;
}

export function bearingFrom(eye: Eye, p: Vec3): number {
  const [qx, qy, qz, qw] = eye.orientation;
  const vx = p[0] - eye.position[0],
    vy = p[1] - eye.position[1],
    vz = p[2] - eye.position[2];
  const tx = 2 * -(qy * vz - qz * vy),
    ty = 2 * -(qz * vx - qx * vz),
    tz = 2 * -(qx * vy - qy * vx);
  const x = vx + qw * tx + -(qy * tz - qz * ty),
    z = vz + qw * tz + -(qx * ty - qy * tx);
  return Math.atan2(x, -z);
}

export const lookingAt = (eye: Vec3, at: Vec3, up: Vec3): Turn =>
  lookAt(eye, at, up);
