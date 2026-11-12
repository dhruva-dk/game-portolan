// The galleon's canvas: a course and a topsail on each of the fore and main masts, a lateen on the mizzen, and a
// pennant at each masthead. Ported from the galleon branch's rig.ts (the bonaventure's and the spritsail's dropped).
//
// Each sail is one grid of `columns × rows` cells, its vertices row by row from the head (v = 0) to the foot (v = 1),
// left to right (u = 0 … 1), the pennants' too: the finest level's grids are the cloth simulation's particles
// (canvas.ts cuts them, cloth.ts moves them for the near ships), and every level's vertex finds its place on its grid
// by (u, v) (build.ts records each vertex's grid; each grid records the mast it hangs before, for the cloth to wrap
// round rather than pass through, and which way its normal faces). Each point is laid where the wind has blown it
// out of the sail's flat, and carries how far (belly): the shader scales that by the wind it is given, so the sails
// fill, slacken or go aback without new geometry. A square sail bellies along +z (forward) before its yard is
// braced, the lateen along +x (to port). Yards are built square across her (unbraced); the shader braces them.
//
// The pennants are built streaming straight aft from the truck, a long narrow strip; the shader turns them down the
// wind and makes them flap.
//
// Design metres (lines.ts).

import { Vector3 } from 'three/webgpu';
import type { Detail } from './detail.ts';
import { Acc, CLOTH, PIVOT, V, lerp, range, sheet } from './kit.ts';
import { MASTS, deckAt, mastZ, topmastZ, truck, zAt, type MastName } from './lines.ts';

/** Where each square yard hangs, how long it is, and the sail it sets. */
export interface Yard {
  mast: 'fore' | 'main';
  y: number;
  len: number;
  r: number;
  sail: { drop: number; foot: number; belly: number; scallop?: number };
}

export const YARDS: readonly Yard[] = [
  { mast: 'main', y: MASTS.main.top - 2.7, len: 17.6, r: 0.21, sail: { drop: 7.4, foot: 17.0, belly: 1.9 } },
  { mast: 'main', y: MASTS.main.cross - 1.25, len: 10.2, r: 0.13, sail: { drop: 3.6, foot: 11.6, belly: 0.9, scallop: 0.55 } },
  { mast: 'fore', y: MASTS.fore.top - 2.5, len: 15.4, r: 0.19, sail: { drop: 5.8, foot: 15.0, belly: 1.6 } },
  { mast: 'fore', y: MASTS.fore.cross - 1.15, len: 9.0, r: 0.12, sail: { drop: 3.3, foot: 10.4, belly: 0.8, scallop: 0.5 } },
];

/** The yard's centre line, unbraced: how far forward of its mast's axis it hangs. */
export const yardZ = (Y: Yard): number => mastZ(Y.mast) + MASTS[Y.mast].r + Y.r + 0.15;
/** A point x metres out along the yard (to port, +x). */
export const arm = (Y: Yard, x: number): Vector3 => V(x, Y.y, yardZ(Y));

/** A point of a sail: where it hangs flat, and how far the wind blows it out of that. */
export interface SailPoint { flat: Vector3; belly: number }

/** A square sail's shape, unbraced: (u across from port, v down from the head) to a point. */
export function squareAt(Y: Yard, u: number, v: number): SailPoint {
  const S = Y.sail, hw = Y.len / 2 - 0.35;
  const x = lerp(1, -1, u) * lerp(hw, S.foot / 2, v);
  const su = Math.sin(Math.PI * u) ** 0.7;
  const shape = (1 - (1 - v) ** 2) * (1 - 0.22 * v);
  const belly = S.belly * (su * shape + 0.22 * (1 - su) * Math.sin(Math.PI * Math.min(1, v * 1.1)));
  let y = Y.y - 0.2 - S.drop * v;
  // a course's foot curves down in the middle; a topsail's foot is cut in scallops between its clews
  y += S.scallop ? S.scallop * v ** 4 * Math.abs(Math.sin(Math.PI * u * 3)) ** 0.8 * Math.sin(Math.PI * u) ** 0.3 : 0.25 * v ** 3 * Math.sin(Math.PI * u);
  return { flat: V(x, y, yardZ(Y) + 0.12), belly };
}
/** The point itself, its belly blown out. */
export const squarePoint = (Y: Yard, u: number, v: number): Vector3 => { const p = squareAt(Y, u, v); return p.flat.add(V(0, 0, p.belly)); };

/** The mizzen's lateen: its yard crossing the mast `y` up, `at` of its length forward of it, raked up aft. */
export const LATEEN = { mast: 'mizzen' as MastName, y: MASTS.mizzen.top - 2.6, len: 17.5, at: 0.36, rake: 0.95, belly: 1.2, r: 0.17 };
const lateenDir = () => V(0, Math.sin(LATEEN.rake), -Math.cos(LATEEN.rake));
/** Where the lateen yard crosses the mast, to port of it. */
export const lateenCross = (): Vector3 => V(MASTS.mizzen.r + 0.2, LATEEN.y, mastZ('mizzen'));
/** The lateen yard's tack (forward, low) and peak (aft, high). */
export const lateenTack = (): Vector3 => lateenCross().addScaledVector(lateenDir(), -LATEEN.len * LATEEN.at);
export const lateenPeak = (): Vector3 => lateenCross().addScaledVector(lateenDir(), LATEEN.len * (1 - LATEEN.at));
/** The lateen's clew, its after lower corner. */
export const lateenClew = (): Vector3 => V(0, deckAt(0.1) + 2.6, zAt(0.07));

/** A lateen point: a along the yard from the tack, b down from the yard to the clew. */
export function lateenAt(a: number, b: number): SailPoint {
  const head = lateenTack().lerp(lateenPeak(), a).add(V(0.1, -0.12, 0));
  const flat = head.lerp(lateenClew(), b);
  const belly = LATEEN.belly * Math.sin(Math.PI * a) ** 0.9 * Math.sin(Math.PI * Math.min(1, b)) ** 0.8 * (1 - 0.4 * b);
  return { flat, belly };
}

/** The pennants: each this long and this broad at the truck (design metres), tapering to a point. */
export const PENNANT = { length: 4.5, width: 0.45 };

/**
 * Where each grid of the cloth lies among its vertices — every sail's and every pennant's — and what a cloth simulation
 * needs to know of it: its kind (CLOTH), whether sheet() wound it against the grid's order, and the mast it hangs
 * before, which the canvas can't pass through (on the centreline, `z` forward, radius `r`; design metres).
 */
export interface SailGrid {
  name: string; first: number; columns: number; rows: number;
  kind: number; flip: boolean; mast: { z: number; r: number } | null;
}

function grid(acc: Acc, name: string, columns: number, rows: number, at: (u: number, v: number) => SailPoint, facing: Vector3, mast: SailGrid['mast']): SailGrid {
  const first = acc.count;
  const pts = range(0, 1, rows).map((v) => range(0, 1, columns).map((u) => at(u, v)));
  const dir = facing.clone().normalize();
  const flip = sheet(acc, pts.map((r) => r.map((p) => p.flat.clone().addScaledVector(dir, p.belly))),
    range(0, 1, rows).map((v) => range(0, 1, columns).map((u): [number, number] => [u, v])), facing, pts.map((r) => r.map((p) => p.belly)));
  return { name, first, columns, rows, kind: acc.kind, flip, mast };
}

/** Every sail and pennant into `cloth`; returns where each one's grid lies: the square sails, the lateen, the pennants. */
export function buildSails(cloth: Acc, D: Detail): SailGrid[] {
  const grids: SailGrid[] = [];
  cloth.with({ kind: CLOTH.square, swing: 1 }, () => {
    for (const Y of YARDS) cloth.with({ pivot: PIVOT[Y.mast] }, () => {
      // a course hangs before its lower mast, a topsail before the topmast
      const top = Y.y > MASTS[Y.mast].top, r = MASTS[Y.mast].r;
      grids.push(grid(cloth, `${Y.mast} ${top ? 'topsail' : 'course'}`, D.square[0], D.square[1], (u, v) => squareAt(Y, u, v), V(0, 0, 1),
        top ? { z: topmastZ(Y.mast), r: r * 0.55 } : { z: mastZ(Y.mast), r }));
    });
  });
  cloth.with({ kind: CLOTH.lateen }, () =>
    grids.push(grid(cloth, 'mizzen lateen', D.lateen[0], D.lateen[1], lateenAt, V(1, 0, 0), { z: mastZ('mizzen'), r: MASTS.mizzen.r })));
  if (D.pennant) cloth.with({ kind: CLOTH.pennant }, () => {
    for (const name of Object.keys(MASTS) as MastName[]) {
      const root = truck(name).add(V(0, 0.05, 0));
      // along it (u) from the truck to its tip, across it (v) down from its upper edge
      grids.push(grid(cloth, `${name} pennant`, D.pennant, 1, (t, j) => ({ flat: root.clone().add(V(0, -PENNANT.width * (1 - t) * j, -PENNANT.length * t)), belly: 0 }),
        V(1, 0, 0), null));
    }
  });
  return grids;
}
