// The weather's clouds: each system the simulation runs is a volume of cloud raymarched where it stands, after
// Schneider and Vos's Nubis (Horizon Zero Dawn, SIGGRAPH 2015; Schneider, SIGGRAPH 2017) and Hillaire's clouds in
// Frostbite (SIGGRAPH 2016).
//
// The shape: a system's own weather map (a low-frequency noise laid over its disc) breaks its coverage into patches
// that fray at its edge; a height profile per kind gives each its form (a squall's flat base and rounded towers, the
// thunderhead's column spreading into an anvil, a fog bank thick on the water and thinning upward); Perlin–Worley
// noise makes the billows and the coverage eats into them, and a finer Worley noise erodes their edges, wispy at the
// base and billowing higher up. Under rain, thunder, snow and ash the fall hangs in shafts down to the sea, streaked
// and leaning downwind. The noise rides with the system, so a cloud keeps its shape as it drifts.
//
// The light: the sun's or the moon's light through the air (the transmittance table) and then through the cloud
// toward it (a short march), scattered in several orders that each see less of the cloud and scatter less forward
// (Wrenninge's approximation of multiple scattering), with Schneider's powder darkening the thin edges facing away
// from the light; the sky's light from above and the sea's from below; and lightning flickering inside the
// thunderheads. Integrated per step as Hillaire does, so a step's light never exceeds what the step can scatter.
// The haze between the eye and the cloud is laid on from the aerial table at the cloud's mean depth.
//
// The clouds are marched in a compute pass at half the scene's resolution each way, every system along each ray,
// nearest first, each only over the stretch of the ray inside the sphere bounding it. The ray starts on an offset
// that turns each frame, and each pixel blends what it marches into what it held, reprojected from the frame before
// at its clouds' mean depth (Schneider 2015), held within reach of what it sees now so a moving cloud leaves no ghost.
// Under a deck the fall is thin and is lit through the shade map rather than a march of its own. A pixel keeps no
// scene depth. It keeps where along the ray its clouds begin, take a tenth and half of the light they take, and end,
// so a quad over the view lays on, at each pixel, the part of the clouds in front of whatever the scene drew there.
// The same field, without the fine erosion, is marched along the key light over a square round the eye into the
// shade map that every lit surface reads (shade.ts).
import {
  CustomBlending, Group, HalfFloatType, LinearFilter, Matrix4, Mesh, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor,
  PlaneGeometry, RepeatWrapping, Storage3DTexture, StorageTexture, Vector2, Vector3, Vector4, type ComputeNode, type Node,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  Break, Discard, Fn, If, abs, cameraFar, cameraNear, clamp, exp, float, floor, fract, globalId, instanceIndex, int,
  interleavedGradientNoise, max, min, mix, mod, perspectiveDepthToViewZ, positionGeometry, pow, screenUV, select, sin,
  smoothstep, texture, texture3D, textureStore, uniform, uniformArray, uvec2, uvec3, vec2, vec3, vec4, renderGroup,
} from 'three/tsl';
import { overDepth } from '../gpu/behind.ts';
import { R } from '../../sim/sphere.ts';
import type { WeatherKind } from '../../sim/world/index.ts';
import { P, STRIKE } from '../gpu/uniforms.ts';
import { PARKED } from '../gpu/parked.ts';
import { loop } from '../gpu/tsl.ts';
import { raySphere } from './model.ts';
import { EYE, MOON_RADIUS, SUN_RADIUS, aerialAt, lightTransmittance } from './luts.ts';
import { skyLight } from './light.ts';
import { fogAt } from './fog.ts';
import { SHADE, SHADE_SIZE, cloudShade } from './shade.ts';

type F = Node<'float'>;
type I = Node<'int'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

/** Element i of a uniform array of vec4s. */
const el = (a: { element(i: unknown): unknown }, i: I | number): V4 => a.element(i) as V4;

/** At most this many systems are drawn. */
export const MAX_CLOUDS = 6;

/** One weather system as the stage hands it over. */
export interface CloudSystem {
  kind: WeatherKind;
  /** Unit vector to its middle. */
  at: { x: number; y: number; z: number };
  /** Radius along the surface, metres. */
  radius: number;
  /** 0…1: how built up it is. */
  strength: number;
  /** Stable from frame to frame: it picks the system's part of the noise, so it keeps its shape. */
  id?: number;
}

// ---------------------------------------------------------------- the kinds

/** Each kind's shape and fall, by its index in the tables. */
interface Kind {
  /** The cloud's base and how high its tallest towers reach over it, metres over the sea. */
  base: number; tower: number;
  /** Extinction per metre where the cloud is whole, and the share of it that is scattering. */
  sigma: number; albedo: number;
  /** Extinction per metre in the shafts falling from it, and how fast the fall comes down, m/s. */
  shaft: number; fall: number;
  /** 1 for a fog bank's shape, 1 for a thunderhead's anvil. */
  fog: number; anvil: number;
  tint: [number, number, number];
  /** 1 for the fair-weather layer over the whole planet, whose cover comes from a broad weather map of its own. */
  fair?: number;
}

const NONE: Kind = { base: 0, tower: 0, sigma: 0, albedo: 0, shaft: 0, fall: 0, fog: 0, anvil: 0, tint: [0, 0, 0] };
const KINDS: Kind[] = [
  NONE,
  // fog: thick on the water, thinning upward through thirty metres into wisps
  { base: 0, tower: 32, sigma: 0.065, albedo: 0.98, shaft: 0, fall: 0, fog: 1, anvil: 0, tint: [0.96, 0.97, 0.98] },
  // rain: a low grey deck with rounded towers, rain in shafts under it
  { base: 58, tower: 60, sigma: 0.1, albedo: 0.96, shaft: 0.012, fall: 9, fog: 0, anvil: 0, tint: [0.93, 0.95, 0.98] },
  // thunder: a dark base and a column up into an anvil, the heaviest rain
  { base: 45, tower: 175, sigma: 0.13, albedo: 0.95, shaft: 0.017, fall: 11, fog: 0, anvil: 1, tint: [0.88, 0.9, 0.95] },
  // snow: a soft white deck, snow drifting down slowly
  { base: 50, tower: 45, sigma: 0.08, albedo: 0.99, shaft: 0.009, fall: 1.3, fog: 0, anvil: 0, tint: [0.97, 0.98, 1] },
  // ash: a sooty plume, high and dark, ash settling out of it
  { base: 40, tower: 190, sigma: 0.11, albedo: 0.5, shaft: 0.01, fall: 0.9, fog: 0, anvil: 0, tint: [0.5, 0.45, 0.41] },
  // fair weather: cumulus over the whole planet, well above the weather's decks, heaped where the air is wetter
  { base: 125, tower: 95, sigma: 0.07, albedo: 0.975, shaft: 0, fall: 0, fog: 0, anvil: 0, tint: [1, 1, 1], fair: 1 },
];
const FAIR = KINDS.length - 1;
const KIND_INDEX: Partial<Record<WeatherKind, number>> = { fog: 1, rain: 2, thunder: 3, snow: 4, ash: 5 };

/** The lowest and highest a kind's cloud and its fall reach, metres over the sea. */
function reach(k: Kind): [number, number] {
  return [k.shaft > 0 || k.fog > 0 ? 0 : k.base, k.base + k.tower * 1.08];
}

const SHAPE_K = uniformArray(KINDS.map((k) => new Vector4(k.base, k.tower, k.sigma, k.albedo)), 'vec4').setGroup(renderGroup);
const FALL_K = uniformArray(KINDS.map((k) => new Vector4(k.shaft, k.fall, k.fog, k.anvil)), 'vec4').setGroup(renderGroup);
const TINT_K = uniformArray(KINDS.map((k) => new Vector4(...k.tint, k.fair ?? 0)), 'vec4').setGroup(renderGroup);

// ---------------------------------------------------------------- the systems

const SYS = {
  /** Each system's middle (a unit vector) and radius in metres. */
  place: uniformArray(Array.from({ length: MAX_CLOUDS }, () => new Vector4(0, 1, 0, 1)), 'vec4').setGroup(renderGroup),
  /** Its kind's index, its strength, its seed. */
  look: uniformArray(Array.from({ length: MAX_CLOUDS }, () => new Vector4()), 'vec4').setGroup(renderGroup),
  /** Where lightning is lighting it from inside, and how brightly. */
  flash: uniformArray(Array.from({ length: MAX_CLOUDS }, () => new Vector4()), 'vec4').setGroup(renderGroup),
  /** The sphere bounding it: its middle and radius. */
  bound: uniformArray(Array.from({ length: MAX_CLOUDS }, () => new Vector4()), 'vec4').setGroup(renderGroup),
  count: uniform(0, 'int'),
};

/** The light the clouds are lit by and the shade map follows: the sun's, or the moon's once the sun is far down. */
const KEY = { dir: uniform(new Vector3(0, 1, 0)), sun: uniform(1) };

// ---------------------------------------------------------------- the noise

const SHAPE_N = 64;
const DETAIL_N = 32;

function volume(n: number): Storage3DTexture {
  const t = new Storage3DTexture(n, n, n);
  t.wrapS = t.wrapT = t.wrapR = RepeatWrapping;
  return t;
}

const shapeTex = volume(SHAPE_N);
const detailTex = volume(DETAIL_N);

const hash33 = (c: V3): V3 =>
  fract(sin(vec3(c.dot(vec3(127.1, 311.7, 74.7)), c.dot(vec3(269.5, 183.3, 246.1)), c.dot(vec3(113.5, 271.9, 124.6)))).mul(43758.5453));

/** Worley noise tiling every `period` cells: 1 on a feature point, falling away between them. */
const worley = Fn(([p, period]: [V3, F]) => {
  const cell = floor(p), f = fract(p);
  let near: F = float(4);
  for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const o = vec3(x, y, z);
    near = min(near, o.add(hash33(mod(cell.add(o), period))).sub(f).length());
  }
  return clamp(float(1).sub(near), 0, 1);
}).setLayout({ name: 'cloudWorley', type: 'float', inputs: [{ name: 'p', type: 'vec3' }, { name: 'period', type: 'float' }] });

/** Gradient noise tiling every `period` cells, about −0.7…0.7. */
const perlin = Fn(([p, period]: [V3, F]) => {
  const i = floor(p), f = fract(p);
  const u = f.mul(f).mul(f).mul(f.mul(f.mul(6).sub(15)).add(10));
  const g = (x: number, y: number, z: number): F => {
    const o = vec3(x, y, z);
    return hash33(mod(i.add(o), period)).mul(2).sub(1).normalize().dot(f.sub(o));
  };
  const a = mix(mix(g(0, 0, 0), g(1, 0, 0), u.x), mix(g(0, 1, 0), g(1, 1, 0), u.x), u.y);
  const b = mix(mix(g(0, 0, 1), g(1, 0, 1), u.x), mix(g(0, 1, 1), g(1, 1, 1), u.x), u.y);
  return mix(a, b, u.z);
}).setLayout({ name: 'cloudPerlin', type: 'float', inputs: [{ name: 'p', type: 'vec3' }, { name: 'period', type: 'float' }] });

/** Three octaves of Worley noise from `f` cells across the tile. */
const worleyFbm = (p: V3, f: number): F =>
  worley(p.mul(f), float(f)).mul(0.625).add(worley(p.mul(2 * f), float(2 * f)).mul(0.25)).add(worley(p.mul(4 * f), float(4 * f)).mul(0.125));

function texel(n: number): { at: Node<'uvec3'>; uvw: V3 } {
  const id = instanceIndex;
  const x = id.mod(n), y = id.div(n).mod(n), z = id.div(n * n);
  return { at: uvec3(x, y, z), uvw: vec3(x, y, z).add(0.5).div(n) };
}

/** The shape volume: Perlin–Worley in r (the billows), Worley at three scales in g, b and a (what cuts into them). */
const shapeKernel = Fn(() => {
  const { at, uvw } = texel(SHAPE_N);
  const pf = perlin(uvw.mul(4), float(4)).mul(0.5).add(perlin(uvw.mul(8), float(8)).mul(0.25)).add(perlin(uvw.mul(16), float(16)).mul(0.125));
  const pn = clamp(pf.mul(1.1).add(0.5), 0, 1);
  const w2 = worleyFbm(uvw, 2), w4 = worleyFbm(uvw, 4), w8 = worleyFbm(uvw, 8);
  // the billows of the gradient noise, swollen into the Worley cells
  const pw = clamp(pn.sub(w2.sub(1)).div(float(2).sub(w2)), 0, 1);
  textureStore(shapeTex, at, vec4(pw, w2, w4, w8));
})().compute(SHAPE_N ** 3);

/** The detail volume: Worley at three finer scales. */
const detailKernel = Fn(() => {
  const { at, uvw } = texel(DETAIL_N);
  textureStore(detailTex, at, vec4(worleyFbm(uvw, 2), worleyFbm(uvw, 4), worleyFbm(uvw, 8), 1));
})().compute(DETAIL_N ** 3);

// ---------------------------------------------------------------- the field

/**
 * The cloud at p in system i: x the extinction per metre, y how far up the cloud p is (0 base … 1 top). With `fine`
 * over a half, the edges are eroded by the detail noise; the light's march and the shade map do without.
 */
// inline rather than a WGSL function of its own: three declares no uniform array that only a function reads
const cloudAt = (p: V3, i: I, fine: F): V2 => Fn(() => {
  const place = el(SYS.place, i), look = el(SYS.look, i);
  const kind = int(look.x);
  const shape = el(SHAPE_K, kind), fall = el(FALL_K, kind), fair = el(TINT_K, kind).w;
  const centre = place.xyz, radius = place.w, strength = look.y, seed = look.z;
  const r = p.length(), up = p.div(r), h = r.sub(P.planet.y);
  // the noise rides with the system, each system its own part of it
  const q = p.sub(centre.mul(P.planet.x)).add(vec3(seed.mul(37.3), seed.mul(-21.1), seed.mul(13.7)));
  // how far out from the system's middle p lies, a share of its radius; the fair-weather layer has no middle, and
  // takes it from a broad map of its own instead, clear over some seas and heaped over others
  const broad = texture3D(shapeTex, q.mul(1 / 1500)).level(float(0)).r;
  const rho = select(fair.greaterThan(0.5), float(0.72).add(float(0.5).sub(broad).mul(1.5)),
    up.sub(centre.mul(up.dot(centre))).length().mul(P.planet.x).div(radius));
  const out = vec2(0, 0).toVar();
  // the weather map: the cloud in patches over the system, frayed at its edge
  const wm = texture3D(shapeTex, q.mul(1 / 380)).level(float(0));
  // never whole even in the middle, so the billows stand apart as towers rather than fill the system
  const cover = strength.mul(smoothstep(1.05, 0.35, rho.add(wm.r.sub(0.5).mul(0.8)))).mul(mix(float(0.82), float(1), fall.z));
  const anvilCover = fall.w.mul(strength).mul(smoothstep(1.4, 0.8, rho.add(wm.b.sub(0.5).mul(0.5))));
  If(max(cover, anvilCover).greaterThan(0.002), () => {
    const base = shape.x, tower = shape.y;
    // the towers: each Worley cell a column of its own, the tallest toward the middle, over a lower deck between
    const cells = texture3D(shapeTex, q.mul(1 / 210)).level(float(0));
    const column = smoothstep(0.42, 0.85, cells.b.mul(0.8).add(cells.g.mul(0.2)));
    const core = smoothstep(1, 0.1, rho);
    // a fog bank instead lies level, a little higher here and there
    const lift = select(fall.z.greaterThan(0.5), wm.g.mul(0.3).add(0.75),
      clamp(column.mul(core.mul(0.7).add(0.3)).add(wm.g.sub(0.5).mul(0.2)), 0.14, 1));
    const top = base.add(tower.mul(lift));
    const hf = h.sub(base).div(max(top.sub(base), 1));
    const s = texture3D(shapeTex, q.mul(1 / 140).add(vec3(0, P.time.mul(0.0015), 0))).level(float(0));
    const fbm = s.g.mul(0.625).add(s.b.mul(0.25)).add(s.a.mul(0.125));
    const billow = clamp(s.r.sub(fbm.sub(1)).div(float(2).sub(fbm)), 0, 1);
    // a flat base and rounded tops; a thunderhead's column spreads into its anvil, a flat slab where the air stops
    // it rising, thickest over the column and thinning out to its edge
    const ha = h.sub(base).div(tower);
    const thick = float(0.16).mul(float(1).sub(smoothstep(0.2, 1.4, rho)).mul(0.75).add(0.25));
    const anvilBand = fall.w.mul(smoothstep(0.84, 0.88, ha.add(thick.mul(0.4)))).mul(smoothstep(0.92, 0.88, ha.sub(thick)));
    const profile = max(smoothstep(0, 0.1, hf).mul(smoothstep(1, 0.55, hf)), anvilBand);
    const c = max(cover, anvilCover.mul(anvilBand));
    const body = clamp(billow.mul(profile).sub(float(1).sub(c)).div(max(c, 1e-3)), 0, 1).mul(c);
    // a fog bank instead lies thickest on the water and thins upward into wisps
    const fogBody = cover.mul(smoothstep(1, 0, hf.add(fbm.sub(0.5).mul(0.8)))).mul(billow.mul(0.65).add(0.35));
    const dens = select(fall.z.greaterThan(0.5), fogBody, body).toVar();
    If(fine.greaterThan(0.5).and(dens.greaterThan(0)), () => {
      const d = texture3D(detailTex, q.mul(1 / 34).add(P.drift.mul(0.004))).level(float(0));
      const dfbm = d.r.mul(0.625).add(d.g.mul(0.25)).add(d.b.mul(0.125));
      // wisps at the base, billows higher up
      const dm = mix(dfbm, float(1).sub(dfbm), clamp(hf.mul(4), 0, 1)).mul(0.38);
      dens.assign(clamp(dens.sub(dm).div(float(1).sub(dm)), 0, 1));
    });
    const sigma = dens.mul(shape.z).toVar();
    // the fall, in shafts under the cloud: the drops at height h left the base a while ago and the wind has carried
    // them since, so the shafts lean downwind
    If(fall.x.greaterThan(0).and(h.lessThan(base)), () => {
      const lean = P.wind.mul(base.sub(h).div(max(fall.y, 0.5)));
      const qs = q.add(lean);
      const across = qs.sub(centre.mul(qs.dot(centre)));
      const column = texture3D(shapeTex, across.mul(1 / 110)).level(float(0)).r;
      const streak = texture3D(shapeTex, across.mul(1 / 9).add(centre.mul(h.add(P.time.mul(fall.y)).mul(1 / 70)))).level(float(0)).g;
      const shaft = fall.x.mul(cover).mul(smoothstep(0.38, 0.62, column)).mul(streak.mul(0.9).add(0.35)).mul(smoothstep(base.add(2), base.sub(10), h));
      sigma.addAssign(shaft);
    });
    out.assign(vec2(sigma, clamp(hf, 0, 1)));
  });
  return out;
})() as unknown as V2;

// ---------------------------------------------------------------- the light

/** Henyey–Greenstein's phase function. */
const hg = (g: number, c: F): F => {
  const gg = float(g);
  const g2 = gg.mul(gg);
  return float(1).sub(g2).div(pow(float(1).add(g2).sub(gg.mul(c).mul(2)), 1.5).mul(4 * Math.PI));
};

/** A cloud's phase: strongly forward, with a little backward (the glow round the shadow of the eye). */
const phase = (c: F, k: number): F => mix(hg(0.8 * k, c), hg(-0.25 * k, c), 0.25);

const FLASH_COLOUR = vec3(0.75, 0.82, 1);

// ---------------------------------------------------------------- the march

/** The clouds are marched at this share of the scene's resolution each way, and gathered over frames. */
const MARCH_SCALE = 0.5;
/** How much of each frame's march goes into what each pixel holds, against what it held reprojected. */
const MARCH_BLEND = 0.25;
/** Steps through one system; the fair-weather layer is a thin shell, crossed in fewer. */
const STEPS = 40, FAIR_STEPS = 24;
/** The shares of the light taken by the clouds at which the march marks how far it has come. */
const KNOT_1 = 0.1, KNOT_2 = 0.5;

const VIEW = {
  /** The view-projection of the frame before, for finding where a pixel's cloud was. */
  before: uniform(new Matrix4()),
  /** How much of this frame's march goes into each pixel: 1 after a cut. */
  blend: uniform(1),
};

/** What the clouds hold for each pixel: the light they send to the eye (rgb) and the light they let through (a); and
 *  how far along the ray they begin, have taken a tenth of what they take, half of it, and end. */
interface Held { light: StorageTexture; depth: StorageTexture }

function held2(w: number, h: number): Held {
  const make = (): StorageTexture => {
    const t = new StorageTexture(w, h);
    t.type = HalfFloatType;
    t.minFilter = t.magFilter = LinearFilter;
    t.generateMipmaps = false;
    return t;
  };
  return { light: make(), depth: make() };
}

/** Where the ray d from eye runs through system i: x where it enters, y where it leaves; x over y if it misses. */
function span(eye: V3, d: V3, i: I): V2 {
  const look = el(SYS.look, i);
  const kind = int(look.x);
  const shape = el(SHAPE_K, kind), fall = el(FALL_K, kind);
  const sea = P.planet.y;
  const lo = select(fall.x.greaterThan(0).or(fall.z.greaterThan(0.5)), float(0), shape.x);
  const hi = shape.x.add(shape.y.mul(1.08));
  const outer = raySphere(eye, d, sea.add(hi));
  const inner = raySphere(eye, d, sea.add(lo));
  const b = el(SYS.bound, i);
  const bound = raySphere(eye.sub(b.xyz), d, b.w);
  const t0 = max(max(outer.x, bound.x), 0.1).toVar();
  const t1 = min(outer.y, bound.y).toVar();
  // under the band the ray starts where it rises out of the floor; over it, it stops where it reaches it
  If(eye.length().lessThan(sea.add(lo)), () => {
    t0.assign(max(t0, inner.y));
  }).ElseIf(inner.x.greaterThan(0), () => {
    t1.assign(min(t1, inner.x));
  });
  // and nothing is seen through the sea
  const water = raySphere(eye, d, sea);
  If(water.x.greaterThan(0), () => {
    t1.assign(min(t1, water.x));
  });
  return select(outer.y.lessThan(0).or(bound.y.lessThan(0)), vec2(1, 0), vec2(t0, t1));
}

/**
 * Marches every system along each pixel's ray, nearest first, into `into`, blended with what `from` held where the
 * pixel's cloud was the frame before. A pixel keeps no scene depth: it keeps where along the ray its clouds begin,
 * take a tenth and half of what they take, and end, so the scene can find how much of them lies in front of whatever
 * it has drawn there.
 */
function marchKernel(into: Held, from: Held, w: number, h: number): ComputeNode {
  const kernel = Fn(() => {
    const id = globalId.xy;
    If(id.x.lessThan(w).and(id.y.lessThan(h)), () => {
      const uv = vec2(id).add(0.5).div(vec2(w, h));
      const view = vec3(uv.x.mul(2).sub(1).mul(EYE.tan.x), float(1).sub(uv.y.mul(2)).mul(EYE.tan.y), -1);
      const d = EYE.world.mul(vec4(view, 0)).xyz.normalize();
      const eye = EYE.position;
      const jitter = interleavedGradientNoise(vec2(id).add(P.frame.mul(5.588238)));
      const key = KEY.dir;
      const cosT = d.dot(key);
      const ph0 = phase(cosT, 1), ph1 = phase(cosT, 0.5), ph2 = phase(cosT, 0.25);
      const sea = P.planet.y;

      const L = vec3(0).toVar();
      const T = float(1).toVar();
      const front = float(-1).toVar(), knot1 = float(-1).toVar(), knot2 = float(-1).toVar(), back = float(0).toVar();
      const depthSum = float(0).toVar(), depthWeight = float(0).toVar();
      const lastT = float(-1).toVar(), lastI = int(-1).toVar();

      loop('cloudOrder', SYS.count, () => {
        // the next system the ray enters
        const best = float(1e9).toVar(), bestI = int(-1).toVar();
        loop('cloudPick', SYS.count, (i) => {
          const s = span(eye, d, i);
          const e = select(s.y.greaterThan(s.x), s.x, float(1e9));
          const later = e.greaterThan(lastT).or(e.equal(lastT).and(i.greaterThan(lastI)));
          If(later.and(e.lessThan(best)), () => {
            best.assign(e);
            bestI.assign(i);
          });
        });
        If(bestI.lessThan(0).or(best.greaterThan(1e8)).or(T.lessThan(0.015)), () => {
          Break();
        });
        lastT.assign(best);
        lastI.assign(bestI);
        const index = bestI;
        const s = span(eye, d, index);
        const t0 = s.x, t1 = s.y;
        const look = el(SYS.look, index);
        const kind = int(look.x);
        const shape = el(SHAPE_K, kind), fall = el(FALL_K, kind), tint = el(TINT_K, kind).xyz;
        const dt = t1.sub(t0).div(select(el(TINT_K, kind).w.greaterThan(0.5), float(FAIR_STEPS), float(STEPS)));
        const t = t0.add(dt.mul(jitter)).toVar();
        // this system's own light and what it lets through, and its mean depth
        const Ls = vec3(0).toVar();
        const Ts = float(1).toVar();
        const at = float(0).toVar(), weight = float(0).toVar();
        // the sky's light from above and the sea's from below, taken where the ray comes in
        const pIn = eye.add(d.mul(t0));
        const upIn = pIn.normalize();
        const skyTop = skyLight(pIn, upIn), skyBottom = skyLight(pIn, upIn.negate());
        const flash = el(SYS.flash, index);
        const albedo = shape.w;
        loop('cloudStep', STEPS, () => {
          If(T.mul(Ts).lessThan(0.015).or(t.greaterThan(t1)), () => {
            Break();
          });
          const p = eye.add(d.mul(t));
          const c = cloudAt(p, index, float(1));
          If(c.x.greaterThan(1e-4), () => {
            const r = p.length(), up = p.div(r);
            const sun = lightTransmittance(r, up.dot(P.sunDir), float(SUN_RADIUS)).mul(P.sunIlluminance);
            const moon = lightTransmittance(r, up.dot(P.moonDir), float(MOON_RADIUS)).mul(P.moonIlluminance).mul(P.moonPhase);
            const light = select(KEY.sun.greaterThan(0.5), sun, moon);
            const lit = FLASH_COLOUR.mul(flash.w).mul(exp(p.distance(flash.xyz).mul(-1 / 22))).mul(40);
            const source = vec3(0).toVar();
            If(fall.x.greaterThan(0).and(r.sub(sea).lessThan(shape.x)), () => {
              // in the fall under the cloud the drops are thin: the light comes through the whole cloud over them,
              // which the shade map has already found, and the sky's through the deck the same way
              const shade = cloudShade(p);
              const direct = light.mul(shade).mul(ph0.add(ph1.mul(0.5)).add(ph2.mul(0.25)));
              const ambient = skyTop.mul(shade.mul(0.7).add(0.3)).add(skyBottom.mul(0.45)).mul(1 / (2 * Math.PI));
              source.assign(direct.add(ambient).add(lit).mul(albedo).mul(tint));
            }).Else(() => {
              // the light's way out toward the key, in steps that double
              const tau = float(0).toVar();
              loop('cloudLight', 5, (k) => {
                const len = pow(float(2), float(k)).mul(3);
                tau.addAssign(cloudAt(p.add(key.mul(len.mul(1.5).sub(3))), index, float(0)).x.mul(len));
              });
              // several orders of scattering, each seeing less of the cloud and scattering less forward (Wrenninge 2015)
              const orders = exp(tau.negate()).mul(ph0).add(exp(tau.mul(-0.4)).mul(ph1).mul(0.5)).add(exp(tau.mul(-0.16)).mul(ph2).mul(0.25));
              // the powder: the light scattered back out of a cloud's thin edge is little, seen from away from the light
              const powder = float(1).sub(exp(c.x.mul(-14)));
              const direct = light.mul(orders).mul(mix(powder, float(1), cosT.mul(0.5).add(0.5)));
              // the sky's light comes down through the cloud over the sample, the sea's up through the cloud under it
              const above = cloudAt(p.add(up.mul(8)), index, float(0)).x.mul(8).add(cloudAt(p.add(up.mul(24)), index, float(0)).x.mul(16));
              const below = cloudAt(p.sub(up.mul(10)), index, float(0)).x.mul(12);
              const ambient = skyTop.mul(exp(above.mul(-0.6))).add(skyBottom.mul(exp(below.mul(-0.6))).mul(0.45)).mul(1 / (2 * Math.PI));
              source.assign(direct.add(ambient).add(lit).mul(albedo).mul(tint));
            });
            const tr = exp(c.x.mul(dt).negate());
            const taken = Ts.mul(float(1).sub(tr));
            Ls.addAssign(source.mul(taken));
            at.addAssign(t.mul(taken));
            weight.addAssign(taken);
            Ts.mulAssign(tr);
            // the marks along the ray, by how much of the light all the clouds so far have taken
            const gone = float(1).sub(T.mul(Ts));
            If(front.lessThan(0), () => {
              front.assign(t.sub(dt.mul(0.5)));
            });
            If(knot1.lessThan(0).and(gone.greaterThanEqual(KNOT_1)), () => {
              knot1.assign(t);
            });
            If(knot2.lessThan(0).and(gone.greaterThanEqual(KNOT_2)), () => {
              knot2.assign(t);
            });
            back.assign(t.add(dt.mul(0.5)));
          });
          t.addAssign(dt);
        });
        If(weight.greaterThan(1e-5), () => {
          const alpha = float(1).sub(Ts);
          // the haze between the eye and this system, and the mist closer in, at its mean depth
          const mean = eye.add(d.mul(at.div(weight)));
          const { light, loss } = aerialAt(mean);
          const mist = fogAt(mean);
          L.addAssign(Ls.mul(loss).add(light.mul(alpha)).mul(mist.loss).add(mist.light.mul(alpha)).mul(T));
          depthSum.addAssign(at.mul(T));
          depthWeight.addAssign(weight.mul(T));
          T.mulAssign(Ts);
        });
      });

      const gone = float(1).sub(T);
      const none = gone.lessThan(1e-4);
      const end = select(none, float(0), back);
      const marks = vec4(
        select(none, float(0), max(front, 0)),
        select(knot1.lessThan(0), end, knot1),
        select(knot2.lessThan(0), end, knot2),
        end,
      );
      const now = vec4(L, T);
      // where this pixel's cloud was the frame before: at its mean depth, or far off for clear sky
      const meanDepth = select(depthWeight.greaterThan(1e-5), depthSum.div(max(depthWeight, 1e-5)), float(3000));
      const was = VIEW.before.mul(vec4(eye.add(d.mul(meanDepth)), 1));
      const wuv = vec2(was.x.div(max(was.w, 1e-4)).mul(0.5).add(0.5), float(0.5).sub(was.y.div(max(was.w, 1e-4)).mul(0.5)));
      const seen = was.w.greaterThan(0).and(wuv.x.greaterThan(0)).and(wuv.x.lessThan(1)).and(wuv.y.greaterThan(0)).and(wuv.y.lessThan(1));
      const k = select(seen, VIEW.blend, float(1));
      const beforeLight = texture(from.light, wuv).level(float(0));
      const beforeMarks = texture(from.depth, wuv).level(float(0));
      // what the pixel held is kept only within reach of what it sees now, so a cloud that has moved leaves no ghost
      const keptLight = vec4(beforeLight.rgb.min(L.mul(2).add(0.02)), clamp(beforeLight.a, T.sub(0.35), T.add(0.35)));
      textureStore(into.light, uvec2(id.x, id.y), mix(keptLight, now, k));
      textureStore(into.depth, uvec2(id.x, id.y), mix(beforeMarks, marks, k));
    });
  })();
  return (kernel as unknown as { compute(size: number[], group: number[]): ComputeNode })
    .compute([Math.ceil(w / 8), Math.ceil(h / 8), 1], [8, 8, 1]);
}

/** The clouds laid over the scene: at each pixel, the part of them that lies in front of what the scene has drawn. */
function compositeMaterial(source: Held): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false });
  m.blending = CustomBlending;
  m.blendSrc = m.blendSrcAlpha = OneFactor;
  m.blendDst = m.blendDstAlpha = OneMinusSrcAlphaFactor;
  m.fog = false;
  m.vertexNode = vec4(positionGeometry.xy, 0, 1);
  m.outputNode = Fn(() => {
    const held = texture(source.light, screenUV);
    const marks = texture(source.depth, screenUV);
    const all = float(1).sub(held.a);
    If(all.lessThan(0.002), () => {
      Discard();
    });
    // how far along this pixel's ray the scene has drawn something
    const viewZ = perspectiveDepthToViewZ(overDepth().x, cameraNear, cameraFar);
    const ndc = vec2(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y.mul(2)));
    const stretch = vec3(ndc.x.mul(EYE.tan.x), ndc.y.mul(EYE.tan.y), 1).length();
    const z = viewZ.negate().mul(stretch);
    // the share of the light the clouds take in front of it, piecewise along the marks
    const a1 = min(all, KNOT_1), a2 = min(all, KNOT_2);
    const part = (z0: F, z1: F, b0: F, b1: F): F => mix(b0, b1, clamp(z.sub(z0).div(max(z1.sub(z0), 1e-3)), 0, 1));
    const taken = select(z.lessThan(marks.y), part(marks.x, marks.y, float(0), a1),
      select(z.lessThan(marks.z), part(marks.y, marks.z, a1, a2), part(marks.z, marks.w, a2, all)));
    return vec4(held.rgb.mul(taken.div(all)), taken);
  })();
  return m;
}

// ---------------------------------------------------------------- the thin layer

/** The share of its towers' height above its base a system's thin layer lies at. */
const LAYER_AT = 0.4;
/** The layer is traced at this share of the scene's resolution each way. */
const LAYER_SCALE = 0.25;

/**
 * While the volumes are parked, each system is a thin layer, traced at a quarter of the scene's resolution each way:
 * where the ray crosses the height the system's cloud is thickest at, the column of cloud over and under it is read at
 * three heights through its towers and lit as a slab, its light's way out toward the key and the orders of its
 * scattering worked out through the slab as the march works them out step by step. A fog bank lies on the water,
 * where the mist has it. A texel keeps where along its ray the nearest layer it saw lies, so the scene, drawn at its
 * own resolution, shows the clouds only in front of whatever it drew.
 */
function layerKernel(into: Held, w: number, h: number): ComputeNode {
  const kernel = Fn(() => {
    const id = globalId.xy;
    If(id.x.lessThan(w).and(id.y.lessThan(h)), () => {
      const uv = vec2(id).add(0.5).div(vec2(w, h));
      const view = vec3(uv.x.mul(2).sub(1).mul(EYE.tan.x), float(1).sub(uv.y.mul(2)).mul(EYE.tan.y), -1);
      const d = EYE.world.mul(vec4(view, 0)).xyz.normalize();
      const eye = EYE.position, sea = P.planet.y;
      // nothing is seen through the sea
      const water = raySphere(eye, d, sea);
      const end = select(water.x.greaterThan(0), water.x, float(1e9));
      const key = KEY.dir, cosT = d.dot(key);
      const ph0 = phase(cosT, 1), ph1 = phase(cosT, 0.5), ph2 = phase(cosT, 0.25);
      const L = vec3(0).toVar(), T = float(1).toVar(), front = float(1e4).toVar();
      loop('cloudLayer', SYS.count, (i) => {
        const look = el(SYS.look, i), kind = int(look.x);
        const shape = el(SHAPE_K, kind), fall = el(FALL_K, kind), tint = el(TINT_K, kind).xyz;
        If(fall.z.lessThan(0.5), () => {
          const height = sea.add(shape.x).add(shape.y.mul(LAYER_AT));
          const cross = raySphere(eye, d, height);
          const t = select(eye.length().greaterThan(height), cross.x, cross.y);
          If(t.greaterThan(0).and(t.lessThan(end)), () => {
            const p = eye.add(d.mul(t));
            const r = p.length(), up = p.div(r);
            // the column of cloud over and under the crossing, read at three heights through its towers
            const at = (k: number) => cloudAt(up.mul(sea.add(shape.x).add(shape.y.mul(k))), i, float(1)).x;
            const low = at(0.15), mid = at(LAYER_AT), high = at(0.7);
            const sigma = low.add(mid).add(high).div(3);
            If(sigma.greaterThan(1e-4), () => {
              const slab = shape.y.mul(0.7);
              const alpha = float(1).sub(exp(min(sigma.mul(slab).div(max(abs(d.dot(up)), 0.12)), 60).negate()));
              const sun = lightTransmittance(r, up.dot(P.sunDir), float(SUN_RADIUS)).mul(P.sunIlluminance);
              const moon = lightTransmittance(r, up.dot(P.moonDir), float(MOON_RADIUS)).mul(P.moonIlluminance).mul(P.moonPhase);
              const light = select(KEY.sun.greaterThan(0.5), sun, moon);
              // the light's way out from the middle of the slab toward the key, and the orders of its scattering
              const tau = min(mid.add(high).mul(0.5).mul(slab.mul(0.5)).div(max(up.dot(key), 0.1)), 60);
              const orders = exp(tau.negate()).mul(ph0).add(exp(tau.mul(-0.4)).mul(ph1).mul(0.5)).add(exp(tau.mul(-0.16)).mul(ph2).mul(0.25));
              const powder = float(1).sub(exp(sigma.mul(-14)));
              const direct = light.mul(orders).mul(mix(powder, float(1), cosT.mul(0.5).add(0.5)));
              const ambient = skyLight(p, up).mul(0.7).add(skyLight(p, up.negate()).mul(0.45)).mul(1 / (2 * Math.PI));
              const flash = el(SYS.flash, i);
              const lit = FLASH_COLOUR.mul(flash.w).mul(exp(p.distance(flash.xyz).mul(-1 / 60))).mul(40);
              const source = direct.add(ambient).add(lit).mul(shape.w).mul(tint);
              // the haze between the eye and the layer, and the mist closer in
              const air = aerialAt(p), mist = fogAt(p);
              L.addAssign(source.mul(air.loss).add(air.light).mul(alpha).mul(mist.loss).add(mist.light.mul(alpha)).mul(T));
              T.mulAssign(float(1).sub(alpha));
              front.assign(min(front, t));
            });
          });
        });
      });
      textureStore(into.light, uvec2(id.x, id.y), vec4(L, float(1).sub(T)));
      textureStore(into.depth, uvec2(id.x, id.y), vec4(front, 0, 0, 0));
    });
  })();
  return (kernel as unknown as { compute(size: number[], group: number[]): ComputeNode })
    .compute([Math.ceil(w / 8), Math.ceil(h / 8), 1], [8, 8, 1]);
}

/** The thin layer laid over the scene where it lies in front of what the scene drew. */
function layerComposite(source: Held): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false });
  m.blending = CustomBlending;
  m.blendSrc = m.blendSrcAlpha = OneFactor;
  m.blendDst = m.blendDstAlpha = OneMinusSrcAlphaFactor;
  m.fog = false;
  m.vertexNode = vec4(positionGeometry.xy, 0, 1);
  m.outputNode = Fn(() => {
    const held = texture(source.light, screenUV);
    const at = texture(source.depth, screenUV).x;
    // how far along this pixel's ray the scene has drawn something
    const viewZ = perspectiveDepthToViewZ(overDepth().x, cameraNear, cameraFar);
    const ndc = vec2(screenUV.x.mul(2).sub(1), float(1).sub(screenUV.y.mul(2)));
    const z = viewZ.negate().mul(vec3(ndc.x.mul(EYE.tan.x), ndc.y.mul(EYE.tan.y), 1).length());
    const shown = held.a.mul(smoothstep(at.mul(0.97), at, z));
    If(shown.lessThan(0.002), () => {
      Discard();
    });
    return vec4(held.rgb.mul(shown.div(max(held.a, 1e-4))), shown);
  })();
  return m;
}

// ---------------------------------------------------------------- the shade

/** How high the shade map's march climbs, metres over the sea: over the tallest anvil. */
const SHADE_TOP = 260;
const SHADE_STEPS = 24;

const shadeKernel = Fn(() => {
  const x = instanceIndex.mod(SHADE_SIZE), y = instanceIndex.div(SHADE_SIZE);
  const uv = vec2(x, y).add(0.5).div(SHADE_SIZE).mul(2).sub(1).mul(SHADE.extent);
  const o = SHADE.centre.add(SHADE.e1.mul(uv.x)).add(SHADE.e2.mul(uv.y));
  const key = KEY.dir;
  // from where the beam meets the sea, toward the light, up through the clouds' reach
  const sea = raySphere(o, key, P.planet.y);
  const top = raySphere(o, key, P.planet.y.add(SHADE_TOP));
  const s0 = sea.y, s1 = top.y;
  const tau = float(0).toVar();
  If(s1.greaterThan(s0), () => {
    const ds = s1.sub(s0).div(SHADE_STEPS);
    loop('shadeStep', SHADE_STEPS, (k) => {
      const p = o.add(key.mul(s0.add(ds.mul(float(k).add(0.5)))));
      loop('shadeSystem', MAX_CLOUDS, (i) => {
        If(i.lessThan(SYS.count), () => {
          tau.addAssign(cloudAt(p, i, float(0)).x.mul(ds));
        });
      });
    });
  });
  textureStore(SHADE.map, uvec2(x, y), vec4(exp(tau.negate()), 0, 0, 1));
})().compute(SHADE_SIZE * SHADE_SIZE);

// ---------------------------------------------------------------- the stage's side

interface Flicker { next: number; pulses: number[]; at: Vector3; age: number }

const _up = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();
const _v = new Vector3();
const _w = new Vector3();

export class Clouds {
  readonly group = new Group();
  /** How deep the eye is in each kind of weather, 0…1. */
  readonly depth: Partial<Record<WeatherKind, number>> = {};
  /** Lightning's flash at the eye, 0…1, by how near and how bright. */
  flash = 0;
  #made = false;
  readonly #flickers = new Map<number, Flicker>();
  #time = 0;
  /** The march's two sets of textures, written and read back in turn, and its kernels for each turn. */
  #held: [Held, Held] | null = null;
  #kernels: [ComputeNode, ComputeNode] | null = null;
  #turn = 0;
  #size = new Vector2();
  #frames = 0;
  readonly #eye = new Vector3();
  readonly #forward = new Vector3();
  /** The quad over the whole view the clouds are laid on with. */
  readonly #quad: Mesh;
  readonly #materials: [MeshBasicNodeMaterial, MeshBasicNodeMaterial] | [] = [];
  /** The thin layer's texels, kernel and composite, while the volumes are parked. */
  #layer: { held: Held; kernel: ComputeNode; composite: MeshBasicNodeMaterial } | null = null;

  constructor() {
    this.group.name = 'clouds';
    this.#quad = new Mesh(new PlaneGeometry(2, 2));
    this.#quad.frustumCulled = false;
    this.#quad.renderOrder = 1;
    this.#quad.visible = false;
    this.#quad.name = 'clouds';
    this.group.add(this.#quad);
  }

  /**
   * Marches the clouds for this frame, at MARCH_SCALE of the scene's own size, w × h. Run after the atmosphere and
   * the fog have followed the camera, and before the scene is drawn.
   */
  march(renderer: WebGPURenderer, w: number, h: number, eye: Vector3, forward: Vector3, viewProjection: Matrix4): void {
    if (PARKED.cloudVolumes) {
      const lw = Math.max(8, Math.round(w * LAYER_SCALE)), lh = Math.max(8, Math.round(h * LAYER_SCALE));
      if (!this.#layer || this.#size.x !== lw || this.#size.y !== lh) {
        this.#size.set(lw, lh);
        this.#layer?.held.light.dispose();
        this.#layer?.held.depth.dispose();
        this.#layer?.composite.dispose();
        const held = held2(lw, lh);
        this.#layer = { held, kernel: layerKernel(held, lw, lh), composite: layerComposite(held) };
      }
      this.#quad.material = this.#layer.composite;
      this.#quad.visible = SYS.count.value > 0;
      if (this.#quad.visible) renderer.compute(this.#layer.kernel);
      return;
    }
    const mw = Math.max(8, Math.round(w * MARCH_SCALE)), mh = Math.max(8, Math.round(h * MARCH_SCALE));
    if (!this.#held || this.#size.x !== mw || this.#size.y !== mh) {
      this.#size.set(mw, mh);
      this.#held?.forEach((t) => { t.light.dispose(); t.depth.dispose(); });
      const held: [Held, Held] = [held2(mw, mh), held2(mw, mh)];
      this.#held = held;
      this.#kernels = [marchKernel(held[0], held[1], mw, mh), marchKernel(held[1], held[0], mw, mh)];
      (this.#materials as MeshBasicNodeMaterial[]).forEach((m) => m.dispose());
      this.#materials.length = 0;
      (this.#materials as MeshBasicNodeMaterial[]).push(compositeMaterial(held[0]), compositeMaterial(held[1]));
      this.#frames = 0;
    }
    this.#quad.visible = SYS.count.value > 0;
    if (!this.#quad.visible) {
      this.#frames = 0;
      return;
    }
    // a cut, or the first frame: nothing from before to keep
    const cut = this.#frames === 0 || this.#eye.distanceTo(eye) > 25 || this.#forward.dot(forward) < 0.8;
    VIEW.blend.value = cut ? 1 : MARCH_BLEND;
    this.#eye.copy(eye);
    this.#forward.copy(forward);
    const t = this.#turn;
    renderer.compute(this.#kernels![t]);
    this.#quad.material = this.#materials[t]!;
    (VIEW.before.value as Matrix4).copy(viewProjection);
    this.#turn = 1 - t;
    this.#frames++;
  }

  /** Lays out the systems' clouds for a frame, and the shade they throw. */
  update(renderer: WebGPURenderer, systems: readonly CloudSystem[], eye: Vector3, sun: Vector3, moon: Vector3, dt: number, fair = 0): void {
    if (!this.#made) {
      renderer.compute([shapeKernel, detailKernel] as ComputeNode[]);
      this.#made = true;
    }
    this.#time += dt;
    for (const k of Object.keys(this.depth) as WeatherKind[]) this.depth[k] = 0;
    const eyeUp = _up.copy(eye).normalize();
    const sea = (P.planet.value as Vector4).y;
    let n = 0, flash = 0;
    const seen = new Set<number>();
    systems.forEach((s, index) => {
      const along = Math.acos(Math.min(1, Math.max(-1, eyeUp.x * s.at.x + eyeUp.y * s.at.y + eyeUp.z * s.at.z))) * R;
      const inside = s.strength * smooth(s.radius, s.radius * 0.55, along);
      this.depth[s.kind] = Math.max(this.depth[s.kind] ?? 0, inside);
      const kind = KIND_INDEX[s.kind];
      if (kind === undefined || s.strength < 0.01 || n >= MAX_CLOUDS) return;
      const k = KINDS[kind];
      const id = s.id ?? index;
      seen.add(id);
      const i = n++;
      const c = _v.set(s.at.x, s.at.y, s.at.z).normalize();
      (SYS.place.array[i] as Vector4).set(c.x, c.y, c.z, s.radius);
      (SYS.look.array[i] as Vector4).set(kind, s.strength, (id * 0.6180339887) % 1 * 10, 0);
      // the sphere round the system's cap, between the lowest and highest it reaches, and the anvil's spread
      const [lo, hi] = reach(k);
      const angle = (s.radius * (k.anvil ? 1.45 : 1.1)) / R;
      const wide = (sea + hi) * Math.sin(angle);
      const half = (hi - lo) / 2 + (sea + hi) * (1 - Math.cos(angle));
      const radius = Math.hypot(wide, half) * 1.02;
      const mid = c.clone().multiplyScalar(sea + (lo + hi) / 2 - (sea + hi) * (1 - Math.cos(angle)) / 2);
      (SYS.bound.array[i] as Vector4).set(mid.x, mid.y, mid.z, radius);
      // lightning flickering inside a thunderhead now and then
      const fl = (SYS.flash.array[i] as Vector4);
      fl.w = 0;
      if (s.kind === 'thunder' && s.strength > 0.3) {
        const lit = this.#flicker(id, c, s.radius, k, sea, dt);
        if (lit) {
          fl.set(lit.at.x, lit.at.y, lit.at.z, lit.amount);
          // a flash inside the cloud lights the world less than a stroke down to the sea
          flash = Math.max(flash, lit.amount * 0.45 * smooth(700, 120, lit.at.distanceTo(eye)));
        }
      }
      // a bolt striking out of this system lights it from where its channel goes up into the cloud
      if (STRIKE.light > 0.01 && _w.copy(STRIKE.top).normalize().angleTo(c) * R < s.radius * 1.2) {
        const into = _w.copy(STRIKE.top).setLength(sea + k.base + k.tower * 0.12);
        if (STRIKE.light * 1.6 > fl.w) fl.set(into.x, into.y, into.z, STRIKE.light * 1.6);
      }
    });
    // the fair-weather layer: a shell round the whole planet, its noise carried along by the wind
    if (fair > 0.01 && n < MAX_CLOUDS) {
      const i = n++, [, hi] = reach(KINDS[FAIR]);
      const drift = (P.drift.value as Vector3);
      (SYS.place.array[i] as Vector4).set(drift.x * 0.6 / R, drift.y * 0.6 / R, drift.z * 0.6 / R, 1e5);
      (SYS.look.array[i] as Vector4).set(FAIR, fair, 7.3, 0);
      (SYS.bound.array[i] as Vector4).set(0, 0, 0, (sea + hi) * 1.001);
      (SYS.flash.array[i] as Vector4).w = 0;
    }
    if (STRIKE.light > 0.01) flash = Math.max(flash, STRIKE.light * smooth(900, 150, STRIKE.foot.distanceTo(eye)));
    for (const id of this.#flickers.keys()) if (!seen.has(id)) this.#flickers.delete(id);
    SYS.count.value = n;
    this.flash = flash;

    // the key light: the sun until it is well down even for the cloud tops, then the moon
    const sunUp = eyeUp.dot(sun) > -0.55;
    (KEY.dir.value as Vector3).copy(sunUp ? sun : moon);
    KEY.sun.value = sunUp ? 1 : 0;
    SHADE.sun.value = KEY.sun.value;
    SHADE.on.value = n > 0 ? 1 : 0;
    if (n > 0) {
      const key = KEY.dir.value as Vector3;
      // the square across the beam, centred on the sea under the eye
      (SHADE.centre.value as Vector3).copy(eyeUp).multiplyScalar(sea);
      _e1.set(0, 1, 0).cross(key);
      if (_e1.lengthSq() < 1e-6) _e1.set(1, 0, 0);
      _e1.normalize();
      _e2.crossVectors(key, _e1);
      (SHADE.e1.value as Vector3).copy(_e1);
      (SHADE.e2.value as Vector3).copy(_e2);
      renderer.compute(shadeKernel as ComputeNode);
    }
  }

  /** The lightning inside a thunderhead this frame: a few quick pulses every few seconds, somewhere in its column. */
  #flicker(id: number, c: Vector3, radius: number, k: Kind, sea: number, dt: number): { at: Vector3; amount: number } | null {
    let f = this.#flickers.get(id);
    if (!f) {
      f = { next: this.#time + 1 + Math.random() * 4, pulses: [], at: new Vector3(), age: 0 };
      this.#flickers.set(id, f);
    }
    if (this.#time >= f.next) {
      // somewhere in the column, low in the cloud
      _e1.set(0, 1, 0).cross(c);
      if (_e1.lengthSq() < 1e-6) _e1.set(1, 0, 0);
      _e1.normalize();
      _e2.crossVectors(c, _e1);
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius * 0.45;
      f.at.copy(c).multiplyScalar(R).addScaledVector(_e1, Math.cos(a) * d).addScaledVector(_e2, Math.sin(a) * d)
        .setLength(sea + k.base + k.tower * (0.15 + Math.random() * 0.35));
      const count = 1 + Math.floor(Math.random() * 3);
      f.pulses = Array.from({ length: count }, (_, j) => j * (0.07 + Math.random() * 0.12));
      f.age = 0;
      f.next = this.#time + 2 + Math.random() * 6;
    }
    f.age += dt;
    let amount = 0;
    for (const p of f.pulses) {
      const t = f.age - p;
      if (t >= 0 && t < 0.25) amount = Math.max(amount, Math.exp(-t * 18) * (0.6 + 0.4 * Math.random()));
    }
    return amount > 0.01 ? { at: f.at, amount } : null;
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

