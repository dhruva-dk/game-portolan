// The air close round the eye as a volume of froxels, after Wronski ("Volumetric Fog and Lighting", SIGGRAPH 2014)
// and Hillaire ("Physically Based and Unified Volumetric Rendering in Frostbite", SIGGRAPH 2015). The cells are laid
// over the view, columns across and up the screen and slices in depth that thicken with distance, out to FAR.
//
// One kind of matter fills them all. Every source of mist adds its scattering, absorption and phase to a cell, and
// one lighting pass lights the sum:
//  - the haze over the sea everywhere, thin, thickest on the water. It is what the sun's shafts show in: through the
//    gaps in the clouds, past the islands, and through a ship's rigging;
//  - the rain, snow and ash systems' own haze round where they stand, so the air inside a squall closes in;
//  - inside a fog bank, the air between the eye and the bank's billows;
//  - sea smoke steaming off the cold water round the Ice Crown, wisps a few metres high;
//  - the mist rolling out of Mistwood, which thickens in its Fog Surge.
//
// A cell is lit by:
//  - the sun through the air, read through the sun's shadow cascades and the clouds' shade;
//  - the moon;
//  - the sky's light from above and the sea's from below;
//  - the lanterns of the ships near the eye, each with its own fall-off.
// Mist scatters forward, so looking toward a light the shafts and the halos blaze. Each frame lights every cell at a
// fresh depth within it, and blends that into the cell's light reprojected from the frame before (Hillaire). So the
// slices never band, and a dozen frames stand for a dozen samples.
//
// Then each column is summed from the eye outward, Hillaire's way: a slice's light is integrated through its own
// thickness, so a thick slice never gives back more light than it can scatter. What lies at any depth reads how much
// light the air in front has scattered toward the eye and how much of its own light comes through. Every material's
// haze and the sky behind everything read it.
import { HalfFloatType, LinearFilter, Matrix4, Storage3DTexture, Vector2, Vector3, Vector4, type ComputeNode, type DepthTexture, type Node, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, If, abs, clamp, exp, min, float, globalId, instancedArray, ivec2, log, max, mix, pow, select, smoothstep, step, texture, texture3D,
  textureStore, uint, uniform, uniformArray, uvec3, vec2, vec3, vec4, renderGroup,
} from 'three/tsl';
import { R } from '../../sim/sphere.ts';
import { EYE, MOON_RADIUS, SUN_RADIUS, lightTransmittance } from './luts.ts';
import { skyLight } from './light.ts';
import { SHADE, cloudShade, moonShade, sunShade } from './shade.ts';
import { MAP_SIZE, SHADOW_REACH, SPLITS } from './shadows.ts';
import { P, shared } from '../gpu/uniforms.ts';
import { PARKED } from '../gpu/parked.ts';
import { sharedNoise } from '../gpu/noise.ts';
import { loop } from '../gpu/tsl.ts';

type F = Node<'float'>;
type I = Node<'int'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

/** The froxels: columns across and up the view, and slices in depth. */
export const FROXELS = new Vector3(128, 72, 64);
/** The first slice's far side, and the last's, metres from the eye along the view. */
const NEAR = 0.6, FAR = 420;
const LOG = Math.log(FAR / NEAR);
/** How much of each frame's light goes into a cell, against what it held before. */
const BLEND = 0.1;
/** The haze over the sea, extinction per metre at the water by day, and the height it thins by e over. The damp of
 *  the night thickens it by NIGHT_DAMP. */
const HAZE = 0.0013, HAZE_HEIGHT = 32, NIGHT_DAMP = 1.5;
/** How strongly mist scatters forward, and ash, whose motes are coarser and darker. */
const G_MIST = 0.72, G_ASH = 0.45;
/** The weather systems the fog takes its haze from at once, and the lanterns it lights. */
const DISCS = 8, LAMPS = 12;
/** A lantern's intensity in the air per unit of its strength: half the deck lamp's, as its glass and housing shade the flame from most of the air round it. */
const LANTERN = 130;

function volume(): Storage3DTexture {
  const t = new Storage3DTexture(FROXELS.x, FROXELS.y, FROXELS.z);
  t.type = HalfFloatType;
  t.generateMipmaps = false;
  t.minFilter = t.magFilter = LinearFilter;
  return t;
}

/** Each frame's light and extinction in each cell, in two volumes that take turns being written and read back. */
const lit = [volume(), volume()];
/** The light gathered and the light kept from the eye to each slice's far side. */
const summed = volume();

const U = shared({
  /** The view-projection of the frame before, for finding where a cell was. */
  before: uniform(new Matrix4()),
  /** The eye's forward, for the depth of a point along the view. */
  forward: uniform(new Vector3(0, 0, -1)),
  /** Where in its slice this frame lights each cell, 0…1. */
  jitter: uniform(0.5),
  /** How much of this frame's light goes into a cell: 1 after a cut. */
  blend: uniform(1),
  /** Sea smoke round the Ice Crown, 0…1. */
  smoke: uniform(0),
  /** Mistwood's mist: its middle (a unit vector) and radius in metres; and how thick, 0…1. */
  mist: uniform(new Vector4(0, 1, 0, 1)),
  mistAmount: uniform(0),
});

/** The weather's haze: each system's middle (unit) and radius; its extinction at the sea (with its strength), its
 *  albedo, the height it thins by e over, and 1 for ash; its tint. */
const DISC = {
  place: uniformArray(Array.from({ length: DISCS }, () => new Vector4(0, 1, 0, 1)), 'vec4').setGroup(renderGroup),
  look: uniformArray(Array.from({ length: DISCS }, () => new Vector4()), 'vec4').setGroup(renderGroup),
  tint: uniformArray(Array.from({ length: DISCS }, () => new Vector4(1, 1, 1, 0)), 'vec4').setGroup(renderGroup),
  count: uniform(0, 'int'),
};

/** The lanterns near the eye: where, and their colour times their strength. */
const LAMP_AT = {
  at: uniformArray(Array.from({ length: LAMPS }, () => new Vector4()), 'vec4').setGroup(renderGroup),
  colour: uniformArray(Array.from({ length: LAMPS }, () => new Vector4()), 'vec4').setGroup(renderGroup),
  count: uniform(0, 'int'),
};

/** The haze each kind of weather puts in the air: extinction per metre at its middle, albedo, height, tint. */
const WEATHER_HAZE: Record<string, { sigma: number; albedo: number; height: number; tint: [number, number, number]; ash?: boolean }> = {
  rain: { sigma: 0.011, albedo: 0.97, height: 110, tint: [0.92, 0.95, 1] },
  thunder: { sigma: 0.016, albedo: 0.95, height: 150, tint: [0.88, 0.91, 0.97] },
  snow: { sigma: 0.014, albedo: 0.99, height: 120, tint: [0.97, 0.98, 1] },
  fog: { sigma: 0.012, albedo: 0.98, height: 28, tint: [0.96, 0.97, 0.98] },
  ash: { sigma: 0.009, albedo: 0.35, height: 190, tint: [0.62, 0.55, 0.5], ash: true },
};

const el = (a: ReturnType<typeof uniformArray>, i: I): V4 => (a as unknown as { element(i: I): V4 }).element(i);

/** The depth along the view of slice edge k, 0…FROXELS.z (the first slice runs from the eye itself). */
const edge = (k: F): F => float(NEAR).mul(exp(k.mul(LOG / FROXELS.z)));

/** Henyey and Greenstein's phase function. */
const hg = (c: F, g: number): F => float((1 - g * g) / (4 * Math.PI)).div(pow(float(1 + g * g).sub(c.mul(2 * g)), 1.5));

/** The sun's shadow at p, from the cascade its depth along the view falls in; 1 past the cascades' reach. */
function cascades(slices: { matrix: Matrix4; depth: DepthTexture }[], p: V3, depth: F): F {
  const lit = float(1).toVar();
  const chain = slices.map((s, i) => {
    const lo = (i ? SPLITS[i - 1] : 0) * SHADOW_REACH, hi = SPLITS[i] * SHADOW_REACH;
    const read = () => {
      const c = uniform(s.matrix).mul(vec4(p, 1));
      const uv = vec2(c.x, float(1).sub(c.y));
      If(uv.x.greaterThan(0).and(uv.x.lessThan(1)).and(uv.y.greaterThan(0)).and(uv.y.lessThan(1)), () => {
        const stored = texture(s.depth).load(ivec2(uv.mul(MAP_SIZE))).x;
        lit.assign(step(c.z.sub(0.0004), stored));
      });
    };
    return { cond: depth.greaterThanEqual(lo).and(depth.lessThan(hi)), read };
  });
  type Chain = { ElseIf(c: unknown, f: () => void): Chain };
  let branch = If(chain[0].cond, chain[0].read) as unknown as Chain;
  for (const c of chain.slice(1)) branch = branch.ElseIf(c.cond, c.read);
  return lit;
}

/** The light in the cells of one frame: lights every cell at a fresh depth within it, and blends it into what the
 *  cell held the frame before, read from `history`. */
function lightKernel(slices: { matrix: Matrix4; depth: DepthTexture }[] | null, into: Storage3DTexture, history: Storage3DTexture) {
  return Fn(() => {
    const id = globalId;
    const noise = sharedNoise();
    const ndc = vec2(id.xy).add(0.5).div(vec2(FROXELS.x, FROXELS.y)).mul(2).sub(1);
    const view = vec3(ndc.x.mul(EYE.tan.x), ndc.y.mul(EYE.tan.y), -1);
    const ray = EYE.world.mul(vec4(view, 0)).xyz;
    const d = ray.normalize();
    const depth = edge(float(id.z).add(U.jitter));
    const eye = EYE.position;
    const p = eye.add(ray.mul(depth));
    const r = p.length(), up = p.div(r);
    const h = r.sub(P.planet.y);

    // the matter: scattering by mist (rgb) and by ash (rgb), and the extinction of both
    const mist = vec3(0).toVar(), ash = vec3(0).toVar(), sigma = float(0).toVar();
    const above = step(-0.5, h);
    // the noise the haze and the wisps are torn by, riding the wind; a plane per place on the sphere is enough
    const q = p.xz.add(vec2(0.71, -0.53).mul(p.y)).sub(P.drift.xz.add(vec2(0.71, -0.53).mul(P.drift.y)));
    const broad = texture(noise, q.mul(1 / 160)).level(float(0)).r;
    const fine = texture(noise, q.mul(1 / 23).add(vec2(0.37, 0.11))).level(float(0)).g;

    // the haze over the sea
    const damp = mix(float(1), float(NIGHT_DAMP), P.night);
    const haze = float(HAZE).mul(damp).mul(exp(max(h, 0).div(-HAZE_HEIGHT))).mul(broad.mul(0.8).add(0.6)).mul(above);
    mist.addAssign(haze);
    sigma.addAssign(haze);

    // the weather's own haze round each system
    loop('fogDisc', DISC.count, (i) => {
      const place = el(DISC.place, i), look = el(DISC.look, i), tint = el(DISC.tint, i);
      const rho = up.sub(place.xyz).length().mul(R).div(place.w);
      const cover = smoothstep(1, 0.55, rho.add(broad.sub(0.5).mul(0.35)));
      const s = look.x.mul(cover).mul(exp(max(h, 0).div(look.z.negate()))).mul(above);
      If(s.greaterThan(1e-6), () => {
        const scatter = tint.rgb.mul(s.mul(look.y));
        If(look.w.greaterThan(0.5), () => {
          ash.addAssign(scatter);
        }).Else(() => {
          mist.addAssign(scatter);
        });
        sigma.addAssign(s);
      });
    });

    // sea smoke off the cold water round the pole: wisps on the water, torn and drifting
    If(U.smoke.greaterThan(0.01), () => {
      const band = smoothstep(0.8, 0.93, up.y);
      const wisp = smoothstep(0.42, 0.78, fine.mul(0.6).add(broad.mul(0.4)));
      const s = U.smoke.mul(band).mul(wisp).mul(exp(max(h, 0).div(-2.4))).mul(0.06).mul(above);
      mist.addAssign(s);
      sigma.addAssign(s);
    });

    // Mistwood's mist, rolling low out of the wood
    If(U.mistAmount.greaterThan(0.01), () => {
      const rho = up.sub(U.mist.xyz).length().mul(R).div(U.mist.w);
      const cover = smoothstep(1, 0.35, rho.add(broad.sub(0.5).mul(0.6)));
      const s = U.mistAmount.mul(cover).mul(exp(max(h, 0).div(-22))).mul(fine.mul(0.9).add(0.3)).mul(0.05).mul(above);
      mist.addAssign(s);
      sigma.addAssign(s);
    });

    // the light: the sun through the air, its shadows and the clouds; the moon; the sky above and the sea below
    const S = vec3(0).toVar();
    If(sigma.greaterThan(1e-7), () => {
      const shadow = slices ? cascades(slices, p, depth) : float(1);
      const sun = lightTransmittance(r, up.dot(P.sunDir), float(SUN_RADIUS)).mul(P.sunIlluminance).mul(sunShade(p)).mul(shadow);
      const moon = lightTransmittance(r, up.dot(P.moonDir), float(MOON_RADIUS)).mul(P.moonIlluminance).mul(P.moonPhase).mul(moonShade(p));
      const cs = d.dot(P.sunDir), cm = d.dot(P.moonDir);
      const sky = skyLight(p, up).add(skyLight(p, up.negate())).mul(0.5 / Math.PI);
      S.assign(mist.mul(sun.mul(hg(cs, G_MIST)).add(moon.mul(hg(cm, G_MIST))))
        .add(ash.mul(sun.mul(hg(cs, G_ASH)).add(moon.mul(hg(cm, G_ASH)))))
        .add(mist.add(ash).mul(sky)));
      // the lanterns, each falling off with the square of the distance, softened inside its own glass
      loop('fogLamp', LAMP_AT.count, (j) => {
        const at = el(LAMP_AT.at, j), colour = el(LAMP_AT.colour, j);
        const to = at.xyz.sub(p);
        const dd = to.dot(to);
        If(dd.lessThan(50 * 50), () => {
          const c = d.dot(to.div(dd.sqrt().max(1e-3)));
          const fall = float(1).div(dd.add(0.6)).mul(smoothstep(50 * 50, 20 * 20, dd));
          // the halo: most of the glow tight round the flame, a little thrown wide
          S.addAssign(mist.mul(colour.rgb).mul(fall).mul(hg(c, 0.86).mul(0.8).add(hg(c, 0.3).mul(0.2))).mul(LANTERN));
        });
      });
    });

    // where this cell was the frame before, and what it held
    const was = U.before.mul(vec4(p, 1));
    const wuv = was.xy.div(max(was.w, 1e-4)).mul(0.5).add(0.5);
    const wk = log(max(was.w, 1e-4).div(NEAR)).mul(FROXELS.z / LOG);
    const seen = was.w.greaterThan(0).and(wuv.x.greaterThan(0)).and(wuv.x.lessThan(1)).and(wuv.y.greaterThan(0)).and(wuv.y.lessThan(1))
      .and(wk.greaterThan(0)).and(wk.lessThan(FROXELS.z));
    const before = texture3D(history, vec3(wuv, wk.div(FROXELS.z))).level(float(0));
    const now = vec4(S, sigma);
    textureStore(into, uvec3(id.x, id.y, id.z), mix(before, now, select(seen, U.blend, float(1))));
  })();
}

/** Sums each column from the eye outward: the light gathered and the light kept to each slice's far side. */
function sumKernel(from: Storage3DTexture) {
  return Fn(() => {
    const id = globalId.xy;
    const ndc = vec2(id).add(0.5).div(vec2(FROXELS.x, FROXELS.y)).mul(2).sub(1);
    // metres along the ray per metre of depth along the view
    const stretch = vec3(ndc.x.mul(EYE.tan.x), ndc.y.mul(EYE.tan.y), 1).length();
    const L = vec3(0).toVar();
    const T = float(1).toVar();
    loop('fogSlice', FROXELS.z, (k) => {
      const z = float(k);
      const cell = texture3D(from, vec3(vec2(id).add(0.5).div(vec2(FROXELS.x, FROXELS.y)), z.add(0.5).div(FROXELS.z))).level(float(0));
      const near = select(k.equal(0), float(0), edge(z));
      const ds = edge(z.add(1)).sub(near).mul(stretch);
      const sigma = cell.a;
      const kept = exp(sigma.mul(ds).negate());
      // Hillaire's integral of the slice's light through its own thickness
      const gathered = select(sigma.greaterThan(1e-7), cell.rgb.mul(float(1).sub(kept)).div(max(sigma, 1e-7)), cell.rgb.mul(ds));
      L.addAssign(gathered.mul(T));
      T.mulAssign(kept);
      textureStore(summed, uvec3(id.x, id.y, uint(k)), vec4(L, T));
    });
  })();
}

const dispatch = (kernel: Node, size: number[], group: number[]): ComputeNode => {
  const k = kernel as unknown as { compute(size: number[], group: number[]): ComputeNode };
  return k.compute(size.map((s, i) => Math.ceil(s / group[i])), group);
};

/** While the froxels are parked, the mist the eye stands in, worked out along each ray: the haze over the sea
 *  (extinction per metre at the water, and the height it thins by e over) with the sea smoke and Mistwood's mist
 *  folded in, and the weather's haze round the eye (the same, its albedo, and 1 for ash) with its tint. */
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

/** The mist between the eye and p, worked out along the ray: what it takes of p's light and the sun's, the moon's and
 *  the sky's light it scatters toward the eye. */
function mistAlong(p: V3): { light: V3; loss: F } {
  const eye = EYE.position, sea = P.planet.y;
  // out to where the froxels reached: past it the air's own tables take over
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

/** What the mist holds between the eye and p: the light it has scattered toward the eye, and how much of p's own
 *  light comes through. From the froxels, or while they are parked worked out along the ray. */
export function fogAt(p: V3): { light: V3; loss: F } {
  if (PARKED.volumeFog) return mistAlong(p);
  const eye = EYE.position;
  const depth = p.sub(eye).dot(U.forward);
  const clip = EYE.viewProjection.mul(vec4(p, 1));
  const uv = clamp(clip.xy.div(max(clip.w, 1e-4)).mul(0.5).add(0.5), 0, 1);
  // the slice edge the point lies at, counted from the eye; the first slice runs from the eye itself
  const first = NEAR * Math.exp(LOG / FROXELS.z);
  const k = select(depth.lessThan(first), depth.div(first), log(max(depth, first).div(NEAR)).mul(FROXELS.z / LOG));
  const z = clamp(k.sub(0.5), 0.5, FROXELS.z - 0.5).div(FROXELS.z);
  const v = texture3D(summed, vec3(uv, z));
  const f = clamp(k, 0, 1);
  return { light: v.rgb.mul(f), loss: mix(float(1), v.a, f) };
}

/** The froxel fog: the stage sets it from the weather and the lanterns, and runs it before the scene is drawn. */
export class Fog {
  #light: [ComputeNode, ComputeNode] | null = null;
  #lightNoShadow: [ComputeNode, ComputeNode];
  #sum: [ComputeNode, ComputeNode];
  #turn = 0;
  #frames = 0;
  #eye = new Vector3();
  #fwd = new Vector3();
  #up = new Vector3();
  #reading = false;
  #lightAt = -Infinity;

  constructor() {
    const size = [FROXELS.x, FROXELS.y, FROXELS.z], group = [8, 4, 4];
    this.#lightNoShadow = [
      dispatch(lightKernel(null, lit[0], lit[1]), size, group),
      dispatch(lightKernel(null, lit[1], lit[0]), size, group),
    ];
    this.#sum = [
      dispatch(sumKernel(lit[0]), [FROXELS.x, FROXELS.y], [8, 8]),
      dispatch(sumKernel(lit[1]), [FROXELS.x, FROXELS.y], [8, 8]),
    ];
  }

  /**
   * Lays out the fog for a frame and works it out. systems: the weather near and far; smoke and mist, 0…1; the
   * cascades of the sun's shadow once they exist. Run after the atmosphere has followed the camera.
   */
  update(
    renderer: WebGPURenderer, eye: Vector3, forward: Vector3, viewProjection: Matrix4,
    systems: readonly { kind: string; at: { x: number; y: number; z: number }; radius: number; strength: number }[],
    smoke: number, mist: { at: Vector3; radius: number; amount: number },
    lanterns: { count: number; at(i: number): { x: number; y: number; z: number; r: number; g: number; b: number } },
    slices: { matrix: Matrix4; depth: DepthTexture }[] | null,
  ): void {
    if (!this.#light && slices) {
      const size = [FROXELS.x, FROXELS.y, FROXELS.z], group = [8, 4, 4];
      this.#light = [
        dispatch(lightKernel(slices, lit[0], lit[1]), size, group),
        dispatch(lightKernel(slices, lit[1], lit[0]), size, group),
      ];
    }
    // a cut, or the first frame: nothing from before to keep
    const cut = this.#frames === 0 || this.#eye.distanceTo(eye) > 25 || this.#fwd.dot(forward) < 0.8;
    U.blend.value = cut ? 1 : BLEND;
    this.#eye.copy(eye);
    this.#fwd.copy(forward);
    (U.forward.value as Vector3).copy(forward);
    U.jitter.value = (this.#frames * 0.6180339887 + 0.25) % 1;
    U.smoke.value = smoke;
    (U.mist.value as Vector4).set(mist.at.x, mist.at.y, mist.at.z, mist.radius);
    U.mistAmount.value = mist.amount;

    // the systems whose haze could reach the view, strongest first
    let n = 0;
    const up = this.#up.copy(eye).normalize();
    for (const s of systems) {
      const k = WEATHER_HAZE[s.kind];
      if (!k || s.strength < 0.02 || n >= DISCS) continue;
      const len = Math.hypot(s.at.x, s.at.y, s.at.z) || 1;
      const along = Math.acos(Math.max(-1, Math.min(1, (up.x * s.at.x + up.y * s.at.y + up.z * s.at.z) / len))) * R;
      if (along > s.radius + FAR) continue;
      (DISC.place.array[n] as Vector4).set(s.at.x / len, s.at.y / len, s.at.z / len, s.radius);
      (DISC.look.array[n] as Vector4).set(k.sigma * s.strength, k.albedo, k.height, k.ash ? 1 : 0);
      (DISC.tint.array[n] as Vector4).set(...k.tint, 0);
      n++;
    }
    DISC.count.value = n;

    // the nearest lanterns
    const near: { i: number; d: number }[] = [];
    for (let i = 0; i < lanterns.count; i++) {
      const l = lanterns.at(i);
      const d = Math.hypot(l.x - eye.x, l.y - eye.y, l.z - eye.z);
      if (d < FAR * 0.5) near.push({ i, d });
    }
    near.sort((a, b) => a.d - b.d);
    const m = Math.min(near.length, LAMPS);
    for (let j = 0; j < m; j++) {
      const l = lanterns.at(near[j].i);
      (LAMP_AT.at.array[j] as Vector4).set(l.x, l.y, l.z, 0);
      (LAMP_AT.colour.array[j] as Vector4).set(l.r, l.g, l.b, 0);
    }
    LAMP_AT.count.value = m;

    if (PARKED.volumeFog) {
      this.#mistAround(eye, systems, smoke, mist);
      this.#mistLight(renderer);
      return;
    }
    const t = this.#turn;
    renderer.compute([(this.#light ?? this.#lightNoShadow)[t], this.#sum[t]]);
    // what this frame's cells were lit from, for the next to find them by
    (U.before.value as Matrix4).copy(viewProjection);
    this.#turn = 1 - t;
    this.#frames++;
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

  /** The mist the eye stands in, for the rays to work out while the froxels are parked: the sea's haze, thicker by
   *  night, with the sea smoke and Mistwood's mist round the eye; and the haze of the weather it is inside. */
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

