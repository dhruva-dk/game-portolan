import {
  Float32BufferAttribute,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshBasicNodeMaterial,
  Sphere,
} from 'three/webgpu';
import {
  Fn,
  attribute,
  clamp,
  distance,
  fract,
  normalize,
  positionGeometry,
  positionWorld,
  tan,
} from 'three/tsl';
import type { Vec2Node } from '../tsl.ts';
import type { Eye, View } from '../view/view.ts';
import { R } from '../world/sphere.ts';
import { heightBounds, type Terrain } from '../world/terrain.ts';
import type { Ground } from './ground.ts';
import type { Sand } from './sand.ts';
import { LOD, STRIDE, createLod } from './terrain-lod.ts';

const MOST = 4096;

function patchGeometry(): InstancedBufferGeometry {
  const P = LOD.P,
    positions: number[] = [],
    index: number[] = [];
  for (let j = 0; j <= P; j++)
    for (let i = 0; i <= P; i++) positions.push(i / P, j / P, 0);
  const at = (i: number, j: number) => j * (P + 1) + i;
  for (let j = 0; j < P; j++)
    for (let i = 0; i < P; i++) {
      index.push(
        at(i, j),
        at(i + 1, j),
        at(i, j + 1),
        at(i + 1, j),
        at(i + 1, j + 1),
        at(i, j + 1)
      );
    }
  const edge: [number, number][] = [];
  for (let k = 0; k < P; k++) edge.push([k, 0]);
  for (let k = 0; k < P; k++) edge.push([P, k]);
  for (let k = P; k > 0; k--) edge.push([k, P]);
  for (let k = P; k > 0; k--) edge.push([0, k]);
  const first = positions.length / 3;
  for (const [i, j] of edge) positions.push(i / P, j / P, 1);
  edge.forEach(([i, j], k) => {
    const next = (k + 1) % edge.length,
      [i2, j2] = edge[next];
    const a = at(i, j),
      b = at(i2, j2),
      c = first + k,
      d = first + next;
    index.push(a, c, b, b, c, d, a, b, c, b, d, c);
  });
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

export function createTerrainMesh(
  view: View,
  ground: Ground,
  sand: Sand,
  terrain: Terrain
) {
  const lod = createLod(heightBounds(terrain, 2 ** LOD.LEAF));
  const geometry = patchGeometry();
  const list = new Float32Array(MOST * STRIDE),
    patches = new InstancedInterleavedBuffer(list, STRIDE);
  const field = (name: string, offset: number) =>
    geometry.setAttribute(
      name,
      new InterleavedBufferAttribute(patches, 3, offset)
    );
  field('tile', 0);
  field('morph', 3);
  field('across', 6);
  field('faceU', 9);
  field('faceV', 12);
  geometry.instanceCount = 0;

  const material = new MeshBasicNodeMaterial();
  material.positionNode = Fn(() => {
    const patch = attribute('tile', 'vec3'),
      morph = attribute('morph', 'vec3');
    const across = attribute('across', 'vec3'),
      faceU = attribute('faceU', 'vec3'),
      faceV = attribute('faceV', 'vec3');
    const onFace = (g: Vec2Node) => {
      const uv = patch.xy.add(g.mul(patch.z)).mul(Math.PI / 4);
      return normalize(
        across.add(faceU.mul(tan(uv.x))).add(faceV.mul(tan(uv.y)))
      );
    };
    const g = positionGeometry.xy;
    const k = clamp(
      distance(onFace(g).mul(R), view.position)
        .sub(morph.y)
        .div(morph.z.sub(morph.y)),
      0,
      1
    );
    const odd = fract(g.mul(LOD.P / 2)).mul(2 / LOD.P);
    const up = onFace(g.sub(odd.mul(k)));
    return view.place(
      up,
      ground.height(up).sub(positionGeometry.z.mul(morph.x))
    );
  })();
  material.colorNode = Fn(() =>
    sand(positionWorld, ground.normal(positionWorld))
  )();
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;

  const bounds = new Sphere();
  let frustum: Eye['frustum'] | null = null;
  const inView = (x: number, y: number, z: number, radius: number) => {
    bounds.center.set(x, y, z);
    bounds.radius = radius;
    return frustum !== null && frustum.intersectsSphere(bounds);
  };

  return {
    mesh,
    update(eye: Eye) {
      frustum = eye.frustum;
      const count = lod.select(eye, inView, list);
      geometry.instanceCount = count;
      patches.clearUpdateRanges();
      patches.addUpdateRange(0, count * STRIDE);
      patches.needsUpdate = true;
    },
  };
}
