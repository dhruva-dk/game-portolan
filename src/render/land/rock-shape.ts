import {
  Float32BufferAttribute,
  IcosahedronGeometry,
  Vector3,
  type BufferGeometry,
} from 'three/webgpu';
import {
  mergeVertices,
  toCreasedNormals,
} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNoise3 } from '../../world/noise3.ts';
import { random } from '../../world/random.ts';
import { smoothstep } from '../../world/scalar.ts';

const CREASE = 0.6;

export function rockShape(
  seed: number,
  detail: number,
  big: boolean
): BufferGeometry {
  const rand = random(seed * 131 + 7),
    noise = createNoise3(seed);
  let g: BufferGeometry = new IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);

  const joints = Array.from(
    { length: (big ? 7 : 6) + Math.floor(rand() * 4) },
    () => {
      const a = rand() * 2 * Math.PI,
        up = rand() * 1.4 - 0.3;
      return {
        n: new Vector3(Math.cos(a), up, Math.sin(a)).normalize(),
        at: (big ? 0.72 : 0.6) + rand() * 0.22,
      };
    }
  );
  const dip = new Vector3(
    rand() * 0.6 - 0.3,
    1,
    rand() * 0.6 - 0.3
  ).normalize();
  const bed = big ? 0.3 + rand() * 0.15 : 0.35;
  const stretch = big
    ? new Vector3(1, 0.85 + rand() * 0.3, 0.75 + rand() * 0.3)
    : new Vector3(1, 0.55 + rand() * 0.3, 0.7 + rand() * 0.4);

  const pos = g.getAttribute('position'),
    cavity = new Float32Array(pos.count),
    p = new Vector3();
  const v = (q: Vector3, f: number, k: number) =>
    noise.value(q.x * f + k * 17.1, q.y * f + k * 5.3, q.z * f + k * 11.7);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    p.multiplyScalar(
      1 + 0.28 * v(p, 0.8, 0) + 0.12 * v(p, 1.9, 1) + 0.04 * v(p, 4.5, 2)
    );
    for (const { n, at } of joints) {
      const over = p.dot(n) - at;
      if (over > 0) p.addScaledVector(n, -over);
    }
    const s = p.dot(dip) / bed + 0.25 * v(p, 2.2, 3);
    const under = s - Math.floor(s);
    const crack = Math.max(
      smoothstep(0.2, 0, Math.abs(v(p, 1.3, 4))),
      0.7 * smoothstep(0.12, 0, Math.abs(v(p, 2.6, 5)))
    );
    const ledge = big ? 0.12 * under * under : 0;
    const inward = 1 - ledge - 0.16 * crack;
    p.x *= inward;
    p.z *= inward;
    p.y *= 1 - 0.08 * crack;
    p.multiply(stretch);
    pos.setXYZ(i, p.x, p.y, p.z);
    cavity[i] = Math.max(crack, big ? 0.6 * under ** 3 : 0);
  }
  g.setAttribute('cavity', new Float32BufferAttribute(cavity, 1));
  return toCreasedNormals(g, CREASE);
}
