// The mist the eye stands in, worked out along each ray to what it reaches: the haze over the sea everywhere, thin,
// thickest on the water and damper by night, with the sea smoke steaming off the cold water round the Ice Crown and
// the mist rolling out of Mistwood folded into it; and the haze of the weather the eye is inside (a squall's, a fog
// bank's, the snow's or the ash's), in its own colour and albedo. The air along a ray is laid out as two columns that
// thin with height, so the extinction between the eye and any point is worked out in closed form; the light the
// mist scatters toward the eye is the sun's, the moon's and the sky's at the eye, the sun's and the moon's under the
// clouds' shade halfway along. Mist scatters forward, so looking toward a light the haze round it blazes. The haze
// (atmosphere/index.ts) and the sky behind everything read it.
import { Vector2, Vector3, Vector4, type WebGPURenderer } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import { Fn, abs, exp, float, instancedArray, max, min, mix, pow, select, uniform, vec3, vec4 } from 'three/tsl';
import { R } from '../../sim/sphere.ts';
import { EYE, MOON_RADIUS, SUN_RADIUS, lightTransmittance } from './luts.ts';
import { skyLight } from './light.ts';
import { SHADE, cloudShade } from './shade.ts';
import { P, shared } from '../gpu/uniforms.ts';

type F = Node<'float'>;
type V3 = Node<'vec3'>;

/** How far along a ray the mist is worked out, metres: past it the air's own tables take over. */
const FAR = 420;
/** The haze over the sea, extinction per metre at the water by day, and the height it thins by e over. The damp of
 *  the night thickens it by NIGHT_DAMP. */
const HAZE = 0.0013, HAZE_HEIGHT = 32, NIGHT_DAMP = 1.5;
/** How strongly mist scatters forward, and ash, whose motes are coarser and darker. */
const G_MIST = 0.72, G_ASH = 0.45;

/** The haze each kind of weather puts in the air: extinction per metre at its middle, albedo, height, tint. */
const WEATHER_HAZE: Record<string, { sigma: number; albedo: number; height: number; tint: [number, number, number]; ash?: boolean }> = {
  rain: { sigma: 0.011, albedo: 0.97, height: 110, tint: [0.92, 0.95, 1] },
  thunder: { sigma: 0.016, albedo: 0.95, height: 150, tint: [0.88, 0.91, 0.97] },
  snow: { sigma: 0.014, albedo: 0.99, height: 120, tint: [0.97, 0.98, 1] },
  fog: { sigma: 0.012, albedo: 0.98, height: 28, tint: [0.96, 0.97, 0.98] },
  ash: { sigma: 0.009, albedo: 0.35, height: 190, tint: [0.62, 0.55, 0.5], ash: true },
};

/** The mist the eye stands in: the haze over the sea (extinction per metre at the water, and the height it thins by e
 *  over) with the sea smoke and Mistwood's mist folded in, and the weather's haze round the eye (the same, its albedo,
 *  and 1 for ash) with its tint. */
const MIST = shared({
  haze: uniform(new Vector2(HAZE, HAZE_HEIGHT)),
  weather: uniform(new Vector4(0, 100, 0.97, 0)),
  tint: uniform(new Vector3(1, 1, 1)),
  /** The light the mist round the eye is lit by: the sun's and the moon's as they reach it, and the sky's, scattered
   *  evenly. Worked out on the GPU at the eye a few times a second and read back (mistLight). */
  sun: uniform(new Vector3()),
  moon: uniform(new Vector3()),
  sky: uniform(new Vector3()),
});

/** How often the mist's light is worked out again, seconds. */
const MIST_LIGHT_EVERY = 0.25;

/** The sun's, the moon's and the sky's light at the eye, for the mist. */
const mistLightAt = instancedArray(3, 'vec4');
const mistLightKernel = Fn(() => {
  const p = EYE.position, r = p.length(), up = p.div(r);
  const sun = lightTransmittance(r, up.dot(P.sunDir), float(SUN_RADIUS)).mul(P.sunIlluminance);
  const moon = lightTransmittance(r, up.dot(P.moonDir), float(MOON_RADIUS)).mul(P.moonIlluminance).mul(P.moonPhase);
  const sky = skyLight(p, up).add(skyLight(p, up.negate())).div(4 * Math.PI);
  mistLightAt.element(0).assign(vec4(sun, 0));
  mistLightAt.element(1).assign(vec4(moon, 0));
  mistLightAt.element(2).assign(vec4(sky, 0));
})().compute(1);

/** The extinction along the segment from height a to height b over the sea, `len` long, through matter that thins
 *  by e every h metres up from `sigma` at the water. */
const column = (sigma: F, h: F, a: F, b: F, len: F): F => {
  const d = b.sub(a);
  const ea = exp(a.max(0).negate().div(h)), eb = exp(b.max(0).negate().div(h));
  return sigma.mul(len).mul(select(abs(d).greaterThan(0.01), ea.sub(eb).mul(h).div(d), ea));
};

/** What the mist holds between the eye and p: the light it has scattered toward the eye (the sun's, the moon's and
 *  the sky's), and how much of p's own light comes through. */
export function fogAt(p: V3): { light: V3; loss: F } {
  const eye = EYE.position, sea = P.planet.y;
  const whole = p.sub(eye).length(), d = p.sub(eye).div(max(whole, 1e-3));
  const len = min(whole, FAR), q = eye.add(d.mul(len));
  const ha = eye.length().sub(sea), hb = q.length().sub(sea);
  const haze = column(MIST.haze.x, MIST.haze.y, ha, hb, len);
  const weather = column(MIST.weather.x, MIST.weather.y, ha, hb, len);
  const loss = exp(haze.add(weather).negate());
  // lit as at the eye, under the clouds' shade halfway along
  const shade = cloudShade(eye.add(q).mul(0.5));
  const sun = MIST.sun.mul(mix(float(1), shade, SHADE.sun)), moon = MIST.moon.mul(mix(shade, float(1), SHADE.sun));
  const g = select(MIST.weather.w.greaterThan(0.5), float(G_ASH), float(G_MIST));
  const scatter = (gg: F) => sun.mul(hgOf(d.dot(P.sunDir), gg)).add(moon.mul(hgOf(d.dot(P.moonDir), gg))).add(MIST.sky);
  // the haze's light, and the weather's in its own albedo and tint, each as its share of what is taken
  const share = weather.div(max(haze.add(weather), 1e-6));
  const albedo = mix(float(0.97), MIST.weather.z, share);
  const tint = mix(vec3(1), MIST.tint, share);
  return { light: scatter(g).mul(albedo).mul(tint).mul(float(1).sub(loss)), loss };
}

/** Henyey and Greenstein's phase function, for an asymmetry worked out on the GPU. */
const hgOf = (c: F, g: F): F => float(1).sub(g.mul(g)).div(pow(float(1).add(g.mul(g)).sub(c.mul(g).mul(2)), 1.5).mul(4 * Math.PI));

/** The mist round the eye: the stage sets it from the weather, and it works out the light the mist is lit by. */
export class Fog {
  #up = new Vector3();
  #reading = false;
  #lightAt = -Infinity;

  /**
   * Lays out the mist for a frame: systems, the weather near and far; smoke and mist, 0…1. Run after the atmosphere
   * has followed the camera.
   */
  update(
    renderer: WebGPURenderer, eye: Vector3,
    systems: readonly { kind: string; at: { x: number; y: number; z: number }; radius: number; strength: number }[],
    smoke: number, mist: { at: Vector3; radius: number; amount: number },
  ): void {
    this.#mistAround(eye, systems, smoke, mist);
    this.#mistLight(renderer);
  }

  /** Works out the mist's light at the eye now and then, and reads it back for the uniforms every material reads. */
  #mistLight(renderer: WebGPURenderer): void {
    const now = performance.now() / 1000;
    if (this.#reading || now - this.#lightAt < MIST_LIGHT_EVERY) return;
    this.#lightAt = now;
    this.#reading = true;
    renderer.compute(mistLightKernel);
    void renderer.getArrayBufferAsync(mistLightAt.value).then((b) => {
      const v = new Float32Array(b);
      (MIST.sun.value as Vector3).set(v[0], v[1], v[2]);
      (MIST.moon.value as Vector3).set(v[4], v[5], v[6]);
      (MIST.sky.value as Vector3).set(v[8], v[9], v[10]);
    }).finally(() => { this.#reading = false; });
  }

  /** The mist the eye stands in: the sea's haze, thicker by night, with the sea smoke and Mistwood's mist round the
   *  eye; and the haze of the weather it is inside. */
  #mistAround(
    eye: Vector3, systems: readonly { kind: string; at: { x: number; y: number; z: number }; radius: number; strength: number }[],
    smoke: number, mist: { at: Vector3; radius: number; amount: number },
  ): void {
    const up = this.#up.copy(eye).normalize();
    const night = P.night.value as number;
    const inMist = mist.amount * Math.max(0, 1 - Math.acos(Math.max(-1, Math.min(1, up.dot(mist.at)))) * R / Math.max(mist.radius, 1));
    (MIST.haze.value as Vector2).set(HAZE * (1 + (NIGHT_DAMP - 1) * night) + smoke * 0.004 + inMist * 0.012, HAZE_HEIGHT);
    let sigma = 0, height = 0, albedo = 0, ash = 0;
    const tint = new Vector3();
    for (const s of systems) {
      const k = WEATHER_HAZE[s.kind];
      if (!k || s.strength < 0.02) continue;
      const len = Math.hypot(s.at.x, s.at.y, s.at.z) || 1;
      const along = Math.acos(Math.max(-1, Math.min(1, (up.x * s.at.x + up.y * s.at.y + up.z * s.at.z) / len))) * R;
      const inside = s.strength * Math.min(1, Math.max(0, (s.radius - along) / (s.radius * 0.45)));
      if (inside <= 0) continue;
      const w = k.sigma * inside;
      sigma += w;
      height += k.height * w;
      albedo += k.albedo * w;
      ash += (k.ash ? 1 : 0) * w;
      tint.x += k.tint[0] * w; tint.y += k.tint[1] * w; tint.z += k.tint[2] * w;
    }
    const n = Math.max(sigma, 1e-9);
    (MIST.weather.value as Vector4).set(sigma, sigma > 0 ? height / n : 100, sigma > 0 ? albedo / n : 0.97, ash / n);
    (MIST.tint.value as Vector3).set(sigma > 0 ? tint.x / n : 1, sigma > 0 ? tint.y / n : 1, sigma > 0 ? tint.z / n : 1);
  }
}

