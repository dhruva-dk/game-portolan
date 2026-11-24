import { Vector2, Vector3, type Matrix4, type TextureNode } from 'three/webgpu';
import {
  Fn,
  dot,
  exp,
  float,
  int,
  interleavedGradientNoise,
  max,
  min,
  rtt,
  screenCoordinate,
  select,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  loop,
  type FloatNode,
  type Vec2Node,
  type Vec3Node,
  type Vec4Node,
} from '../tsl.ts';
const TAPS = 16;
const FLOOR = 0.12,
  CLAMP = 0.5;
const AROUND = 9,
  THIN = 2.2;
const DECAY = 0.93;
const LOOSEN = 1.5,
  OFF_FADE = 0.8;

interface Seen {
  readonly position: readonly number[];
  readonly world: Matrix4;
  readonly projection: Matrix4;
  readonly viewProjection: Matrix4;
}

export function createShafts(scene: TextureNode, depth: TextureNode) {
  const sun = uniform(new Vector2(0.5, 0.5));
  const aspect = uniform(1);
  const strength = uniform(0);
  const around = uniform(AROUND),
    thinning = uniform(THIN);

  const offset = (p: Vec2Node) => p.sub(sun).mul(vec2(aspect, 1));
  const mask = Fn(() => {
    const sky = select(
      depth.sample(uv()).x.greaterThanEqual(1),
      float(1),
      float(0)
    );
    const d = offset(uv());
    const bright = min(
      max(scene.sample(uv()).rgb.sub(FLOOR), vec3(0)),
      vec3(CLAMP)
    );
    return vec4(bright.mul(sky).mul(exp(dot(d, d).mul(around.negate()))), 1);
  })();
  const q = (n: Vec4Node) =>
    rtt(n, null, null, { resolutionScale: 1 / 4, depthBuffer: false });
  const blur = (source: TextureNode, span: number, thin: FloatNode) =>
    Fn(() => {
      const step = sun.sub(uv()).mul(span / TAPS);
      const at = uv()
        .add(step.mul(interleavedGradientNoise(screenCoordinate)))
        .toVar();
      const sum = vec3(0).toVar(),
        w = float(1).toVar(),
        total = float(0).toVar();
      loop('tap', int(TAPS), () => {
        sum.addAssign(source.sample(at).rgb.mul(w));
        total.addAssign(w);
        w.mulAssign(DECAY);
        at.addAssign(step);
      });
      const d = offset(uv());
      return vec4(sum.div(total).mul(exp(dot(d, d).mul(thin.negate()))), 1);
    })();
  const first = q(mask);
  const second = q(blur(first, 1, float(0)));
  const shafts = q(blur(second, 1 / TAPS, thinning));

  const ahead = new Vector3(),
    toward = new Vector3(),
    p = new Vector3(),
    at = new Vector3();
  return {
    light: (): Vec3Node => shafts.sample(uv()).rgb.mul(strength),
    update(eye: Seen, sunDirection: readonly number[], amount: number) {
      toward.set(sunDirection[0], sunDirection[1], sunDirection[2]);
      ahead.setFromMatrixColumn(eye.world, 2).negate().normalize();
      const facing = ahead.dot(toward);
      p.copy(toward)
        .multiplyScalar(1000)
        .add(at.fromArray(eye.position))
        .applyMatrix4(eye.viewProjection);
      sun.value.set((p.x + 1) / 2, (1 - p.y) / 2);
      aspect.value = eye.projection.elements[5] / eye.projection.elements[0];
      const off = Math.max(Math.abs(p.x) - 1, Math.abs(p.y) - 1, 0),
        loose = (1 + off * LOOSEN) ** 2;
      around.value = AROUND / loose;
      thinning.value = THIN / loose;
      strength.value =
        facing <= 0
          ? 0
          : amount * Math.min(1, facing * 3) * Math.exp(-off * OFF_FADE);
    },
  };
}

export type Shafts = ReturnType<typeof createShafts>;
