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
import { Fn, attribute, faceDirection, mix, normalWorld, normalize, positionWorld, vec3 } from 'three/tsl';
import { random } from '../world/random';
import type { Shrub } from '../world/scatter';
import type { Chart } from '../world/sphere';
import { type Light, leafLight } from '../sky/light';
import { createInstances, standing, type Placed } from './site';
import type { Vec3Node } from '../tsl';

/** How many shapes the shrubs come in. */
export const SHAPES = 4;
const LEAVES = 450;
/** A leaf's length, as a share of the shrub's size. */
const LEAF = 0.095;
/** Leaves' albedo: the shrubs' fleshy green, and the paler, yellower and the darker ends of their range. */
const GREEN = [0.045, 0.07, 0.022];
const PALE = [0.08, 0.095, 0.035];
const DARK = [0.03, 0.05, 0.018];
/** How much of the light on a leaf's far side comes through it: fleshy leaves pass less than a palm's. */
const THROUGH = 0.25;

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
    const p = positionWorld, n = normalize(normalWorld).mul(faceDirection);
    const tint = attribute('tint', 'float');
    let albedo: Vec3Node = mix(mix(vec3(...DARK), vec3(...GREEN), tint.mul(2).clamp(0, 1)), vec3(...PALE), tint.mul(2).sub(1).clamp(0, 1));
    // deeper in, less of the sky
    albedo = albedo.mul(attribute('depth', 'float').sub(0.7).mul(1.6).add(0.45));
    return albedo.mul(leafLight(light, p, n, THROUGH));
  })();

  const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), zero = new Vector3(), up = new Vector3(0, 1, 0);
  return Array.from({ length: SHAPES }, (_, k) => createInstances(shape(k + 101), material,
    shrubs.map((on, i) => on.filter((b) => b.shape === k).map((b): Placed => {
      m.compose(zero, q.setFromAxisAngle(up, b.yaw), s.set(b.size, b.size * 0.8, b.size));
      return { matrix: standing(charts[i], b.x, b.y - 0.05 * b.size, b.z, m, new Matrix4()), tint: b.tint };
    })), true));
}
