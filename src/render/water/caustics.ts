import {
  Fn,
  If,
  dFdx,
  dFdy,
  dot,
  float,
  length,
  log2,
  max,
  mix,
  smoothstep,
  sqrt,
  texture,
  vec2,
  vec3,
} from 'three/tsl';
import type { Sky } from '../sky/sky.ts';
import type { Charts } from '../view/charts.ts';
import type { View } from '../view/view.ts';
import { CASCADES, LONG, SIZE } from '../../world/cascades.ts';
import { N_WATER } from './optics.ts';
import { CURVED, type Waves } from './waves.ts';
import type { FloatNode, Vec3Node } from '../tsl.ts';

const FOCUS = 2.5;
const PIXELS = 4;
const BLUR = 0.05;

export function createCaustics(
  view: View,
  sky: Sky,
  waves: Waves,
  charts: Charts,
  shallows: (p: Vec3Node) => { long: FloatNode; short: FloatNode }
) {
  return (p: Vec3Node): FloatNode =>
    Fn(() => {
      const up = view.up(p);
      const depth = max(view.altitude(p).negate(), 0);
      const { long, short } = shallows(p);
      const l = sky.sun(p),
        ly = dot(l, up),
        flat = l.sub(up.mul(ly));
      const bent = sqrt(float(1).sub(ly.mul(ly))).div(N_WATER);
      const across = flat
        .div(max(length(flat), 1e-4))
        .mul(depth.mul(bent).div(sqrt(float(1).sub(bent.mul(bent)))));
      const footprint = max(length(dFdx(p)), length(dFdy(p)));
      const width = max(footprint.mul(PIXELS), depth.mul(BLUR));
      const E1 = vec3(1, 0, 0).toVar(),
        E2 = vec3(0, 0, 1).toVar(),
        H = vec3(0).toVar();
      If(depth.greaterThan(0), () =>
        charts.each(p, (c, slot) => {
          if (slot === 0) {
            E1.assign(c.e1);
            E2.assign(c.e2);
          }
          const entry = c.q.add(vec2(dot(across, c.e1), dot(across, c.e2)));
          let h: Vec3Node = vec3(0);
          CURVED.forEach((k, i) => {
            const L = CASCADES[k];
            const lod = log2(max(width.div(L / SIZE), 1));
            h = h.add(
              texture(waves.curvature[i], entry.div(L))
                .level(lod)
                .xyz.mul(k < LONG ? long : short)
            );
          });
          const a = dot(c.e1, E1),
            b = dot(c.e2, E1),
            e = dot(c.e1, E2),
            d = dot(c.e2, E2);
          H.addAssign(
            vec3(
              h.x
                .mul(a.mul(a))
                .add(h.y.mul(b.mul(b)))
                .add(h.z.mul(a.mul(b).mul(2))),
              h.x
                .mul(e.mul(e))
                .add(h.y.mul(d.mul(d)))
                .add(h.z.mul(e.mul(d).mul(2))),
              h.x
                .mul(a.mul(e))
                .add(h.y.mul(b.mul(d)))
                .add(h.z.mul(a.mul(d).add(b.mul(e))))
            ).mul(c.w)
          );
        })
      );
      const f = depth
        .div(sqrt(float(1).add(depth.div(FOCUS).pow(2))))
        .mul(1 - 1 / N_WATER);
      const J = float(1)
        .add(f.mul(H.x))
        .mul(float(1).add(f.mul(H.y)))
        .sub(f.mul(H.z).mul(f.mul(H.z)));
      return mix(
        float(1),
        float(1).div(max(J.abs(), 0.15)),
        smoothstep(0, 0.3, depth)
      );
    })();
}
