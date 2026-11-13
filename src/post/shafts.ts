// Light shafts: the sun's light caught in the haze, streaming from the bright sky round the sun past whatever stands
// in front of it (the clouds' dark cores, the ships' canvas and rigging, an island's palms). In screen space, after
// Mitchell ("Volumetric Light Scattering as a Post-Process", GPU Gems 3, 13): the sky's light near the sun, where no
// geometry stands, is blurred along the rays from the sun's place on the screen, two passes of TAPS taps (the second
// a TAPS-th of the first's span, filling its gaps: TAPS² taps effective), at a quarter of the frame's size.
//
// Cost at the phone's 956×440: 3 passes at 239×110 — one of 2 taps, two of 16 — about 0.9 M taps a frame.

import { Vector2, Vector3, type PerspectiveCamera, type TextureNode } from 'three/webgpu';
import { Fn, dot, exp, float, int, interleavedGradientNoise, max, min, rtt, screenCoordinate, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { loop, type Vec2Node, type Vec3Node, type Vec4Node } from '../tsl';

/** Taps along a ray in each of the two passes. */
const TAPS = 16;
/** The sky's light past FLOOR (per unit sun) makes shafts, up to CLAMP, so the sun's disc does not swamp them and
 *  only the brightest gaps cast them: a uniform glow round the sun would only veil the frame. */
const FLOOR = 0.12, CLAMP = 0.5;
/** How tightly round the sun the light is taken (a Gaussian in screen heights), and how fast the shafts thin away
 *  from it. */
const AROUND = 9, THIN = 2.2;
/** Each tap's weight falls by this from the last, along the ray. */
const DECAY = 0.93;

/**
 * Shafts from `scene` (linear light, full size) where `depth` (the scene's, 1 for the sky) says nothing stands. The
 * light's colour is the scene's own; `update` places the sun and sets how strong they are.
 */
export function createShafts(scene: TextureNode, depth: TextureNode) {
  const sun = uniform(new Vector2(0.5, 0.5));
  const aspect = uniform(1);
  const strength = uniform(0);

  const offset = (p: Vec2Node) => p.sub(sun).mul(vec2(aspect, 1));
  const mask = Fn(() => {
    const sky = depth.sample(uv()).x.greaterThanEqual(1).select(float(1), float(0));
    const d = offset(uv());
    return vec4(min(max(scene.sample(uv()).rgb.sub(FLOOR), vec3(0)), vec3(CLAMP)).mul(sky).mul(exp(dot(d, d).mul(-AROUND))), 1);
  })();
  const q = (n: Vec4Node) => rtt(n, null, null, { resolutionScale: 1 / 4, depthBuffer: false });
  const blur = (source: TextureNode, span: number, thin: number) => Fn(() => {
    const step = sun.sub(uv()).mul(span / TAPS);
    const at = uv().add(step.mul(interleavedGradientNoise(screenCoordinate))).toVar();
    const sum = vec3(0).toVar(), w = float(1).toVar(), total = float(0).toVar();
    loop('tap', int(TAPS), () => {
      sum.addAssign(source.sample(at).rgb.mul(w));
      total.addAssign(w);
      w.mulAssign(DECAY);
      at.addAssign(step);
    });
    const d = offset(uv());
    return vec4(sum.div(total).mul(exp(dot(d, d).mul(-thin))), 1);
  })();
  const first = q(mask);
  const second = q(blur(first, 1, 0));
  const shafts = q(blur(second, 1 / TAPS, THIN));

  const ahead = new Vector3(), toward = new Vector3();
  return {
    /** The shafts' light at this pixel of the frame, to add to the scene's. */
    light: (): Vec3Node => shafts.sample(uv()).rgb.mul(strength),
    /**
     * Places the sun on the screen as `camera` sees it along `sunDirection` (world) and sets the shafts' strength:
     * `amount`, faded out as the sun leaves the screen or goes behind the eye.
     */
    update(camera: PerspectiveCamera, sunDirection: readonly number[], amount: number) {
      toward.set(sunDirection[0], sunDirection[1], sunDirection[2]);
      camera.getWorldDirection(ahead);
      const facing = ahead.dot(toward);
      const p = toward.clone().multiplyScalar(1000).add(camera.position).project(camera);
      sun.value.set((p.x + 1) / 2, (1 - p.y) / 2);
      aspect.value = camera.aspect;
      const off = Math.max(Math.abs(p.x) - 1, Math.abs(p.y) - 1, 0);
      strength.value = facing <= 0 ? 0 : amount * Math.min(1, facing * 3) * Math.exp(-off * 1.5);
    },
  };
}

export type Shafts = ReturnType<typeof createShafts>;
