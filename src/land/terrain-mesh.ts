// The ground, under the sea and over it (world/terrain.ts): the patches
// terrain-lod.ts selects, each an instance of one grid of P × P quads with a
// skirt round its edge, all drawn in one call. The grid is anchored to the
// planet, not the eye: ground that slides under a moving eye swims at its
// silhouettes, which water hides and bare land would not.
//
// Each vertex is placed in the vertex shader: its grid point on its patch,
// morphed toward its parent's grid by its distance from the eye
// (terrain-lod.ts), mapped onto its cube face equi-angularly (tan), onto the
// sphere, and raised to the ground's height there (ground.ts, the baked height
// texture: the same the sea floor and the shading read). The morph's distance
// is to the vertex at sea level, so the two patches sharing an edge work out
// the same morph there from the same arithmetic. The skirt's vertices hang
// below the edge by the patch's skirt depth, so any hairline between patches
// shows ground, never sky. The look is the ground's at each pixel's world
// position (sand.ts), its normal the ground's there: the mesh gives the shape,
// never the shading, so its level of detail never shows in it.

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

/**
 * The most patches drawn at once (a few hundred from the sea; more from high
 * up, where they are coarse).
 */
const MOST = 4096;

/**
 * One patch's grid, its vertices at (i/P, j/P, 0), and its skirt's below its
 * edge at (…, 1).
 */
function patchGeometry(): InstancedBufferGeometry {
  const P = LOD.P,
    positions: number[] = [],
    index: number[] = [];
  for (let j = 0; j <= P; j++)
    for (let i = 0; i <= P; i++) positions.push(i / P, j / P, 0);
  const at = (i: number, j: number) => j * (P + 1) + i;
  // each quad cut from (i+1, j) to (i, j+1): the morph slides odd vertices onto
  // the even ones below them, and cut this way a fully morphed 2 × 2 block of
  // quads is its parent's quad, cut the same way. Counter-clockwise in (u, v)
  // is outward on every face (sphere.ts FACES: u × v = across).
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
  // the skirt: a strip from the edge, walked round, down to the same points
  // below it, facing both ways
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
  // terrain-lod.ts STRIDE: corner and size; skirt and morph; the face's axes
  // (not 'patch': WGSL keeps that word)
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
    // how far through its morph, by the distance to the vertex at sea level;
    // odd grid points slide to the even below
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

  // whether a patch's bounds lie in the view of the eye being drawn for
  const bounds = new Sphere();
  let frustum: Eye['frustum'] | null = null;
  const inView = (x: number, y: number, z: number, radius: number) => {
    bounds.center.set(x, y, z);
    bounds.radius = radius;
    return frustum !== null && frustum.intersectsSphere(bounds);
  };

  return {
    mesh,
    /** Chooses the patches for `eye`, and sends them. */
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
