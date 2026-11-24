import { clamp } from '../world/scalar.ts';
import { DETAILS, type Detail } from './detail.ts';
import { buildHull } from './hull.ts';
import { Acc } from './kit.ts';
import { SCALE, mastZ } from './lines.ts';
import { buildRig } from './rig.ts';
import { PENNANT, buildSails, type SailGrid } from './sails.ts';

export const BELLY_UNIT = 1.25;
export const RADIUS_UNIT = 0.05;
export const UV_RANGE = 32;
export const PIVOT_Z = [
  0,
  mastZ('fore') * SCALE,
  mastZ('main') * SCALE,
] as const;
export const PENNANT_LENGTH = PENNANT.length * SCALE;

export interface Packed {
  position: Float32Array;
  normal: Int8Array;
  uv: Int16Array | null;
  part: Uint8Array;
  index: Uint16Array | Uint32Array;
  vertices: number;
  triangles: number;
  bytesPerVertex: number;
}

interface ShipMesh {
  body: Packed;
  cloth: Packed;
  ropes: Packed;
  sails: SailGrid[];
  triangles: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

const snorm = (v: number) => clamp(Math.round(v * 127), -127, 127);
const unorm = (v: number) => clamp(Math.round(v * 255), 0, 255);
const snorm16 = (v: number) => clamp(Math.round(v * 32767), -32767, 32767);

function pack(
  acc: Acc,
  w: 'ao' | 'radius' | 'grid',
  uv: boolean,
  grids: readonly SailGrid[] = []
): Packed {
  const n = acc.count;
  const position = new Float32Array(n * 3),
    normal = new Int8Array(n * 4),
    part = new Uint8Array(n * 4);
  const uvs = uv ? new Int16Array(n * 2) : null;
  for (let i = 0; i < n; i++) {
    const a = i * 6;
    for (let c = 0; c < 3; c++) {
      position[i * 3 + c] = acc.p[i * 3 + c] * SCALE;
      normal[i * 4 + c] = snorm(acc.n[i * 3 + c]);
    }
    normal[i * 4 + 3] =
      w === 'ao'
        ? snorm(acc.a[a + 1])
        : w === 'radius'
          ? snorm((acc.a[a + 5] * SCALE) / RADIUS_UNIT)
          : grids.findIndex(
              (g) =>
                i >= g.first && i < g.first + (g.columns + 1) * (g.rows + 1)
            );
    part[i * 4] = acc.a[a];
    part[i * 4 + 1] = acc.a[a + 2];
    part[i * 4 + 2] = unorm(acc.a[a + 3]);
    part[i * 4 + 3] = unorm((acc.a[a + 4] * SCALE) / BELLY_UNIT);
    if (uvs)
      for (let c = 0; c < 2; c++)
        uvs[i * 2 + c] = snorm16(acc.uv[i * 2 + c] / UV_RANGE);
  }
  const index = n < 65536 ? new Uint16Array(acc.i) : new Uint32Array(acc.i);
  return {
    position,
    normal,
    uv: uvs,
    part,
    index,
    vertices: n,
    triangles: acc.triangles,
    bytesPerVertex: 12 + 4 + 4 + (uv ? 4 : 0),
  };
}

const cache = new Map<number, ShipMesh>();

export function buildShip(k: number): ShipMesh {
  const hit = cache.get(k);
  if (hit) return hit;
  const D: Detail = DETAILS[k];
  const body = new Acc(),
    cloth = new Acc(),
    ropes = new Acc();
  buildHull(body, D);
  buildRig(body, ropes, D);
  const sails = buildSails(cloth, D);
  const packed = {
    body: pack(body, 'ao', true),
    cloth: pack(cloth, 'grid', true, sails),
    ropes: pack(ropes, 'radius', false),
  };
  const min: [number, number, number] = [Infinity, Infinity, Infinity],
    max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const p of [packed.body, packed.cloth, packed.ropes])
    for (let i = 0; i < p.position.length; i++) {
      min[i % 3] = Math.min(min[i % 3], p.position[i]);
      max[i % 3] = Math.max(max[i % 3], p.position[i]);
    }
  const ship: ShipMesh = {
    ...packed,
    sails,
    bounds: { min, max },
    triangles:
      packed.body.triangles + packed.cloth.triangles + packed.ropes.triangles,
  };
  cache.set(k, ship);
  return ship;
}
