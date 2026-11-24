import {
  Fn,
  If,
  cameraPosition,
  float,
  floor,
  fract,
  length,
  mix,
  mx_cell_noise_float,
  select,
  smoothstep,
  vec2,
  vec3,
} from 'three/tsl';
import type { FloatNode, Vec2Node, Vec3Node, Vec4Node } from '../tsl.ts';

const STONE = { cell: 2.4, share: 0.55, radius: [0.12, 0.32], rim: 0.15 };
const TUFT = { cell: 3.2, share: 0.4, radius: [0.18, 0.38], rim: 0.3 };
const CRISP = 0.06;
const NEAR = 50,
  FAR = 90;
const SHALLOWEST = 0.3;

const ball = (
  p: Vec3Node,
  share: number,
  radius: number[],
  k: number
): FloatNode => {
  const cell = floor(p),
    f = fract(p);
  const h = (o: number): FloatNode =>
    mx_cell_noise_float(cell.add(k + o * 7.31));
  const r = mix(float(radius[0]), float(radius[1]), h(0));
  const centre = vec3(h(1), h(2), h(3))
    .mul(float(1).sub(r.mul(2)))
    .add(r);
  const inside = float(1)
    .sub(length(f.sub(centre)).div(r))
    .clamp(0, 1);
  return inside.mul(select(h(4).lessThan(share), float(1), float(0)));
};

export function createStrewn() {
  const mean = (s: typeof STONE) =>
    s.share * Math.PI * ((s.radius[0] + s.radius[1]) / 2) ** 2 * 0.55;
  return Fn(([p, height, cover]: [Vec3Node, FloatNode, Vec4Node]): Vec2Node => {
    const deep = smoothstep(-SHALLOWEST, -SHALLOWEST - 0.5, height);
    const stones = deep.mul(cover.y.mul(0.85).add(0.15)),
      tufts = deep.mul(smoothstep(0.02, 0.4, cover.x).mul(0.8).add(0.2));
    const s = stones.mul(mean(STONE)).toVar(),
      t = tufts.mul(mean(TUFT)).toVar();
    const far = length(p.sub(cameraPosition));
    If(far.lessThan(FAR).and(deep.greaterThan(0)), () => {
      const fade = smoothstep(NEAR, FAR, far);
      const shape = (
        lattice: typeof STONE,
        thick: FloatNode,
        k: number
      ): FloatNode => {
        const into = ball(
          p.div(lattice.cell),
          lattice.share,
          lattice.radius,
          k
        ).mul(thick.mul(0.6).add(0.4));
        return smoothstep(lattice.rim, lattice.rim + CRISP, into);
      };
      s.assign(mix(shape(STONE, stones, 0), s, fade));
      t.assign(mix(shape(TUFT, tufts, 101), t, fade));
    });
    return vec2(s, t);
  });
}
