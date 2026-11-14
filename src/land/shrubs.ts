// The beach shrubs (scatter.ts says where). A few shapes, each drawn once for all its shrubs on the islands in view
// (site.ts).
//
// A shrub: a few overlapping rounded masses of fleshy leaves, each leaf its own two triangles (no cut-out texture).
// Leaves lie mostly on the masses' surfaces, some inside. Each leaf's normal is bent halfway toward its mass's: the
// many small leaves of a dense bush, taken together, shade like the bush's rounded surface, which one leaf's own
// facing alone would scatter into noise. Leaves deeper in a mass see less of the sky and are darker.

import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, Matrix4,
  MeshBasicNodeMaterial, Quaternion, Vector3,
} from 'three/webgpu';
import { Fn, attribute, mix, normalWorldGeometry, normalize, positionWorld, vec3 } from 'three/tsl';
import { SHRUB } from '../palette';
import { random } from '../world/random';
import type { Shrub } from '../world/scatter';
import type { Chart } from '../world/sphere';
import type { Light } from '../sky/light';
import { createInstances, standing, type Placed } from './site';
import { cut } from '../tsl';

/** How many shapes the shrubs come in. */
export const SHAPES = 4;
const LEAVES = 450;
/** A leaf's length, as a share of the shrub's size. */
const LEAF = 0.095;
/** How much one shrub's green differs from the next's; and how deep in its mass (0.7 the deepest … 1.05 on its
 *  surface) a leaf is drawn in its shadow tone. */
const VARIED = 0.3, SHADED = 0.76;

/** One shrub, 1 across at its widest, standing on y = 0. */
function shape(seed: number): BufferGeometry {
  const rand = random(seed);
  const masses = Array.from({ length: 3 + Math.floor(rand() * 3) }, (_, i) => {
    const a = rand() * 2 * Math.PI, r = i === 0 ? 0 : 0.12 + rand() * 0.18;
    const w = 0.22 + rand() * 0.14;
    return { c: new Vector3(Math.cos(a) * r, 0.15 + rand() * 0.2, Math.sin(a) * r), size: new Vector3(w, w * (0.7 + rand() * 0.3), w) };
  });
  const pos: number[] = [], nrm: number[] = [], depth: number[] = [];
  const dir = new Vector3(), at = new Vector3(), facing = new Vector3(), along = new Vector3(), across = new Vector3();
  for (let i = 0; i < LEAVES; i++) {
    const m = masses[Math.floor(rand() * masses.length)];
    // a direction on the mass, not its underside
    do dir.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1); while (dir.lengthSq() > 1 || dir.lengthSq() < 0.01 || dir.y < -0.4);
    dir.normalize();
    const deep = 0.7 + 0.35 * rand();
    at.copy(dir).multiply(m.size).multiplyScalar(deep).add(m.c);
    if (at.y < 0.03) continue;
    // the leaf faces out from its mass and up, more or less
    facing.copy(dir).addScaledVector(new Vector3(0, 1, 0), 0.5).add(new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5)).normalize();
    along.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(facing).normalize();
    across.copy(facing).cross(along);
    const len = LEAF * (0.7 + 0.5 * rand());
    const base = at.clone().addScaledVector(along, -len / 2), tip = at.clone().addScaledVector(along, len / 2);
    // folded a little along the midrib
    const l = at.clone().addScaledVector(across, len * 0.28).addScaledVector(facing, -len * 0.08);
    const r = at.clone().addScaledVector(across, -len * 0.28).addScaledVector(facing, -len * 0.08);
    const n = facing.clone().add(dir).normalize();
    for (const p of [base, r, tip, base, tip, l]) {
      pos.push(p.x, p.y, p.z);
      nrm.push(n.x, n.y, n.z);
      depth.push(deep);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nrm, 3));
  g.setAttribute('depth', new Float32BufferAttribute(depth, 1));
  return g;
}

/** shrubs[i]: those on island i, whose chart is charts[i]; each one of SHAPES shapes. */
export function createShrubs(shrubs: Shrub[][], charts: Chart[], light: Light) {
  const material = new MeshBasicNodeMaterial({ side: DoubleSide });
  material.colorNode = Fn(() => {
    // the normal as the shape has it, bent toward its mass's, whichever side of the leaf is seen: the bush is lit as
    // one rounded thing
    const p = positionWorld, n = normalize(normalWorldGeometry);
    // each shrub a little paler or darker than the next; and deep in a mass, where less of the sky reaches, a leaf
    // keeps its shadow tone
    const own = attribute('tint', 'float').sub(0.5).mul(VARIED).add(1);
    const shadow = vec3(...SHRUB.shadow).mul(own);
    return light.toon(p, n, mix(shadow, vec3(...SHRUB.lit).mul(own), cut(attribute('depth', 'float'), SHADED)), shadow);
  })();

  const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), zero = new Vector3(), up = new Vector3(0, 1, 0);
  return Array.from({ length: SHAPES }, (_, k) => createInstances(shape(k + 101), material,
    shrubs.map((on, i) => on.filter((b) => b.shape === k).map((b): Placed => {
      m.compose(zero, q.setFromAxisAngle(up, b.yaw), s.set(b.size, b.size * 0.8, b.size));
      return { matrix: standing(charts[i], b.x, b.y - 0.05 * b.size, b.z, m, new Matrix4()), tint: b.tint };
    })), true));
}
