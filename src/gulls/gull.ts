// A flight gull, made in code: a plump body and tail, a round head with a yellow beak and dark sunglasses, a scarf at
// its neck in its crew's sail colour, two wings whose tips are dipped in the crew's paint, and yellow legs. Its own
// frame: +z ahead (the beak), +y up, +x to its left (port, as a ship's), metres, about a metre from beak to tail; its
// feet at y = −FEET.
//
// Every vertex says what it is (`part`: PART), and a wing's which wing (`wing`: +1 the left, −1 the right, 0 none):
// the wings fold and flap about their shoulders (SHOULDER) in the vertex shader (gulls.ts).

import {
  BoxGeometry, BufferAttribute, BufferGeometry, ConeGeometry, CylinderGeometry, Euler, Matrix4, Quaternion, SphereGeometry, TorusGeometry, Vector3,
} from 'three/webgpu';

/** What a vertex is part of. */
export const PART = { feather: 0, wing: 1, tip: 2, beak: 3, shades: 4, scarf: 5 } as const;
/** A wing's shoulder, the left one's (the right's is its mirror): where it folds and flaps about. */
export const SHOULDER = { x: 0.13, y: 0.1, z: 0.04 };
/** How far the feet stand under the gull's middle, metres. */
export const FEET = 0.4;

/** A gull's geometry, built as it is drawn. */
class Build {
  readonly position: number[] = [];
  readonly normal: number[] = [];
  readonly part: number[] = [];
  readonly wing: number[] = [];

  /** Adds `shape` moved by `m` (scaled, turned, placed), as part `part` (or by `partOf` its triangle's middle) and
   *  wing `wing`. */
  add(shape: BufferGeometry, m: Matrix4, part: number, wing = 0, partOf?: (middle: Vector3) => number) {
    const g = (shape.index ? shape.toNonIndexed() : shape).applyMatrix4(m);
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), mid = new Vector3();
    for (let i = 0; i < p.count; i += 3) {
      mid.set(0, 0, 0);
      for (let k = 0; k < 3; k++) mid.x += p.getX(i + k) / 3, mid.y += p.getY(i + k) / 3, mid.z += p.getZ(i + k) / 3;
      const own = partOf ? partOf(mid) : part;
      for (let k = i; k < i + 3; k++) {
        this.position.push(p.getX(k), p.getY(k), p.getZ(k));
        this.normal.push(n.getX(k), n.getY(k), n.getZ(k));
        this.part.push(own);
        this.wing.push(wing);
      }
    }
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.position), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.normal), 3));
    g.setAttribute('part', new BufferAttribute(new Float32Array(this.part), 1));
    g.setAttribute('wing', new BufferAttribute(new Float32Array(this.wing), 1));
    return g;
  }
}

/** A matrix placing a shape: scaled by `size`, turned by Euler angles `turn` (x, y, z, rad), moved to `at`. */
const placed = (at: [number, number, number], size: [number, number, number] = [1, 1, 1], turn: [number, number, number] = [0, 0, 0]) => {
  const q = new Quaternion().setFromEuler(new Euler(...turn));
  return new Matrix4().compose(new Vector3(...at), q, new Vector3(...size));
};

/** A wing, the left one (`side` +1) or the right (−1): a tapered, thin blade from its shoulder out, swept back a
 *  little, its tip a third of it. */
function wing(side: number): BufferGeometry {
  const span = 0.95, g = new BoxGeometry(span, 0.035, 0.34, 4, 1, 1).translate(span / 2, 0, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) / span;
    // narrowing and sweeping back toward the tip, its trailing edge straighter than its leading
    p.setZ(i, p.getZ(i) * (1 - 0.55 * t) - 0.12 * t * t);
    p.setY(i, p.getY(i) * (1 - 0.5 * t));
    p.setX(i, p.getX(i) * side);
  }
  if (side < 0) {
    // mirrored: its faces turned back outward
    const index = g.getIndex()!;
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, a);
    }
  }
  g.computeVertexNormals();
  return g.translate(SHOULDER.x * side, SHOULDER.y, SHOULDER.z);
}

/** The gull's geometry: about 330 triangles. */
export function gullGeometry(): BufferGeometry {
  const b = new Build();
  // the body, the tail and the head
  b.add(new SphereGeometry(1, 10, 7), placed([0, 0, 0], [0.22, 0.2, 0.42]), PART.feather);
  b.add(new BoxGeometry(0.22, 0.04, 0.26), placed([0, 0.04, -0.48], [1, 1, 1], [-0.25, 0, 0]), PART.feather);
  b.add(new SphereGeometry(1, 9, 6), placed([0, 0.24, 0.36], [0.16, 0.16, 0.17]), PART.feather);
  // the beak, pointing ahead, a little down
  b.add(new ConeGeometry(0.05, 0.22, 6), placed([0, 0.2, 0.62], [1, 1, 0.8], [Math.PI / 2 + 0.15, 0, 0]), PART.beak);
  // the sunglasses: two lenses on the face and a bridge between, tipped forward on the beak's line
  for (const x of [-0.07, 0.07]) b.add(new CylinderGeometry(0.065, 0.065, 0.025, 10), placed([x, 0.27, 0.51], [1, 1, 0.8], [Math.PI / 2 - 0.25, 0, x * 2.5]), PART.shades);
  b.add(new BoxGeometry(0.06, 0.018, 0.02), placed([0, 0.28, 0.525]), PART.shades);
  // the scarf, round the neck, its end streaming back
  b.add(new TorusGeometry(0.135, 0.04, 5, 12), placed([0, 0.15, 0.27], [1, 1, 1], [Math.PI / 2 - 0.5, 0, 0]), PART.scarf);
  b.add(new BoxGeometry(0.08, 0.02, 0.2), placed([0.06, 0.2, 0.08], [1, 1, 1], [0.35, 0.3, 0]), PART.scarf);
  // the legs
  for (const x of [-0.07, 0.07]) b.add(new CylinderGeometry(0.018, 0.018, 0.24, 5), placed([x, -0.28, 0.02]), PART.beak);
  // the wings, their tips the crew's paint
  for (const side of [1, -1]) b.add(wing(side), new Matrix4(), PART.wing, side, (m) => (Math.abs(m.x) > SHOULDER.x + 0.62 ? PART.tip : PART.wing));
  return b.geometry();
}
