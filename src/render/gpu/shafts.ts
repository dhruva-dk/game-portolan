// Light shafts, as the first Portolan drew them: the bright sky (clouds included) round the sun or the moon at a quarter of
// the scene's size, then two radial blurs toward the light, sixteen taps along each ray of each, so sixteen times sixteen
// effective taps. Whatever stands in front of the sky (land, a ship, her sails) leaves its shadow in them. Nothing is
// drawn while the light is behind the eye or below the horizon.
import { Vector2, Vector3, type Node, type PerspectiveCamera } from 'three/webgpu';
import { Fn, dot, exp, float, fract, max, min, rtt, screenCoordinate, screenUV, smoothstep, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { P } from './uniforms.ts';

type F = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

/** The size of the shafts against the scene's, each way. */
const SHARE = 0.25;
const TAPS = 16;
/** What the sky is allowed to bring to the shafts, in the light the exposure brings to the screen. */
const CLAMP = 6;
/** The sky's light, against the screen's white, under which it brings nothing to the shafts: a veil over the frame otherwise. */
const FLOOR = 1.2;
/** How much of the shafts' light reaches the frame. */
const GAIN = 0.06;
/** The strength of a moon's shafts, against a low sun's. */
const MOON = 0.35;

interface Pass {
  setResolutionScale(s: number): unknown;
  autoUpdate: boolean;
  sample(uv: V2): V4;
}

const sstep = (x: number, a: number, b: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const WEIGHTS = Array.from({ length: TAPS }, (_, i) => 0.9 ** i);
const TOTAL = WEIGHTS.reduce((s, w) => s + w, 0);

export class Shafts {
  /** The shafts' light, to be added to the scene's ahead of the exposure. */
  readonly node: V3;
  readonly #passes: Pass[];
  readonly #light = uniform(new Vector2(0.5, 0.5));
  readonly #aspect = uniform(1);
  readonly #strength = uniform(0);
  readonly #v = new Vector3();

  /** `colour` is the scene in linear light, `depth` its depth (1 where nothing was drawn but sky), `exposure` the frame's. */
  constructor(colour: V4, depth: F, exposure: F, scale: number) {
    const light = this.#light as unknown as V2, aspect = this.#aspect as unknown as F;
    const from = (uv: V2): V2 => uv.sub(light).mul(vec2(aspect, 1)) as V2;
    const mask = Fn(() => {
      const sky = smoothstep(0.99999, 1, depth);
      const d = from(screenUV as unknown as V2);
      const bright = max(min(colour.rgb, vec3(float(CLAMP).div(exposure))).sub(float(FLOOR).div(exposure)), vec3(0));
      return vec4(bright.mul(sky).mul(exp(dot(d, d).mul(-10))), 1);
    })() as V4;
    const noise = fract(fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715))).mul(52.9829189));
    const blur = (source: Pass, span: number, falloff: number): V4 => Fn(() => {
      const uv0 = screenUV as unknown as V2;
      const step = light.sub(uv0).mul(span / TAPS).toVar();
      const uv = uv0.add(step.mul(noise)).toVar();
      let sum: V3 = vec3(0);
      for (const w of WEIGHTS) {
        sum = sum.add(source.sample(uv as unknown as V2).rgb.mul(w)) as V3;
        uv.addAssign(step);
      }
      const d = from(uv0);
      return vec4(sum.div(TOTAL).mul(exp(dot(d, d).mul(-falloff))), 1);
    })() as V4;
    const first = rtt(mask) as unknown as Pass;
    const second = rtt(blur(first, 1, 0)) as unknown as Pass;
    const third = rtt(blur(second, 1 / TAPS, 2.5)) as unknown as Pass;
    this.#passes = [first, second, third];
    this.rescale(scale);
    this.node = third.sample(screenUV as unknown as V2).rgb.mul(this.#strength as unknown as F) as V3;
  }

  rescale(scale: number): void {
    for (const p of this.#passes) p.setResolutionScale(scale * SHARE);
  }

  /** Once a frame, with the eye and the unit direction up where it is. */
  update(camera: PerspectiveCamera, up: Vector3): void {
    const sun = P.sunDir.value as Vector3, moon = P.moonDir.value as Vector3;
    const sunUp = (Math.asin(Math.min(1, Math.max(-1, up.dot(sun)))) * 180) / Math.PI;
    let strength: number, dir: Vector3;
    if (sunUp > -4) {
      // strongest with a low sun, weaker when it stands high
      strength = sstep(sunUp, -3, 2) * (1 - 0.7 * sstep(sunUp, 12, 40));
      dir = sun;
    } else {
      const moonUp = (Math.asin(Math.min(1, Math.max(-1, up.dot(moon)))) * 180) / Math.PI;
      strength = MOON * sstep(moonUp, 0, 8) * ((P.moonPhase.value as number) > 0 ? 1 : 0);
      dir = moon;
    }
    const v = this.#v.copy(dir).transformDirection(camera.matrixWorldInverse);
    const amount = strength * sstep(-v.z, 0, 0.5) * GAIN;
    const on = amount >= 1e-3;
    this.#strength.value = on ? amount : 0;
    for (const p of this.#passes) p.autoUpdate = on;
    if (!on) return;
    const e = camera.projectionMatrix.elements;
    // in the screen's coordinates, whose v runs downward
    (this.#light.value as Vector2).set(0.5 - (0.5 * (e[0] * v.x + e[8] * v.z)) / v.z, 0.5 + (0.5 * (e[5] * v.y + e[9] * v.z)) / v.z);
    this.#aspect.value = camera.aspect;
  }
}
