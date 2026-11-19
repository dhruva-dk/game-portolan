// Where the land's things lie on the planet. What stands on a tile of the land (world/terrain-scatter.ts) is worked out
// flat, in metres on the tile's own chart (world/sphere.ts); this lays them on the sphere: a chart point and a height
// become a world position, and the chart's x, up and z there become what stands there's axes.
//
// Each kind of thing comes in a few shapes, each drawn once (instanced) for all of that shape on the tiles in view:
// the tiles' instances are written into the shape's buffer nearest tile first, and only those in view are drawn — the
// buffer is rewritten only when the tiles in view change.

import { InstancedBufferAttribute, InstancedMesh, Matrix4, Vector3, type BufferGeometry, type Material } from 'three/webgpu';
import { chartBasis, fromChart, place, type Chart, type Vec3 } from '../world/sphere.ts';

/** The world position `height` metres up at chart point (x, z), and the chart's axes there: x (e1), up, z (e2). */
function onSphere(chart: Chart, x: number, height: number, z: number): { p: Vec3; e1: Vec3; up: Vec3; e2: Vec3 } {
  const up = fromChart(chart, x, z);
  const [e1, e2] = chartBasis(chart, up);
  return { p: place(up, height), e1, up, e2 };
}

const basis = new Matrix4(), e1 = new Vector3(), up = new Vector3(), e2 = new Vector3();

/**
 * The world matrix of a thing standing at chart point (x, z), its foot `height` metres up: its own matrix `local`
 * (turned and scaled, in the chart's axes: x, up, z) carried to the sphere.
 */
export function standing(chart: Chart, x: number, height: number, z: number, local: Matrix4, out: Matrix4): Matrix4 {
  const s = onSphere(chart, x, height, z);
  basis.makeBasis(e1.set(...s.e1), up.set(...s.up), e2.set(...s.e2)).setPosition(...s.p);
  return out.multiplyMatrices(basis, local);
}

/** Past this many metres from the eye, the palms and shrubs on a tile are drawn coarser (palms.ts, shrubs.ts): a
 *  palm is some sixty pixels tall, its leaflets a pixel or two across. */
export const DETAIL = 90;

/** One instance: its world matrix, and its tint (0…1) for shapes that take one. */
export interface Placed { matrix: Matrix4; tint?: number }

export interface Instances {
  mesh: InstancedMesh;
  /** How many of those drawn stand on the first `nearby` tiles shown (they come first). */
  near: number;
  /** Draws the instances on tiles[from…to) (indices into the list it was made with), nearest first; the first
   *  `nearby` of them make up `near`. */
  show(tiles: ArrayLike<number>, from: number, to: number, nearby?: number): void;
}

/** Sends the first `count` items of an instanced attribute (`size` floats each) up to the GPU, and no more. */
function send(attribute: InstancedBufferAttribute, count: number, size: number) {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, count * size);
  attribute.needsUpdate = true;
}

/** One shape's instances, named `name` (for the meter's split: meter.ts), `placed[i]` those on tile i. With tints, the
 *  geometry gets an instanced 'tint'. */
export function createInstances(name: string, geometry: BufferGeometry, material: Material, placed: Placed[][], tinted = false): Instances {
  const total = Math.max(1, placed.reduce((n, p) => n + p.length, 0));
  const mesh = new InstancedMesh(geometry, material, total);
  mesh.name = name;
  const tint = new InstancedBufferAttribute(new Float32Array(total), 1);
  if (tinted) geometry.setAttribute('tint', tint);
  mesh.count = 0;
  // the instances stand all over the planet; whether a tile is in view is decided per tile
  mesh.frustumCulled = false;
  const self: Instances = {
    mesh,
    near: 0,
    show(tiles, from, to, nearby = 1) {
      let k = 0;
      self.near = 0;
      for (let n = from; n < to; n++) {
        const on = placed[tiles[n]];
        for (let j = 0; j < on.length; j++) {
          mesh.setMatrixAt(k, on[j].matrix);
          tint.setX(k++, on[j].tint ?? 0);
        }
        if (n - from < nearby) self.near = k;
      }
      mesh.count = k;
      // (only what is drawn goes up to the GPU)
      send(mesh.instanceMatrix, k, 16);
      send(tint, k, 1);
    },
  };
  return self;
}
