import { Vector3 } from 'three/webgpu';
import { clamp, smoothstep } from '../world/scalar.ts';
import { V } from './kit.ts';

export const SCALE = 0.6;

export const LEN = 30,
  BEAM = 8.6;
const DRAFT = 3.3;
const YB = 1.1;

export const zAt = (s: number): number => (s - 0.5) * LEN;

export const keel = (s: number): number =>
  -DRAFT * (1 - 0.9 * smoothstep(0.6, 1.02, s) ** 1.7) +
  0.25 * (1 - smoothstep(0, 0.15, s));

export const mainDeck = (s: number): number => 2.45 + 1.4 * (s - 0.55) ** 2;

export const LEVELS = [
  { name: 'poop', a: 0, b: 0.15, rise: 4.3 },
  { name: 'quarter', a: 0.15, b: 0.385, rise: 2.15 },
  { name: 'waist', a: 0.385, b: 0.785, rise: 0 },
  { name: 'fore', a: 0.785, b: 0.985, rise: 2.25 },
] as const;
type Level = (typeof LEVELS)[number];
const foreRise = (s: number) => 0.7 * smoothstep(0.785, 1, s);
const levelAt = (s: number): Level => LEVELS.find((l) => s <= l.b) ?? LEVELS[3];
export const levelDeck = (l: Level, s: number): number =>
  mainDeck(s) + l.rise + (l.name === 'fore' ? foreRise(s) : 0);
export const deckAt = (s: number): number => levelDeck(levelAt(s), s);

const SOLID = 1.15;
export function sideTop(s: number): number {
  return (
    mainDeck(s) +
    SOLID +
    2.15 * (1 - smoothstep(0.384, 0.42, s)) +
    2.15 * (1 - smoothstep(0.149, 0.175, s)) +
    (2.25 + foreRise(s)) * smoothstep(0.75, 0.786, s)
  );
}

function halfBeamLow(s: number): number {
  const b = BEAM / 2;
  if (s < 0.52)
    return b * (0.56 + 0.44 * Math.sin((Math.PI / 2) * (s / 0.52)) ** 0.85);
  return b * Math.max(0, Math.cos((Math.PI / 2) * ((s - 0.52) / 0.48)) ** 0.62);
}
function halfBeamHigh(s: number): number {
  if (s < 0.52) return halfBeamLow(s);
  return (
    (BEAM / 2) *
    Math.max(0, Math.cos((Math.PI / 2) * ((s - 0.52) / 0.48)) ** 0.5)
  );
}
const fine = (s: number) =>
  1 + 3.2 * (1 - smoothstep(0, 0.34, s)) + 2.4 * smoothstep(0.6, 1, s);

export function halfAt(s: number, y: number): number {
  const k = keel(s);
  const hb =
    halfBeamLow(s) +
    (halfBeamHigh(s) - halfBeamLow(s)) * smoothstep(YB, YB + 3, y);
  if (y >= YB) return Math.max(0, hb * (1 - 0.03 * (y - YB) ** 1.3));
  const q = clamp((y - k) / (YB - k), 0, 1);
  return Math.max(0.12, hb * (1 - (1 - q) ** 2) ** (fine(s) / 2));
}

export function zOf(s: number, y: number): number {
  const up = Math.max(0, y - keel(s));
  return (
    zAt(s) +
    2.4 * (Math.sqrt(up + 1) - 1) * smoothstep(0.84, 1, s) -
    0.2 * up * (1 - smoothstep(0, 0.08, s))
  );
}

export const onSkin = (
  s: number,
  y: number,
  side: number,
  out = V()
): Vector3 => out.set(side * halfAt(s, y), y, zOf(s, y));

export const inside = (s: number, y: number): number =>
  Math.max(0, halfAt(s, y) - 0.14);

export const MAST_NAMES = ['fore', 'main', 'mizzen'] as const;
export type MastName = (typeof MAST_NAMES)[number];

export const MASTS = {
  fore: { s: 0.8, top: 15.6, cross: 25.2, tip: 31.5, r: 0.36 },
  main: { s: 0.535, top: 16.8, cross: 27.6, tip: 35.5, r: 0.44 },
  mizzen: { s: 0.275, top: 13.6, cross: 0, tip: 20.5, r: 0.28 },
} as const satisfies Record<
  MastName,
  { s: number; top: number; cross: number; tip: number; r: number }
>;
export const mastZ = (name: MastName): number => zAt(MASTS[name].s);
export const mastFoot = (name: MastName): Vector3 =>
  V(0, deckAt(MASTS[name].s), mastZ(name));
export const topmastZ = (name: MastName): number =>
  mastZ(name) + MASTS[name].r * 0.8 + MASTS[name].r * 0.55 + 0.04;
export const poleZ = (name: MastName): number =>
  topmastZ(name) + MASTS[name].r * 0.55 * (1 + 0.55 * 0.8);
export const truck = (name: MastName): Vector3 =>
  V(
    0,
    MASTS[name].tip + 0.16,
    MASTS[name].cross ? poleZ(name) : topmastZ(name)
  );

export const BOWSPRIT = {
  heel: V(0, deckAt(0.93) + 0.35, zAt(0.93)),
  dir: V(0, Math.sin(0.5), Math.cos(0.5)),
  len: 15.5,
};
export const sprit = (t: number): Vector3 =>
  BOWSPRIT.heel.clone().addScaledVector(BOWSPRIT.dir, t * BOWSPRIT.len);

export const MOUNT_S = 0.42;
export const PLINTH = { height: 1.4, radius: 0.75 };
