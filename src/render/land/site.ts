import {
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three/webgpu';
import {
  chartBasis,
  fromChart,
  place,
  type Chart,
  type Vec3,
} from '../../world/sphere.ts';

function onSphere(
  chart: Chart,
  x: number,
  height: number,
  z: number
): { p: Vec3; e1: Vec3; up: Vec3; e2: Vec3 } {
  const up = fromChart(chart, x, z);
  const [e1, e2] = chartBasis(chart, up);
  return { p: place(up, height), e1, up, e2 };
}

const basis = new Matrix4(),
  e1 = new Vector3(),
  up = new Vector3(),
  e2 = new Vector3();

export function standing(
  chart: Chart,
  x: number,
  height: number,
  z: number,
  local: Matrix4,
  out: Matrix4
): Matrix4 {
  const s = onSphere(chart, x, height, z);
  basis
    .makeBasis(e1.set(...s.e1), up.set(...s.up), e2.set(...s.e2))
    .setPosition(...s.p);
  return out.multiplyMatrices(basis, local);
}

export interface Placed {
  matrix: Matrix4;
  tint?: number;
}

export interface Instances {
  mesh: InstancedMesh;
  show(tiles: ArrayLike<number>, from: number, to: number): void;
  casting(): { matrices: InstancedBufferAttribute; count: number };
  cast(tiles: ArrayLike<number>, from: number, to: number): void;
}

function send(
  attribute: InstancedBufferAttribute,
  count: number,
  size: number
) {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, count * size);
  attribute.needsUpdate = true;
}

export function createInstances(
  name: string,
  geometry: BufferGeometry,
  material: Material,
  placed: Placed[][],
  tinted = false
): Instances {
  const total = Math.max(
    1,
    placed.reduce((n, p) => n + p.length, 0)
  );
  const mesh = new InstancedMesh(geometry, material, total);
  mesh.name = name;
  const tint = new InstancedBufferAttribute(new Float32Array(total), 1);
  if (tinted) geometry.setAttribute('tint', tint);
  mesh.count = 0;
  mesh.frustumCulled = false;
  let shadow: { matrices: InstancedBufferAttribute; count: number } | null =
    null;
  const casting = () =>
    (shadow ??= {
      matrices: new InstancedBufferAttribute(new Float32Array(total * 16), 16),
      count: 0,
    });
  return {
    mesh,
    show(tiles, from, to) {
      let k = 0;
      for (let n = from; n < to; n++) {
        const on = placed[tiles[n]];
        for (let j = 0; j < on.length; j++) {
          mesh.setMatrixAt(k, on[j].matrix);
          tint.setX(k++, on[j].tint ?? 0);
        }
      }
      mesh.count = k;
      send(mesh.instanceMatrix, k, 16);
      send(tint, k, 1);
    },
    casting,
    cast(tiles, from, to) {
      const c = casting();
      let k = 0;
      for (let n = from; n < to; n++)
        for (const p of placed[tiles[n]])
          p.matrix.toArray(c.matrices.array, 16 * k++);
      c.count = k;
      send(c.matrices, k, 16);
    },
  };
}
