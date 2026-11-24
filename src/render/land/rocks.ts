import {
  Euler,
  Matrix4,
  MeshBasicNodeMaterial,
  Quaternion,
  Vector3,
} from 'three/webgpu';
import {
  Fn,
  attribute,
  cross,
  dFdx,
  dFdy,
  dot,
  float,
  length,
  max,
  mix,
  normalWorld,
  positionWorld,
  select,
  vec3,
} from 'three/tsl';
import { ROCK } from '../palette.ts';
import type { View } from '../view/view.ts';
import type { Rock } from '../../world/terrain-scatter.ts';
import type { Chart } from '../../world/sphere.ts';
import type { Light } from '../sky/light.ts';
import { rockShape } from './rock-shape.ts';
import { createInstances, standing, type Placed } from './site.ts';
import { cut } from '../tsl.ts';

export const KINDS = { big: { shapes: 4 }, boulder: { shapes: 4 } };
const LEVELS = [
  { name: 'rocks', big: 11, boulder: 4, shapes: 4 },
  { name: 'rocks far', big: 5, boulder: 2, shapes: 4 },
  { name: 'rocks distant', big: 3, boulder: 1, shapes: 4 },
];
const WET_TO = 0.3,
  WET = 0.72;
const CAVITY = 0.5;

export function createRocks(
  rocks: Rock[][],
  charts: Chart[],
  view: View,
  light: Light
) {
  const material = new MeshBasicNodeMaterial();
  material.colorNode = Fn(() => {
    const p = positionWorld;
    const across = cross(dFdx(p), dFdy(p));
    const face = across.div(max(length(across), 1e-12));
    const n = face.mul(
      select(dot(face, normalWorld).lessThan(0), float(-1), float(1))
    );
    const wet = mix(float(WET), float(1), cut(view.altitude(p), WET_TO));
    const shadow = vec3(...ROCK.shadow).mul(wet);
    return light.toon(
      p,
      n,
      mix(
        vec3(...ROCK.lit).mul(wet),
        shadow,
        cut(attribute('cavity', 'float'), CAVITY)
      ),
      shadow
    );
  })();

  const m = new Matrix4(),
    q = new Quaternion(),
    e = new Euler(),
    s = new Vector3(),
    zero = new Vector3();
  const place = (r: Rock, chart: Chart): Placed => {
    e.set(Math.sin(r.yaw * 3) * 0.12, r.yaw, Math.cos(r.yaw * 5) * 0.12);
    m.compose(zero, q.setFromEuler(e), s.setScalar(r.size));
    return { matrix: standing(chart, r.x, r.y, r.z, m, new Matrix4()) };
  };
  const all = rocks.map((on, i) =>
    on.map((r) => ({ ...place(r, charts[i]), big: r.big, shape: r.shape }))
  );
  return LEVELS.map((level) =>
    [true, false].flatMap((big) =>
      Array.from({ length: level.shapes }, (_, k) =>
        createInstances(
          `${level.name} ${k + (big ? 0 : level.shapes)}`,
          rockShape(k + (big ? 1 : 51), big ? level.big : level.boulder, big),
          material,
          all.map((on) =>
            on.filter((r) => r.big === big && r.shape % level.shapes === k)
          )
        )
      )
    )
  );
}
