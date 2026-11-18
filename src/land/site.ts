// Where the islands' things lie on the planet. An island's ground (world/planet.ts) and what stands on it
// (world/scatter.ts) are worked out flat, in metres on the island's own chart (world/sphere.ts); this lays them on
// the sphere: a chart point and a height become a world position, and the chart's x, up and z there become what
// stands there's axes.
//
// Each kind of thing comes in a few shapes, each drawn once (instanced) for all of that shape on the islands in
// view: the islands' instances are written into the shape's buffer nearest island first, and only those in view
// are drawn — the buffer is rewritten only when the islands in view change.

import { InstancedBufferAttribute, InstancedMesh, Matrix4, Vector3, type BufferGeometry, type Material } from 'three/webgpu';
import { chartBasis, fromChart, place, type Chart, type Vec3 } from '../world/sphere';

/** The world position `height` metres up at chart point (x, z), and the chart's axes there: x (e1), up, z (e2). */
export function onSphere(chart: Chart, x: number, height: number, z: number): { p: Vec3; e1: Vec3; up: Vec3; e2: Vec3 } {
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

/** Past this many metres from the eye, the palms and shrubs on an island are drawn coarser (palms.ts, shrubs.ts): a
 *  palm is some sixty pixels tall, its leaflets a pixel or two across. */
export const DETAIL = 90;

/** One instance: its world matrix, and its tint (0…1) for shapes that take one. */
export interface Placed { matrix: Matrix4; tint?: number }

export interface Instances {
  mesh: InstancedMesh;
  /** How many of those drawn stand on the first `nearby` islands shown (they come first). */
  near: number;
  /** Draws the instances on these islands (indices into the list it was made with), nearest first; the first `nearby`
   *  of them make up `near`. */
  show(islands: number[], nearby?: number): void;
}

/** One shape's instances, `placed[i]` those on island i. With tints, the geometry gets an instanced 'tint'. */
export function createInstances(geometry: BufferGeometry, material: Material, placed: Placed[][], tinted = false): Instances {
  const total = Math.max(1, placed.reduce((n, p) => n + p.length, 0));
  const mesh = new InstancedMesh(geometry, material, total);
  const tint = new InstancedBufferAttribute(new Float32Array(total), 1);
  if (tinted) geometry.setAttribute('tint', tint);
  mesh.count = 0;
  // the instances stand all over the planet; whether an island is in view is decided per island
  mesh.frustumCulled = false;
  const self: Instances = {
    mesh,
    near: 0,
    show(islands, nearby = 1) {
      let k = 0;
      self.near = 0;
      islands.forEach((i, n) => {
        for (const p of placed[i]) {
          mesh.setMatrixAt(k, p.matrix);
          tint.setX(k++, p.tint ?? 0);
        }
        if (n < nearby) self.near = k;
      });
      mesh.count = k;
      // (only what is drawn goes up to the GPU)
      for (const [a, size] of [[mesh.instanceMatrix, 16], [tint, 1]] as const) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, k * size);
        a.needsUpdate = true;
      }
    },
  };
  return self;
}
