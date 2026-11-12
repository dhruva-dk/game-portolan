// The galleon's lines, ported from the galleon branch. Drawn as the shipwright's drawings give them, in design
// metres (a 30 m waterline): build.ts scales the whole ship by SCALE as it packs her, so every number here and in
// hull.ts and rig.ts is in design metres. Her own frame: +y up from the waterline, +z to the bow, +x to port. A
// station s runs from the transom (0) to the stem (1).
//
// A race-built galleon of the 1580s: long and low in the waist, a forecastle over the bow, a quarterdeck and a poop
// stepping up aft to a high, narrow, flat transom, strong tumblehome, a curved stem raking well forward, and a
// beakhead (hull.ts) under the bowsprit. Three masts: fore and main square-rigged, a lateen mizzen.

import { Vector3 } from 'three/webgpu';
import { V, clamp, sm } from './kit.ts';

/** The whole ship is built at the drawings' size and scaled by this: a 26 m galleon, her mainmast 21 m over the water. */
export const SCALE = 0.6;

/** Length between the transom and the stem at the waterline, the greatest beam, and the draft. */
export const LEN = 30, BEAM = 8.6, DRAFT = 3.3;
/** Height of the greatest breadth over the waterline. */
const YB = 1.1;

export const zAt = (s: number): number => (s - 0.5) * LEN;

/** The keel's underside: level under her length, sweeping up into the forefoot. */
export const keel = (s: number): number => -DRAFT * (1 - 0.9 * sm(0.6, 1.02, s) ** 1.7) + 0.25 * (1 - sm(0, 0.15, s));

/** The main deck in the waist, with a gentle sheer to either end. */
export const mainDeck = (s: number): number => 2.45 + 1.4 * (s - 0.55) ** 2;

/** The decks, aft to forward: the poop, the quarterdeck, the waist and the forecastle, each over the main deck. */
export const LEVELS = [
  { name: 'poop', a: 0, b: 0.15, rise: 4.3 },
  { name: 'quarter', a: 0.15, b: 0.385, rise: 2.15 },
  { name: 'waist', a: 0.385, b: 0.785, rise: 0 },
  { name: 'fore', a: 0.785, b: 0.985, rise: 2.25 },
] as const;
export type Level = (typeof LEVELS)[number];
const foreRise = (s: number) => 0.7 * sm(0.785, 1, s);
export const levelAt = (s: number): Level => LEVELS.find((l) => s <= l.b) ?? LEVELS[3];
/** The deck of a level at station s. */
export const levelDeck = (l: Level, s: number): number => mainDeck(s) + l.rise + (l.name === 'fore' ? foreRise(s) : 0);
export const deckAt = (s: number): number => levelDeck(levelAt(s), s);

/** How high the planked bulwark stands over each deck: solid to the rail, no balustrade. */
export const SOLID = 1.15;
/** The top of the planked side: each deck's own, the castles' sides sweeping down into the waist in short S-curves. */
export function sideTop(s: number): number {
  return mainDeck(s) + SOLID
    + 2.15 * (1 - sm(0.384, 0.42, s))
    + 2.15 * (1 - sm(0.149, 0.175, s))
    + (2.25 + foreRise(s)) * sm(0.75, 0.786, s);
}

/** The greatest half-breadth along her: a wide transom, full quarters, a fine run into the bow. */
function halfBeamLow(s: number): number {
  const b = BEAM / 2;
  if (s < 0.52) return b * (0.56 + 0.44 * Math.sin((Math.PI / 2) * (s / 0.52)) ** 0.85);
  return b * Math.max(0, Math.cos((Math.PI / 2) * ((s - 0.52) / 0.48)) ** 0.62);
}
/** Higher up the bow is fuller, so the forecastle has room. */
function halfBeamHigh(s: number): number {
  if (s < 0.52) return halfBeamLow(s);
  return (BEAM / 2) * Math.max(0, Math.cos((Math.PI / 2) * ((s - 0.52) / 0.48)) ** 0.5);
}
/** How hollow the sections are low down: a fine run aft, a sharper entry forward. */
const fine = (s: number) => 1 + 3.2 * (1 - sm(0, 0.34, s)) + 2.4 * sm(0.6, 1, s);

/** Half-breadth of the skin at station s and height y. */
export function halfAt(s: number, y: number): number {
  const k = keel(s);
  const hb = halfBeamLow(s) + (halfBeamHigh(s) - halfBeamLow(s)) * sm(YB, YB + 3, y);
  // tumblehome: the sides lean in above the greatest breadth, most at the high stern
  if (y >= YB) return Math.max(0, hb * (1 - 0.03 * (y - YB) ** 1.3));
  const q = clamp((y - k) / (YB - k), 0, 1);
  return Math.max(0.12, hb * (1 - (1 - q) ** 2) ** (fine(s) / 2));
}

/** Where along her a point of the skin lies: the stem curves forward as it rises; the transom rakes aft. */
export function zOf(s: number, y: number): number {
  const up = Math.max(0, y - keel(s));
  return zAt(s) + 2.4 * (Math.sqrt(up + 1) - 1) * sm(0.84, 1, s) - 0.2 * up * (1 - sm(0, 0.08, s));
}

/** A point of the skin, side +1 to port and −1 to starboard. */
export const onSkin = (s: number, y: number, side: number, out = V()): Vector3 => out.set(side * halfAt(s, y), y, zOf(s, y));

/** The breadth inside the side at a height (the planking's thickness taken off). */
export const inside = (s: number, y: number): number => Math.max(0, halfAt(s, y) - 0.14);

/**
 * Where the masts step, and each one's heights over the waterline: the lower mast's top, the topmast's crosstrees
 * (none on the mizzen, whose topmast is a pole) and the truck at its tip.
 */
export const MASTS = {
  fore: { s: 0.8, top: 15.6, cross: 25.2, tip: 31.5, r: 0.36 },
  main: { s: 0.535, top: 16.8, cross: 27.6, tip: 35.5, r: 0.44 },
  mizzen: { s: 0.275, top: 13.6, cross: 0, tip: 20.5, r: 0.28 },
} as const;
export type MastName = keyof typeof MASTS;
export const mastZ = (name: MastName): number => zAt(MASTS[name].s);
export const mastFoot = (name: MastName): Vector3 => V(0, deckAt(MASTS[name].s), mastZ(name));
/** How far forward of the lower mast its topmast stands (held there by the cap). */
export const topmastZ = (name: MastName): number => mastZ(name) + MASTS[name].r * 0.8 + MASTS[name].r * 0.55 + 0.04;
/** Where the topgallant pole stands over the topmast's head, forward of it. */
export const poleZ = (name: MastName): number => topmastZ(name) + MASTS[name].r * 0.55 * (1 + 0.55 * 0.8);
/** The highest point of each mast, where its pennant flies. */
export const truck = (name: MastName): Vector3 => V(0, MASTS[name].tip + 0.16, MASTS[name].cross ? poleZ(name) : topmastZ(name));

/** The bowsprit: its heel on the forecastle, raking up over the beakhead. */
export const BOWSPRIT = { heel: V(0, deckAt(0.93) + 0.35, zAt(0.93)), dir: V(0, Math.sin(0.5), Math.cos(0.5)), len: 15.5 };
export const sprit = (t: number): Vector3 => BOWSPRIT.heel.clone().addScaledVector(BOWSPRIT.dir, t * BOWSPRIT.len);

/** The gun's mount: on the weather deck's centreline in the waist, between the main and fore masts. */
export const MOUNT_S = 0.665;
/** The mount's plinth: its height over the deck and its radius (design metres). */
export const PLINTH = { height: 0.85, radius: 0.75 };
