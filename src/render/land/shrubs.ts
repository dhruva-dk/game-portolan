import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Matrix4,
  MeshBasicNodeMaterial,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import {
  Fn,
  attribute,
  mix,
  normalWorldGeometry,
  normalize,
  positionWorld,
  vec3,
} from 'three/tsl';
import { SHRUB } from '../palette.ts';
import { random } from '../../world/random.ts';
import type { Shrub } from '../../world/terrain-scatter.ts';
import type { Chart } from '../../world/sphere.ts';
import type { Light } from '../sky/light.ts';
import {
  createInstances,
  standing,
  type Instances,
  type Placed,
} from './site.ts';
import { cut } from '../tsl.ts';

export const SHAPES = 4;
const LEAVES = 450;
const LEVELS = [
  { name: 'shrubs', leaves: LEAVES, shapes: SHAPES },
  { name: 'shrubs coarse', leaves: 70, shapes: SHAPES },
  { name: 'shrubs far', leaves: 20, shapes: 1 },
];
const LEAF = 0.095;
const VARIED = 0.3,
  SHADED = 0.76;

function shape(seed: number, leaves: number): BufferGeometry {
  const rand = random(seed);
  const masses = Array.from({ length: 3 + Math.floor(rand() * 3) }, (_, i) => {
    const a = rand() * 2 * Math.PI,
      r = i === 0 ? 0 : 0.12 + rand() * 0.18;
    const w = 0.22 + rand() * 0.14;
    return {
      c: new Vector3(Math.cos(a) * r, 0.15 + rand() * 0.2, Math.sin(a) * r),
      size: new Vector3(w, w * (0.7 + rand() * 0.3), w),
    };
  });
  const pos: number[] = [],
    nrm: number[] = [],
    depth: number[] = [];
  const dir = new Vector3(),
    at = new Vector3(),
    facing = new Vector3(),
    along = new Vector3(),
    across = new Vector3();
  const up = new Vector3(0, 1, 0),
    stray = new Vector3();
  const size = LEAF * Math.sqrt(LEAVES / leaves);
  for (let i = 0; i < leaves; i++) {
    const m = masses[Math.floor(rand() * masses.length)];
    do dir.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    while (dir.lengthSq() > 1 || dir.lengthSq() < 0.01 || dir.y < -0.4);
    dir.normalize();
    const deep = 0.7 + 0.35 * rand();
    at.copy(dir).multiply(m.size).multiplyScalar(deep).add(m.c);
    if (at.y < 0.03) continue;
    facing
      .copy(dir)
      .addScaledVector(up, 0.5)
      .add(stray.set(rand() - 0.5, rand() - 0.5, rand() - 0.5))
      .normalize();
    along
      .set(rand() - 0.5, rand() - 0.5, rand() - 0.5)
      .cross(facing)
      .normalize();
    across.copy(facing).cross(along);
    const len = size * (0.7 + 0.5 * rand());
    const base = at.clone().addScaledVector(along, -len / 2),
      tip = at.clone().addScaledVector(along, len / 2);
    const l = at
      .clone()
      .addScaledVector(across, len * 0.28)
      .addScaledVector(facing, -len * 0.08);
    const r = at
      .clone()
      .addScaledVector(across, -len * 0.28)
      .addScaledVector(facing, -len * 0.08);
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

export function createShrubs(
  shrubs: Shrub[][],
  charts: Chart[],
  light: Light
): Instances[][] {
  const material = new MeshBasicNodeMaterial({ side: DoubleSide });
  material.colorNode = Fn(() => {
    const p = positionWorld,
      n = normalize(normalWorldGeometry);
    const own = attribute('tint', 'float').sub(0.5).mul(VARIED).add(1);
    const shadow = vec3(...SHRUB.shadow).mul(own);
    return light.toon(
      p,
      n,
      mix(
        shadow,
        vec3(...SHRUB.lit).mul(own),
        cut(attribute('depth', 'float'), SHADED)
      ),
      shadow
    );
  })();

  const m = new Matrix4(),
    q = new Quaternion(),
    s = new Vector3(),
    zero = new Vector3(),
    up = new Vector3(0, 1, 0);
  const all = shrubs.map((on, i) =>
    on.map((b): Placed & { shape: number } => {
      m.compose(
        zero,
        q.setFromAxisAngle(up, b.yaw),
        s.set(b.size, b.size * 0.8, b.size)
      );
      return {
        matrix: standing(
          charts[i],
          b.x,
          b.y - 0.05 * b.size,
          b.z,
          m,
          new Matrix4()
        ),
        tint: b.tint,
        shape: b.shape,
      };
    })
  );
  return LEVELS.map(({ name, leaves, shapes }) =>
    Array.from({ length: shapes }, (_, k) =>
      createInstances(
        `${name} ${k}`,
        shape(k + 101, leaves),
        material,
        all.map((on) => on.filter((b) => b.shape % shapes === k)),
        true
      )
    )
  );
}
