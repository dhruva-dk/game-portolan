import {
  cameraPosition,
  dot,
  float,
  fwidth,
  luminance,
  max,
  mix,
  normalize,
  saturate,
  smoothstep,
  vec3,
} from 'three/tsl';
import type { FloatNode, Vec3Node } from '../tsl.ts';
import type { Sky } from './sky.ts';

interface Below {
  sun(p: Vec3Node): Vec3Node;
  sky(p: Vec3Node): Vec3Node;
}

interface Sides {
  front: FloatNode;
  back: FloatNode;
}

export interface Light {
  toon(p: Vec3Node, n: Vec3Node, lit: Vec3Node, shadow: Vec3Node): Vec3Node;
  polished(
    p: Vec3Node,
    n: Vec3Node,
    lit: Vec3Node,
    shadow: Vec3Node,
    shine: Vec3Node
  ): Vec3Node;
  leaf(
    p: Vec3Node,
    n: Vec3Node,
    lit: Vec3Node,
    shadow: Vec3Node,
    through?: FloatNode
  ): Vec3Node;
  band(p: Vec3Node, n: Vec3Node): FloatNode;
  sides(p: Vec3Node, n: Vec3Node): Sides;
  level(p: Vec3Node): Vec3Node;
}

const TURN = 0.1,
  EDGE = 0.04;
const THROUGH = 0.35;
const CAST = 0.5,
  CAST_EDGE = 0.12,
  CLOUDED = 0.55,
  CLOUD_EDGE = 0.06;
const TINTED = 0.4;
const SHINE = 0.94,
  SHINE_EDGE = 0.012;

export function createLighting(
  sky: Sky,
  below: Below,
  visible: (p: Vec3Node, n: Vec3Node) => FloatNode
): Light {
  const open = (p: Vec3Node, n: Vec3Node): FloatNode => {
    const seen = visible(p, n).toVar(),
      w = max(fwidth(seen), CAST_EDGE);
    return smoothstep(w.negate(), w, seen.sub(CAST)).mul(
      smoothstep(CLOUDED - CLOUD_EDGE, CLOUDED + CLOUD_EDGE, sky.cloudCover(p))
    );
  };
  const turned = (nl: FloatNode, at: number): FloatNode => {
    const w = max(fwidth(nl), EDGE);
    return smoothstep(w.negate(), w, nl.sub(at));
  };
  const band = (p: Vec3Node, n: Vec3Node): FloatNode =>
    turned(dot(n, sky.sun(p)), TURN).mul(open(p, n));
  const sides = (p: Vec3Node, n: Vec3Node): Sides => {
    const nl = dot(n, sky.sun(p)).toVar(),
      clear = open(p, n).toVar();
    return {
      front: turned(nl, TURN).mul(clear),
      back: turned(nl.negate(), THROUGH).mul(clear),
    };
  };
  const level = (p: Vec3Node): Vec3Node => {
    const up = normalize(p);
    const sun = sky
      .sunIlluminance(p)
      .mul(sky.stormSun(p))
      .mul(below.sun(p))
      .mul(saturate(dot(up, sky.sun(p))))
      .div(Math.PI);
    const all = sun.add(sky.ambient(p, up).mul(below.sky(p)));
    return mix(vec3(luminance(all)), all, TINTED);
  };
  const toon = (
    p: Vec3Node,
    n: Vec3Node,
    lit: Vec3Node,
    shadow: Vec3Node
  ): Vec3Node => mix(shadow, lit, band(p, n)).mul(level(p));
  return {
    toon,
    band,
    sides,
    level,
    polished(p, n, lit, shadow, shine) {
      const l = sky.sun(p),
        sunlit = band(p, n).toVar();
      const nh = dot(n, normalize(normalize(cameraPosition.sub(p)).add(l)));
      const w = max(fwidth(nh), SHINE_EDGE);
      const glint = smoothstep(
        float(SHINE).sub(w),
        float(SHINE).add(w),
        nh
      ).mul(sunlit);
      return mix(mix(shadow, lit, sunlit), shine, glint).mul(level(p));
    },
    leaf(p, n, lit, shadow, through) {
      const s = sides(p, n);
      const back = through ? s.back.mul(through) : s.back;
      return mix(shadow, lit, max(s.front, back)).mul(level(p));
    },
  };
}
