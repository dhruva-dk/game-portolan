// A working yard round a building at its first level, when it stands small on a plot laid out for its third: a fence
// round the plot with a gate to the front, a gravel path from the gate to the door, and what the trade leaves about (a
// stack of timber, crates and barrels, a handcart, a jib crane, a coal heap, perches, a boat on trestles, nets drying).
// In a plot's own metres (kit.ts), as the buildings are; a water plot's only on its land.

import type { Building } from '../world/rookery.ts';
import { TONE as T, createKit, type Form, type Kit } from './kit.ts';

/** A fence round x0…x1 by z0…z1, its gate (gx0…gx1) on the front (+z) side. */
function fence(k: Kit, x0: number, z0: number, x1: number, z1: number, gate: readonly [number, number]) {
  k.rail(x0, z0, x1, z1, 0, T.timber, ['z1']);
  k.rail(x0, z1, gate[0], z1, 0, T.timber, ['z0', 'x0', 'x1']);
  k.rail(gate[1], z1, x1, z1, 0, T.timber, ['z0', 'x0', 'x1']);
}

/** A gravel path over x0…x1 by z0…z1. */
const path = (k: Kit, x0: number, z0: number, x1: number, z1: number) => k.box(x0, 0, z0, x1, 0.05, z1, T.cream);

/** A stack of sawn timber at (x, z), `len` long along x: three courses on bearers. */
function timber(k: Kit, x: number, z: number, len: number) {
  for (const s of [-1, 1]) k.box(x + s * len * 0.35 - 0.15, 0, z - 0.8, x + s * len * 0.35 + 0.15, 0.2, z + 0.8, T.iron);
  for (let c = 0; c < 3; c++) {
    const y = 0.2 + c * 0.32, inset = c * 0.12;
    for (const dz of [-0.55, 0, 0.55]) k.box(x - len / 2 + inset, y, z + dz - 0.24, x + len / 2 - inset, y + 0.3, z + dz + 0.24, T.timber);
  }
}

/** Crates at (x, z): `n` of them, the later stacked on the first. */
function crates(k: Kit, x: number, z: number, n: number) {
  const at: readonly (readonly [number, number, number])[] = [[0, 0, 0], [1, 0.1, 0], [0.45, 0, 0.9], [0.5, 0.05, 0.45]];
  at.slice(0, n).forEach(([dx, dz, up], i) => {
    const y = up * 1.8, s = i === 3 ? 0.4 : 0.45;
    k.box(x + dx - s, y, z + dz - s, x + dx + s, y + 2 * s, z + dz + s, T.deck);
    k.box(x + dx - s - 0.03, y + s - 0.06, z + dz - s - 0.03, x + dx + s + 0.03, y + s + 0.06, z + dz + s + 0.03, T.timber);
  });
}

/** A barrel at (x, z), banded in iron. */
function barrel(k: Kit, x: number, z: number) {
  k.drum(x, z, 0.38, 0, 1.05, T.timber, 8);
  for (const y of [0.18, 0.8]) k.drum(x, z, 0.41, y, y + 0.08, T.iron, 8);
}

/** A wheel standing upright across z at (x, y, z), radius r, both its faces. */
function wheel(k: Kit, x: number, y: number, z: number, r: number) {
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI, b = ((i + 1) / n) * 2 * Math.PI;
    const p = (t: number): [number, number, number] => [x + Math.cos(t) * r, y + Math.sin(t) * r, z];
    k.tri([x, y, z], p(a), p(b), T.iron);
    k.tri([x, y, z], p(b), p(a), T.iron);
  }
}

/** A handcart at (x, z), its shafts along +x: a bed, two wheels and its shafts. */
function cart(k: Kit, x: number, z: number) {
  k.box(x - 0.9, 0.55, z - 0.6, x + 0.7, 0.95, z + 0.6, T.timber);
  k.box(x - 0.9, 0.95, z - 0.62, x - 0.8, 1.25, z + 0.62, T.timber);
  for (const s of [-1, 1]) {
    wheel(k, x - 0.1, 0.5, z + s * 0.66, 0.5);
    k.box(x + 0.7, 0.62, z + s * 0.45 - 0.05, x + 2, 0.72, z + s * 0.45 + 0.05, T.timber);
  }
}

/** A jib crane at (x, z), `h` tall, its jib out along −x, a crate of the crew's colour on its hook. */
function crane(k: Kit, x: number, z: number, h: number) {
  k.box(x - 0.6, 0, z - 0.6, x + 0.6, 0.4, z + 0.6, T.stone);
  k.pole(x, z, 0.4, h, T.timber, 0.3);
  k.box(x - 3.2, h - 0.35, z - 0.12, x + 0.6, h - 0.1, z + 0.12, T.timber);
  k.quad([x - 0.1, h * 0.6, z + 0.13], [x - 0.1, h * 0.6 + 0.2, z + 0.13], [x - 2, h - 0.35, z + 0.13], [x - 2.2, h - 0.35, z + 0.13], T.timber);
  k.quad([x - 0.1, h * 0.6 + 0.2, z - 0.13], [x - 0.1, h * 0.6, z - 0.13], [x - 2.2, h - 0.35, z - 0.13], [x - 2, h - 0.35, z - 0.13], T.timber);
  k.pole(x - 2.9, z, 1.6, h - 0.35, T.iron, 0.05);
  k.box(x - 3.3, 0.9, z - 0.4, x - 2.5, 1.6, z + 0.4, T.first);
}

/** A boat's hull upturned on two trestles at (x, z), along x. */
function upturned(k: Kit, x: number, z: number) {
  for (const s of [-1, 1]) {
    k.box(x + s * 1.1 - 0.1, 0, z - 0.7, x + s * 1.1 + 0.1, 0.8, z - 0.55, T.timber);
    k.box(x + s * 1.1 - 0.1, 0, z + 0.55, x + s * 1.1 + 0.1, 0.8, z + 0.7, T.timber);
  }
  k.box(x - 2, 0.8, z - 0.75, x + 2, 1.3, z + 0.75, T.first);
  k.gable(x - 2, z - 0.75, x + 2, z + 0.75, 1.3, 1.6, T.first, T.first, 'x', 0);
}

/** Two posts and a rail between, from (x0, z) to (x1, z), `h` high, a sheet of canvas or netting hung over it. */
function rack(k: Kit, x0: number, x1: number, z: number, h: number) {
  for (const x of [x0, x1]) k.pole(x, z, 0, h, T.timber, 0.2);
  k.box(x0, h - 0.15, z - 0.08, x1, h, z + 0.08, T.timber);
  k.box(x0 + 0.2, h * 0.35, z - 0.03, x1 - 0.2, h - 0.15, z + 0.03, T.canvas);
}

/** Perches: a post with a crossbar, at (x, z). */
function perch(k: Kit, x: number, z: number) {
  k.pole(x, z, 0, 2.6, T.timber, 0.18);
  k.box(x - 0.8, 2.3, z - 0.06, x + 0.8, 2.42, z + 0.06, T.timber);
  k.box(x - 0.06, 1.6, z - 0.6, x + 0.06, 1.72, z + 0.6, T.timber);
}

/** Each building's yard at its first level. */
const YARDS: Readonly<Record<Building, (k: Kit) => void>> = {
  factory(k) {
    fence(k, -12.5, -7.5, 12.5, 7.5, [-2.5, 2.5]);
    path(k, -1.8, 4, 1.8, 7.5);
    timber(k, -9.5, -5.6, 4.5);
    timber(k, 9, -5.4, 4);
    crane(k, 10.5, 4.6, 5.6);
    crates(k, -10.2, 5.4, 4);
    cart(k, 4.4, 5.6);
  },
  drawingLoft(k) {
    fence(k, -7, -4.6, 7, 4.6, [-1.2, 1.2]);
    path(k, -0.7, 2.5, 0.7, 4.6);
    crates(k, -5.6, -3.3, 3);
    crates(k, -5.4, 2.8, 2);
    cart(k, 4.2, -2.9);
  },
  testTank(k) {
    fence(k, -12.5, -5.5, 12.5, 5.5, [-2, 2]);
    path(k, -1.5, 1.8, 1.5, 5.5);
    upturned(k, 6, 3.8);
    timber(k, 9.5, -3.9, 3.5);
    crates(k, -10.6, 3.6, 3);
    barrel(k, -5.5, -3.8);
    barrel(k, -4.6, -4.3);
  },
  foundry(k) {
    fence(k, -11.5, -7, 11.5, 7, [-1.8, 1.8]);
    path(k, -1.2, 3, 1.2, 7);
    k.cone(-8, -4, 2.2, 0, 1.5, T.slate, 8);
    for (let c = 0; c < 3; c++) for (const dz of [-0.4, 0, 0.4]) k.box(6.4 + c * 0.1, c * 0.2, -4.4 + dz - 0.16, 8 - c * 0.1, c * 0.2 + 0.2, -4.4 + dz + 0.16, T.iron);
    barrel(k, 7.4, 3.2);
    barrel(k, 8.3, 3.8);
    cart(k, -9.4, 3.8);
  },
  sailingSchool(k) {
    upturned(k, -8, -4.2);
    timber(k, 8.6, -4.6, 3);
    crates(k, -7.6, -1, 2);
    rack(k, -10, -6.5, -6.4, 2.2);
  },
  flightLoft(k) {
    fence(k, -5, -5, 5, 5, [-0.9, 0.9]);
    path(k, -0.6, 2.4, 0.6, 5);
    perch(k, -3.6, -3.4);
    perch(k, 3.6, -3.4);
    crates(k, -3.6, 3.2, 2);
    barrel(k, 3.6, 3.4);
  },
  crowsNest(k) {
    fence(k, -3.8, -3.8, 3.8, 3.8, [-1, 1]);
    path(k, -0.6, 2.2, 0.6, 3.8);
    barrel(k, -3, -3);
    crates(k, 2.9, -2.9, 1);
  },
  fishMarket(k) {
    crates(k, -7.6, -4.2, 4);
    barrel(k, -9.2, -1.6);
    barrel(k, -8.4, -0.8);
    rack(k, 8.6, 10.4, -4.6, 2.2);
    rack(k, 8.6, 10.4, -2.6, 2.2);
    cart(k, -6, -1.2);
  },
  landingPad(k) {
    fence(k, -11.5, -8.5, 11.5, 11.5, [-1.6, 1.6]);
    path(k, -1, 5.2, 1, 11.5);
    crates(k, -9, -6.2, 4);
    barrel(k, -9.6, -2.8);
    barrel(k, -8.8, -2.2);
    cart(k, 7.6, 6.4);
  },
};

/** A building's yard at its first level. */
export function dressingOf(building: Building): Form {
  const k = createKit();
  YARDS[building](k);
  return k.form;
}
