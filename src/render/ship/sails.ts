import { Vector3 } from 'three/webgpu';
import type { Detail } from './detail.ts';
import { lerp } from '../../world/scalar.ts';
import { Acc, CLOTH, PIVOT, V, range, sheet } from './kit.ts';
import {
  MASTS,
  MAST_NAMES,
  deckAt,
  mastZ,
  topmastZ,
  truck,
  zAt,
} from './lines.ts';

export interface Yard {
  mast: 'fore' | 'main';
  y: number;
  len: number;
  r: number;
  sail: { drop: number; foot: number; belly: number; scallop?: number };
}

export const YARDS: readonly Yard[] = [
  {
    mast: 'main',
    y: MASTS.main.top - 2.7,
    len: 17.6,
    r: 0.21,
    sail: { drop: 7.4, foot: 17.0, belly: 1.9 },
  },
  {
    mast: 'main',
    y: MASTS.main.cross - 1.25,
    len: 10.2,
    r: 0.13,
    sail: { drop: 3.6, foot: 11.6, belly: 0.9, scallop: 0.55 },
  },
  {
    mast: 'fore',
    y: MASTS.fore.top - 2.5,
    len: 15.4,
    r: 0.19,
    sail: { drop: 5.8, foot: 15.0, belly: 1.6 },
  },
  {
    mast: 'fore',
    y: MASTS.fore.cross - 1.15,
    len: 9.0,
    r: 0.12,
    sail: { drop: 3.3, foot: 10.4, belly: 0.8, scallop: 0.5 },
  },
];

const yardZ = (Y: Yard): number => mastZ(Y.mast) + MASTS[Y.mast].r + Y.r + 0.15;
export const arm = (Y: Yard, x: number): Vector3 => V(x, Y.y, yardZ(Y));

interface SailPoint {
  flat: Vector3;
  belly: number;
}

function squareAt(Y: Yard, u: number, v: number): SailPoint {
  const S = Y.sail,
    hw = Y.len / 2 - 0.35;
  const x = lerp(1, -1, u) * lerp(hw, S.foot / 2, v);
  const su = Math.sin(Math.PI * u) ** 0.7;
  const shape = (1 - (1 - v) ** 2) * (1 - 0.22 * v);
  const belly =
    S.belly *
    (su * shape + 0.22 * (1 - su) * Math.sin(Math.PI * Math.min(1, v * 1.1)));
  let y = Y.y - 0.2 - S.drop * v;
  y += S.scallop
    ? S.scallop *
      v ** 4 *
      Math.abs(Math.sin(Math.PI * u * 3)) ** 0.8 *
      Math.sin(Math.PI * u) ** 0.3
    : 0.25 * v ** 3 * Math.sin(Math.PI * u);
  return { flat: V(x, y, yardZ(Y) + 0.12), belly };
}
export const squarePoint = (Y: Yard, u: number, v: number): Vector3 => {
  const p = squareAt(Y, u, v);
  return p.flat.add(V(0, 0, p.belly));
};

export const LATEEN = {
  y: MASTS.mizzen.top - 2.6,
  len: 17.5,
  at: 0.36,
  rake: 0.95,
  belly: 1.2,
  r: 0.17,
};
const lateenDir = () => V(0, Math.sin(LATEEN.rake), -Math.cos(LATEEN.rake));
export const lateenCross = (): Vector3 =>
  V(MASTS.mizzen.r + 0.2, LATEEN.y, mastZ('mizzen'));
export const lateenTack = (): Vector3 =>
  lateenCross().addScaledVector(lateenDir(), -LATEEN.len * LATEEN.at);
export const lateenPeak = (): Vector3 =>
  lateenCross().addScaledVector(lateenDir(), LATEEN.len * (1 - LATEEN.at));
export const lateenClew = (): Vector3 => V(0, deckAt(0.1) + 2.6, zAt(0.07));

function lateenAt(a: number, b: number): SailPoint {
  const head = lateenTack()
    .lerp(lateenPeak(), a)
    .add(V(0.1, -0.12, 0));
  const flat = head.lerp(lateenClew(), b);
  const belly =
    LATEEN.belly *
    Math.sin(Math.PI * a) ** 0.9 *
    Math.sin(Math.PI * Math.min(1, b)) ** 0.8 *
    (1 - 0.4 * b);
  return { flat, belly };
}

export const PENNANT = { length: 4.5, width: 0.45 };

export interface SailGrid {
  name: string;
  first: number;
  columns: number;
  rows: number;
  kind: number;
  flip: boolean;
  mast: { z: number; r: number } | null;
}

function grid(
  acc: Acc,
  name: string,
  columns: number,
  rows: number,
  at: (u: number, v: number) => SailPoint,
  facing: Vector3,
  mast: SailGrid['mast']
): SailGrid {
  const first = acc.count;
  const pts = range(0, 1, rows).map((v) =>
    range(0, 1, columns).map((u) => at(u, v))
  );
  const dir = facing.clone().normalize();
  const flip = sheet(
    acc,
    pts.map((r) => r.map((p) => p.flat.clone().addScaledVector(dir, p.belly))),
    range(0, 1, rows).map((v) =>
      range(0, 1, columns).map((u): [number, number] => [u, v])
    ),
    facing,
    pts.map((r) => r.map((p) => p.belly))
  );
  return { name, first, columns, rows, kind: acc.kind, flip, mast };
}

export function buildSails(cloth: Acc, D: Detail): SailGrid[] {
  const grids: SailGrid[] = [];
  cloth.with({ kind: CLOTH.square, swing: 1 }, () => {
    for (const Y of YARDS)
      cloth.with({ pivot: PIVOT[Y.mast] }, () => {
        const top = Y.y > MASTS[Y.mast].top,
          r = MASTS[Y.mast].r;
        grids.push(
          grid(
            cloth,
            `${Y.mast} ${top ? 'topsail' : 'course'}`,
            D.square[0],
            D.square[1],
            (u, v) => squareAt(Y, u, v),
            V(0, 0, 1),
            top ? { z: topmastZ(Y.mast), r: r * 0.55 } : { z: mastZ(Y.mast), r }
          )
        );
      });
  });
  cloth.with({ kind: CLOTH.lateen }, () =>
    grids.push(
      grid(
        cloth,
        'mizzen lateen',
        D.lateen[0],
        D.lateen[1],
        lateenAt,
        V(1, 0, 0),
        { z: mastZ('mizzen'), r: MASTS.mizzen.r }
      )
    )
  );
  if (D.pennant)
    cloth.with({ kind: CLOTH.pennant }, () => {
      for (const name of MAST_NAMES) {
        const root = truck(name).add(V(0, 0.05, 0));
        const at = (t: number, j: number): SailPoint => ({
          flat: root
            .clone()
            .add(V(0, -PENNANT.width * (1 - t) * j, -PENNANT.length * t)),
          belly: 0,
        });
        grids.push(
          grid(cloth, `${name} pennant`, D.pennant, 1, at, V(1, 0, 0), null)
        );
      }
    });
  return grids;
}
