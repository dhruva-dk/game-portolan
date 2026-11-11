// The air and the clouds, after Hillaire ("A Scalable and Production Ready Sky and Atmosphere Rendering Technique",
// EGSR 2020) and Schneider ("The Real-Time Volumetric Cloudscapes of Horizon Zero Dawn", SIGGRAPH 2015).
//
// Rayleigh scattering by the air, Mie scattering by its haze, an ozone layer; a shell of cumulus. Three small tables
// are integrated once: the light that survives from a height along a direction to the top of the air (transmittance),
// the light scattered more than once (multiple scattering), and the sky's light falling on the sea (irradiance, read
// back to the CPU for the ship's ambient light). Every frame one compute pass at a fraction of the screen's size traces
// each pixel's ray through the air and the clouds to the sea or to space, keeping the light scattered toward the eye
// and how much of what lies behind survives (the sky, the haze over the sea, the clouds over everything from orbit). A
// panorama of the sky and clouds round the eye, redone a slice a frame, is what the sea reflects.
//
// The air is scaled to a planet 1500 m across its radius, not to Earth: a scale height of tens of metres and
// coefficients raised so the haze reads over hundreds of metres, the noon sky stays a deep blue, and from orbit the
// air is a glowing skin round the globe. The light's path at the horizon is lengthened (lightAirMass) so the sun
// still reddens at dusk as it would through Earth's air.
import {
  HalfFloatType, LinearFilter, RepeatWrapping, Storage3DTexture, StorageArrayTexture,
  Matrix4, StorageTexture, Vector2, Vector3, ClampToEdgeWrapping, type ComputeNode, type WebGPURenderer, type PerspectiveCamera,
} from 'three/webgpu';
import {
  Break, Fn, If, Loop as LoopTyped, abs, acos, atan, clamp, cos, distance, dot, exp, float, floor, fract, instanceIndex, instancedArray,
  int, length, max, min, mix, mod, normalize, output, positionWorld, cameraPosition, pow, screenUV, select, sin, smoothstep, sqrt,
  ivec2, storageTexture, texture, texture3D, textureLoad, textureStore, uint, uniform, uvec2, uvec3, vec2, vec3, vec4,
} from 'three/tsl';
import { MipChain, R, U, shared } from './world.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;
/** three's Loop, whose typings do not know a loop variable's own name. */
const Loop = LoopTyped as N;

// ---------------------------------------------------------------- the air

export const AIR_TOP = 900;
const RT = R + AIR_TOP;
const EARTH_RAYLEIGH = [5.802e-6, 13.558e-6, 33.1e-6];
const EARTH_OZONE = [0.65e-6, 1.881e-6, 0.085e-6];
export const AIR = {
  rayleighHeight: 90,
  // Earth's Rayleigh spectrum at a density that leaves a column about 0.6 of Earth's: a deep blue zenith
  rayleigh: EARTH_RAYLEIGH.map((b) => (b * 8000) / 90),
  mieHeight: 30,
  mieScattering: 1.1e-3,
  mieAbsorption: 0.25e-3,
  mieG: 0.8,
  ozoneCentre: 250,
  ozoneWidth: 150,
  ozone: EARTH_OZONE.map((b) => (b * 16667) / 150),
  groundAlbedo: [0.04, 0.06, 0.08],
  lightAirMass: 4,
};

export const SKY = shared({
  /** The haze can be thickened by weather; 1 is a clear day. */
  haze: uniform(1),
  /** How much of the sky the clouds cover, 0–1, and how dense they are. */
  coverage: uniform(0.58),
  cloudDensity: uniform(1),
  /** How far the clouds have drifted, metres in the world (they ride the wind aloft). */
  drift: uniform(new Vector3()),
  /** The panorama the sea reflects: its up, east and north, and its eye. */
  envUp: uniform(new Vector3(0, 1, 0)),
  envEast: uniform(new Vector3(1, 0, 0)),
  envNorth: uniform(new Vector3(0, 0, 1)),
  envEye: uniform(new Vector3(0, R + 2, 0)),
  /** Rows of the panorama redone this frame. */
  envRow: uniform(0, 'uint'),
  /** The traced air's size in texels. */
  airSize: uniform(new Vector2(1, 1)),
  /** Last frame's projection of directions, how much of the last frame's trace is kept, and the frame's number. */
  lastVP: uniform(new Matrix4()),
  history: uniform(0),
  frame: uniform(0),
});

/** The cumulus shell, metres over the sea. */
export const CLOUD = { base: 360, top: 860 };

const vec = (a: number[]) => vec3(a[0], a[1], a[2]);

/** Air (x), haze (y) and ozone (z) densities at height h over the sea; none over the top of the air. */
const densities = (h: N): N => {
  const hh = max(h, 0);
  const inside = select(h.greaterThan(AIR_TOP), float(0), float(1));
  const ozone = max(float(0), float(1).sub(abs(hh.sub(AIR.ozoneCentre)).div(AIR.ozoneWidth)));
  return vec3(exp(hh.negate().div(AIR.rayleighHeight)), exp(hh.negate().div(AIR.mieHeight)).mul(SKY.haze), ozone).mul(inside);
};

const extinction = (d: N): N => vec(AIR.rayleigh).mul(d.x).add(vec3(AIR.mieScattering + AIR.mieAbsorption).mul(d.y)).add(vec(AIR.ozone).mul(d.z));

const rayleighPhase = (c: N): N => float(3 / (16 * Math.PI)).mul(c.mul(c).add(1));
const miePhase = Fn(([c, g]: [N, N]) => {
  const g2 = g.mul(g);
  const k = float(3 / (8 * Math.PI)).mul(float(1).sub(g2)).div(g2.add(2));
  const den = g2.add(1).sub(g.mul(c).mul(2));
  return k.mul(c.mul(c).add(1)).div(max(den.mul(sqrt(max(den, 1e-6))), 1e-6));
}).setLayout({ name: 'miePhase', type: 'float', inputs: [{ name: 'c', type: 'float' }, { name: 'g', type: 'float' }] });

const hg = Fn(([c, g]: [N, N]) => {
  const g2 = g.mul(g);
  return float(1 / (4 * Math.PI)).mul(float(1).sub(g2)).div(pow(max(g2.add(1).sub(g.mul(c).mul(2)), 1e-4), 1.5));
}).setLayout({ name: 'henyeyGreenstein', type: 'float', inputs: [{ name: 'c', type: 'float' }, { name: 'g', type: 'float' }] });

/** Where a ray from o along unit d meets the sphere of radius r: near and far distances, or (-1, -1) if it misses. */
export const raySphere = Fn(([o, d, r]: [N, N, N]) => {
  const b = dot(o, d), c = dot(o, o).sub(r.mul(r));
  const disc = b.mul(b).sub(c);
  const out = vec2(-1, -1).toVar();
  If(disc.greaterThanEqual(0), () => {
    const s = sqrt(disc);
    out.assign(vec2(b.negate().sub(s), b.negate().add(s)));
  });
  return out;
}).setLayout({ name: 'raySphere', type: 'vec2', inputs: [{ name: 'o', type: 'vec3' }, { name: 'd', type: 'vec3' }, { name: 'r', type: 'float' }] });

// ---------------------------------------------------------------- the tables

const T_W = 256, T_H = 64, MS_N = 32, AMB_N = 64;
const H_TOP = Math.sqrt(RT * RT - R * R);

function table(w: number, h: number): StorageTexture {
  const t = new StorageTexture(w, h);
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.generateMipmaps = false;
  return t;
}

const transmittanceTable = table(T_W, T_H);
const multiTable = table(MS_N, MS_N);
const ambientTable = table(AMB_N, 1);

/** The transmittance table's coordinates for height r from the centre and cosine mu off the zenith (Bruneton 2017). */
const transmittanceUV = Fn(([r, mu]: [N, N]) => {
  const rho = sqrt(max(r.mul(r).sub(R * R), 0));
  const d = max(r.negate().mul(mu).add(sqrt(max(r.mul(r).mul(mu.mul(mu).sub(1)).add(RT * RT), 0))), 0);
  const dmin = float(RT).sub(r), dmax = rho.add(H_TOP);
  return vec2(d.sub(dmin).div(max(dmax.sub(dmin), 1e-3)), rho.div(H_TOP));
}).setLayout({ name: 'transmittanceUV', type: 'vec2', inputs: [{ name: 'r', type: 'float' }, { name: 'mu', type: 'float' }] });

/**
 * The light that reaches height r (from the centre) from a body at cosine mu off the zenith, with the planet's shadow
 * eased over the body's own disc so the terminator is soft.
 */
export const lightTransmittance = (r: N, mu: N): N => {
  const rr = clamp(r, R + 0.5, RT - 0.5);
  const t = texture(transmittanceTable).sample(transmittanceUV(rr, max(mu, -1))).level(float(0)).rgb;
  const horizon = sqrt(max(float(1).sub(float(R * R).div(rr.mul(rr))), 0)).negate();
  return t.mul(smoothstep(horizon.sub(0.012), horizon.add(0.012), mu));
};

const multiScattering = (r: N, mu: N): N =>
  texture(multiTable).sample(vec2(mu.mul(0.5).add(0.5), r.sub(R).div(AIR_TOP))).level(float(0)).rgb;

/** Optical depth from height r along mu to the top of the air, marched (the table's kernel and the CPU's twin). */
function opticalDepthKernel(r: N, mu: N, steps: number): N {
  const o = vec3(0, r, 0), d = vec3(sqrt(max(float(1).sub(mu.mul(mu)), 0)), mu, 0);
  const far = raySphere(o, d, float(RT)).y;
  const dt = far.div(steps);
  const od = vec3(0).toVar();
  Loop({ start: int(0), end: int(steps), type: 'int', condition: '<', name: 'tk' }, ({ tk }: { tk: N }) => {
    const p = o.add(d.mul(float(tk).add(0.5).mul(dt)));
    od.addAssign(extinction(densities(length(p).sub(R))).mul(dt));
  });
  // the light's path lengthened toward the horizon, for Earth's sunsets on a small planet
  const lengthen = float(1).add(float(AIR.lightAirMass - 1).mul(pow(float(1).sub(clamp(mu, 0, 1)), 3)));
  return od.mul(lengthen);
}

const transmittanceKernel = Fn(() => {
  const id = instanceIndex;
  const x = id.mod(T_W), y = id.div(T_W);
  const u = float(x).add(0.5).div(T_W), v = float(y).add(0.5).div(T_H);
  const rho = v.mul(H_TOP), r = sqrt(rho.mul(rho).add(R * R));
  const dmin = float(RT).sub(r), dmax = rho.add(H_TOP), d = dmin.add(u.mul(dmax.sub(dmin)));
  const mu = select(d.lessThan(1e-3), float(1), float(H_TOP * H_TOP).sub(rho.mul(rho)).sub(d.mul(d)).div(r.mul(d).mul(2)));
  const t: N = exp(opticalDepthKernel(r, clamp(mu, -1, 1), 48).negate());
  textureStore(transmittanceTable, uvec2(x, y), vec4(t, 1));
})().compute(T_W * T_H, [64]);

/** Hillaire's multiple scattering: second-order light and the transfer of an isotropic unit, summed as a series. */
const multiKernel = Fn(() => {
  const id = instanceIndex;
  const x = id.mod(MS_N), y = id.div(MS_N);
  const muS = float(x).add(0.5).div(MS_N).mul(2).sub(1);
  const r = float(R).add(float(y).add(0.5).div(MS_N).mul(AIR_TOP));
  const o = vec3(0, r, 0), sun = vec3(sqrt(max(float(1).sub(muS.mul(muS)), 0)), muS, 0);
  const l2 = vec3(0).toVar(), fms = vec3(0).toVar();
  const DIRS = 64, STEPS = 20;
  Loop({ start: int(0), end: int(DIRS), type: 'int', condition: '<', name: 'md' }, ({ md }: { md: N }) => {
    // a Fibonacci sphere of directions
    const k = float(md).add(0.5);
    const z = float(1).sub(k.mul(2 / DIRS)), a = k.mul(Math.PI * (3 - Math.sqrt(5)));
    const s = sqrt(max(float(1).sub(z.mul(z)), 0));
    const d = vec3(s.mul(cos(a)), z, s.mul(sin(a)));
    const ground = raySphere(o, d, float(R));
    const top = raySphere(o, d, float(RT)).y;
    const hits = ground.x.greaterThan(0);
    const far = select(hits, ground.x, top);
    const dt = far.div(STEPS);
    const T = vec3(1).toVar(), L = vec3(0).toVar(), F = vec3(0).toVar();
    Loop({ start: int(0), end: int(STEPS), type: 'int', condition: '<', name: 'ms' }, ({ ms }: { ms: N }) => {
      const p = o.add(d.mul(float(ms).add(0.5).mul(dt)));
      const pr = length(p);
      const den = densities(pr.sub(R));
      const sR = vec(AIR.rayleigh).mul(den.x), sM = vec3(AIR.mieScattering).mul(den.y);
      const scat = sR.add(sM), ext = extinction(den);
      const tl = lightTransmittance(pr, dot(p.div(pr), sun));
      const step = exp(ext.negate().mul(dt));
      const integ = vec3(1).sub(step).div(max(ext, vec3(1e-9)));
      L.addAssign(T.mul(scat).mul(tl).mul(1 / (4 * Math.PI)).mul(integ));
      F.addAssign(T.mul(scat).mul(integ));
      T.mulAssign(step);
    });
    // the sea under it throws back what reaches it
    If(hits, () => {
      const p = o.add(d.mul(ground.x)), n = normalize(p);
      L.addAssign(T.mul(lightTransmittance(float(R), dot(n, sun))).mul(max(dot(n, sun), 0)).mul(vec(AIR.groundAlbedo)).mul(1 / Math.PI));
    });
    l2.addAssign(L.mul(1 / DIRS));
    fms.addAssign(F.mul(1 / (4 * Math.PI)).mul(4 * Math.PI / DIRS));
  });
  const psi = l2.div(max(vec3(1).sub(fms), vec3(1e-3)));
  textureStore(multiTable, uvec2(x, y), vec4(psi, 1));
})().compute(MS_N * MS_N, [64]);

// ---------------------------------------------------------------- the air along a ray

/** Light scattered toward the eye per metre at p, looking along d, from the sun and the moon (single and multiple). */
function inscatter(p: N, d: N, den: N): N {
  const pr = length(p), up = p.div(pr);
  const sR = vec(AIR.rayleigh).mul(den.x), sM = vec3(AIR.mieScattering).mul(den.y);
  const one = (l: N, e: N): N => {
    const c = dot(d, l), mu = dot(up, l);
    const single = sR.mul(rayleighPhase(c)).add(sM.mul(miePhase(c, float(AIR.mieG))));
    return lightTransmittance(pr, mu).mul(single).add(multiScattering(pr, mu).mul(sR.add(sM))).mul(e);
  };
  return one(U.sunDir, U.sunLight).add(one(U.moonDir, U.moonLight));
}

/** Marches the air from o along d between t0 and t1, adding into L and multiplying T (both vars). */
function marchAir(o: N, d: N, t0: N, t1: N, steps: number, L: N, T: N, name: string): void {
  const dt = max(t1.sub(t0), 0).div(steps);
  Loop({ start: int(0), end: int(steps), type: 'int', condition: '<', name }, (v: Record<string, N>) => {
    const p = o.add(d.mul(t0.add(float(v[name]).add(0.5).mul(dt))));
    const den = densities(length(p).sub(R));
    const ext = extinction(den);
    const step = exp(ext.negate().mul(dt));
    L.addAssign(T.mul(inscatter(p, d, den)).mul(vec3(1).sub(step)).div(max(ext, vec3(1e-9))));
    T.mulAssign(step);
  });
}

// ---------------------------------------------------------------- the clouds

const SHAPE_N = 128, DETAIL_N = 32;
function volume(n: number): Storage3DTexture {
  const t = new Storage3DTexture(n, n, n);
  t.wrapS = t.wrapT = t.wrapR = RepeatWrapping;
  t.minFilter = t.magFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}
const shapeVolume = volume(SHAPE_N);
const detailVolume = volume(DETAIL_N);

const hash33 = (c: N): N =>
  fract(sin(vec3(dot(c, vec3(127.1, 311.7, 74.7)), dot(c, vec3(269.5, 183.3, 246.1)), dot(c, vec3(113.5, 271.9, 124.6)))).mul(43758.5453));

const worley = Fn(([p, period]: [N, N]) => {
  const cell = floor(p), f = fract(p);
  let near: N = float(4);
  for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const o = vec3(x, y, z);
    near = min(near, length(o.add(hash33(mod(cell.add(o), period))).sub(f)));
  }
  return clamp(float(1).sub(near), 0, 1);
}).setLayout({ name: 'worley', type: 'float', inputs: [{ name: 'p', type: 'vec3' }, { name: 'period', type: 'float' }] });

const perlin = Fn(([p, period]: [N, N]) => {
  const i: N = floor(p), f: N = fract(p);
  const u: N = f.mul(f).mul(f).mul(f.mul(f.mul(6).sub(15)).add(10));
  const g = (x: number, y: number, z: number): N => {
    const o = vec3(x, y, z);
    return dot(normalize(hash33(mod(i.add(o), period)).mul(2).sub(1)), f.sub(o));
  };
  const a = mix(mix(g(0, 0, 0), g(1, 0, 0), u.x), mix(g(0, 1, 0), g(1, 1, 0), u.x), u.y);
  const b = mix(mix(g(0, 0, 1), g(1, 0, 1), u.x), mix(g(0, 1, 1), g(1, 1, 1), u.x), u.y);
  return mix(a, b, u.z);
}).setLayout({ name: 'perlin', type: 'float', inputs: [{ name: 'p', type: 'vec3' }, { name: 'period', type: 'float' }] });

const worleyFbm = (p: N, f: number): N =>
  worley(p.mul(f), float(f)).mul(0.625).add(worley(p.mul(2 * f), float(2 * f)).mul(0.25)).add(worley(p.mul(4 * f), float(4 * f)).mul(0.125));

function texel(n: number): { at: N; uvw: N } {
  const id = instanceIndex;
  const x = id.mod(n), y = id.div(n).mod(n), z = id.div(n * n);
  return { at: uvec3(x, y, z), uvw: vec3(x, y, z).add(0.5).div(n) };
}

const shapeKernel = Fn(() => {
  const { at, uvw } = texel(SHAPE_N);
  const pf = perlin(uvw.mul(4), float(4)).mul(0.5).add(perlin(uvw.mul(8), float(8)).mul(0.25)).add(perlin(uvw.mul(16), float(16)).mul(0.125));
  const pn = clamp(pf.mul(1.1).add(0.5), 0, 1);
  const w2 = worleyFbm(uvw, 2), w4 = worleyFbm(uvw, 4), w8 = worleyFbm(uvw, 8);
  const pw = clamp(pn.sub(w2.sub(1)).div(float(2).sub(w2)), 0, 1);
  textureStore(shapeVolume, at, vec4(pw, w2, w4, w8));
})().compute(SHAPE_N ** 3, [64]);

const detailKernel = Fn(() => {
  const { at, uvw } = texel(DETAIL_N);
  textureStore(detailVolume, at, vec4(worleyFbm(uvw, 2), worleyFbm(uvw, 4), worleyFbm(uvw, 8), 1));
})().compute(DETAIL_N ** 3, [64]);

const remap = (x: N, a: N, b: N, c: N, d: N): N => c.add(x.sub(a).div(max(b.sub(a), 1e-4)).mul(d.sub(c)));

/** How dense the cloud is at p (0–1). `fine` erodes its edges with the detail noise. */
function cloudDensity(p: N, fine: boolean): N {
  const h = clamp(length(p).sub(R + CLOUD.base).div(CLOUD.top - CLOUD.base), 0, 1);
  const q = p.add(SKY.drift);
  // where clouds may form at all: broad patches a few kilometres across
  const weather = texture3D(shapeVolume, q.mul(1 / 2900)).level(float(0));
  const patch = clamp(remap(weather.g.mul(0.7).add(weather.r.mul(0.3)), float(0.25), float(0.85), float(0), float(1)), 0, 1);
  // a cumulus profile: a flat base, swelling, rounding off at the top; taller where the patch is strong
  const top = mix(float(0.45), float(1), patch);
  const profile = smoothstep(0, 0.06, h).mul(smoothstep(top, top.mul(0.45), h));
  const n = texture3D(shapeVolume, q.mul(1 / 1700)).level(float(0));
  const low = n.g.mul(0.625).add(n.b.mul(0.25)).add(n.a.mul(0.125));
  const base = clamp(remap(n.r, low.sub(1), float(1), float(0), float(1)), 0, 1).mul(profile);
  const cover = SKY.coverage.mul(mix(float(0.55), float(1.2), patch));
  let dense: N = clamp(remap(base, float(1).sub(cover), float(1), float(0), float(1)), 0, 1).mul(cover);
  if (fine) {
    const dn = texture3D(detailVolume, q.mul(1 / 190).add(vec3(0, U.time.mul(0.004), 0))).level(float(0));
    const df = dn.r.mul(0.625).add(dn.g.mul(0.25)).add(dn.b.mul(0.125));
    // wispy toward the base, billowing higher up
    const erode = mix(df, float(1).sub(df), clamp(h.mul(4), 0, 1));
    dense = clamp(remap(dense, erode.mul(0.38), float(1), float(0), float(1)), 0, 1);
  }
  return dense.mul(SKY.cloudDensity);
}

const SIGMA = 0.045;

/**
 * The clouds along o + t d for t in [t0, t1]: the light they scatter toward the eye (rgb) and what survives through
 * them (a), and the distance their light comes from on average (for laying the air in front and behind).
 */
function marchClouds(o: N, d: N, t0: N, t1: N, steps: number, jitter: N, S: N, Tc: N, mid: N): void {
  const dt = max(t1.sub(t0), 0).div(steps);
  // the brighter of the sun and the moon lights them
  const sunUp = dot(normalize(o), U.sunDir).greaterThan(-0.25);
  const key = select(sunUp, U.sunDir, U.moonDir), keyLight = select(sunUp, U.sunLight, U.moonLight);
  const c = dot(d, key);
  const weighted = float(0).toVar();
  Loop({ start: int(0), end: int(steps), type: 'int', condition: '<', name: 'ck' }, ({ ck }: { ck: N }) => {
    If(Tc.lessThan(0.02), () => { Break(); });
    const t = t0.add(float(ck).add(jitter).mul(dt));
    const p = o.add(d.mul(t));
    const dense = cloudDensity(p, true);
    If(dense.greaterThan(0.002), () => {
      // toward the light, in growing steps
      const tau = float(0).toVar();
      const lengths = [18, 34, 58, 90, 140, 210];
      let at = 0;
      for (const l of lengths) {
        at += l / 2;
        tau.addAssign(cloudDensity(p.add(key.mul(at)), false).mul(l));
        at += l / 2;
      }
      tau.mulAssign(SIGMA);
      const pr = length(p), up = p.div(pr);
      const h = clamp(pr.sub(R + CLOUD.base).div(CLOUD.top - CLOUD.base), 0, 1);
      const sun = lightTransmittance(pr, dot(up, key)).mul(keyLight);
      // Wrenninge's octaves: each scatters less forward and sees less of the cloud
      // and a last one for the light scattered many times over, which leaves a thick cloud almost evenly every way:
      // why a cumulus seen from above, with the sun behind the eye, is still white
      const ms = hg(c, float(0.78)).mul(0.65).add(hg(c, float(-0.25)).mul(0.35)).mul(exp(tau.negate()))
        .add(hg(c, float(0.39)).mul(0.5).mul(exp(tau.mul(-0.5))))
        .add(hg(c, float(0.2)).mul(0.25).mul(exp(tau.mul(-0.25))))
        .add(float(0.6 / (4 * Math.PI)).mul(exp(tau.mul(-0.12))));
      const powder = float(1).sub(exp(dense.mul(SIGMA * -60))).mul(0.4).add(0.6);
      const sky = ambientAt(up).mul(mix(float(0.35), float(1), h)).mul(1 / (4 * Math.PI));
      const ext = dense.mul(SIGMA);
      const light = sun.mul(ms).mul(powder).mul(4 * Math.PI * 0.25).add(sky).mul(ext);
      const step = exp(ext.negate().mul(dt));
      const before = Tc.toVar();
      S.addAssign(light.mul(Tc).mul(float(1).sub(step)).div(max(ext, 1e-6)));
      Tc.mulAssign(step);
      weighted.addAssign(t.mul(before.sub(Tc)));
    });
  });
  mid.assign(select(Tc.lessThan(0.999), weighted.div(max(float(1).sub(Tc), 1e-4)), t0.add(t1).mul(0.5)));
}

/** Where o + t d lies in the cloud shell: [enter, leave], or leave < enter when it misses. Clipped to [0, end]. */
function cloudSpan(o: N, d: N, end: N): N {
  const r = length(o);
  const inner = raySphere(o, d, float(R + CLOUD.base)), outer = raySphere(o, d, float(R + CLOUD.top));
  const span = vec2(1, 0).toVar();
  If(r.lessThan(R + CLOUD.base), () => {
    span.assign(vec2(inner.y, outer.y));
  }).ElseIf(r.lessThan(R + CLOUD.top), () => {
    span.assign(vec2(0, select(inner.x.greaterThan(0), inner.x, outer.y)));
  }).Else(() => {
    span.assign(vec2(outer.x, select(inner.x.greaterThan(0), inner.x, outer.y)));
  });
  return vec2(max(span.x, 0), min(span.y, end));
}

/**
 * The light a ray from o along d brings to the eye from the air and the clouds (L) and the share of what lies behind
 * that survives (T), up to the sea or out of the air. `steps` sets the cloud march's quality.
 */
function traceSky(o: N, d: N, jitter: N, cloudSteps: number, airSteps: number): { L: N; T: N; near: N } {
  const L = vec3(0).toVar(), T = vec3(1).toVar();
  // the air's own colour before any cloud: what it would show were it thick enough to hide what lies behind
  const near = vec3(0).toVar();
  const air = raySphere(o, d, float(RT));
  // from orbit the march begins where the ray enters the air
  const start = max(air.x, 0);
  If(air.y.greaterThan(0), () => {
    const sea = raySphere(o, d, float(R));
    const end = select(sea.x.greaterThan(0), sea.x, air.y);
    const span = cloudSpan(o, d, end);
    If(span.y.greaterThan(span.x.add(1)), () => {
      const S = vec3(0).toVar(), Tc = float(1).toVar(), mid = float(0).toVar();
      marchClouds(o, d, span.x, span.y, cloudSteps, jitter, S, Tc, mid);
      const m = clamp(mid, start, end);
      marchAir(o, d, start, m, airSteps, L, T, 'a1');
      near.assign(L.div(max(vec3(1).sub(T), vec3(1e-4))));
      const L2 = vec3(0).toVar(), T2 = vec3(1).toVar();
      marchAir(o, d, m, end, airSteps, L2, T2, 'a2');
      L.addAssign(T.mul(S.add(L2.mul(Tc))));
      T.mulAssign(T2.mul(Tc));
    }).Else(() => {
      marchAir(o, d, start, end, airSteps + 4, L, T, 'a0');
      near.assign(L.div(max(vec3(1).sub(T), vec3(1e-4))));
    });
  });
  return { L, T, near };
}

// ---------------------------------------------------------------- the sky's light on the sea

/** Irradiance from the whole sky on a level surface at sea level, per unit of the body's light, by its elevation. */
const ambientBuffer = instancedArray(AMB_N, 'vec4');
const ambientKernel = Fn(() => {
  const id = instanceIndex;
  const mu = float(id).add(0.5).div(AMB_N).mul(2).sub(1);
  const sun = vec3(sqrt(max(float(1).sub(mu.mul(mu)), 0)), mu, 0);
  const o = vec3(0, R + 1, 0);
  const E = vec3(0).toVar();
  const EL = 6, AZ = 12;
  Loop({ start: int(0), end: int(EL * AZ), type: 'int', condition: '<', name: 'ambDir' }, ({ ambDir }: { ambDir: N }) => {
    const ei = float(ambDir.div(AZ)), ai = float(ambDir.mod(AZ));
    const ct = ei.add(0.5).div(EL), st = sqrt(float(1).sub(ct.mul(ct)));
    const a = ai.add(0.5).div(AZ).mul(Math.PI * 2);
    const d = vec3(st.mul(cos(a)), ct, st.mul(sin(a)));
    const far = raySphere(o, d, float(RT)).y;
    const dt = far.div(14);
    const T = vec3(1).toVar(), L = vec3(0).toVar();
    Loop({ start: int(0), end: int(14), type: 'int', condition: '<', name: 'ambStep' }, ({ ambStep }: { ambStep: N }) => {
      const p = o.add(d.mul(float(ambStep).add(0.5).mul(dt)));
      const pr = length(p), up = p.div(pr);
      const den = densities(pr.sub(R));
      const sR = vec(AIR.rayleigh).mul(den.x), sM = vec3(AIR.mieScattering).mul(den.y), ext = extinction(den);
      const c = dot(d, sun), m = dot(up, sun);
      const s = lightTransmittance(pr, m).mul(sR.mul(rayleighPhase(c)).add(sM.mul(miePhase(c, float(AIR.mieG))))).add(multiScattering(pr, m).mul(sR.add(sM)));
      const step = exp(ext.negate().mul(dt));
      L.addAssign(T.mul(s).mul(vec3(1).sub(step)).div(max(ext, vec3(1e-9))));
      T.mulAssign(step);
    });
    // cosine-weighted: each cell of the stratified hemisphere covers 2π/(EL·AZ) in ct
    E.addAssign(L.mul(ct).mul((2 * Math.PI) / (EL * AZ)));
  });
  ambientBuffer.element(id).assign(vec4(E, 1));
  textureStore(ambientTable, uvec2(id, uint(0)), vec4(E, 1));
})().compute(AMB_N, [64]);

/** The sky's irradiance on a level surface at sea level at up: from the sun's sky and the moon's. */
export function ambientAt(up: N): N {
  const at = (mu: N): N => texture(ambientTable).sample(vec2(mu.mul(0.5).add(0.5), 0.5)).level(float(0)).rgb;
  return at(dot(up, U.sunDir)).mul(U.sunLight).add(at(dot(up, U.moonDir)).mul(U.moonLight));
}

/** The sun's and the moon's irradiance on a surface square to them at sea level at up. */
export function sunAt(up: N): N {
  return lightTransmittance(float(R), dot(up, U.sunDir)).mul(U.sunLight);
}
export function moonAt(up: N): N {
  return lightTransmittance(float(R), dot(up, U.moonDir)).mul(U.moonLight);
}

// ---------------------------------------------------------------- the traced air and the panorama

/** The panorama the sea reflects: the sky and clouds over the eye's horizon, its rows packed toward the horizon. */
export const ENV_W = 512, ENV_H = 128, ENV_ROWS = 16;
const envMap = new StorageArrayTexture(ENV_W, ENV_H, 1);
envMap.type = HalfFloatType;
envMap.wrapS = RepeatWrapping;
envMap.wrapT = ClampToEdgeWrapping;
envMap.generateMipmaps = true;
(envMap as unknown as { mipmapsAutoUpdate: boolean }).mipmapsAutoUpdate = false;
envMap.minFilter = LinearFilter;

/** The panorama's direction for a texel, and the texel for a direction (elevation packed by its square root). */
const envDir = (u: N, v: N): N => {
  const el = v.mul(v).mul(Math.PI / 2), az = u.mul(Math.PI * 2);
  const ce = cos(el);
  return SKY.envEast.mul(ce.mul(cos(az))).add(SKY.envNorth.mul(ce.mul(sin(az)))).add(SKY.envUp.mul(sin(el)));
};

const envKernel = Fn(() => {
  const id = instanceIndex;
  const x = id.mod(ENV_W), y = id.div(ENV_W).add(SKY.envRow);
  const d = envDir(float(x).add(0.5).div(ENV_W), float(y).add(0.5).div(ENV_H));
  const s = traceSky(SKY.envEye, d, float(0.5), 18, 6);
  (storageTexture(envMap) as N).depth(int(0)).store(uvec2(x, y), vec4(s.L, 1));
})().compute(ENV_W * ENV_ROWS, [64]);

/** The sky and clouds the sea reflects along world direction d (folded above the horizon), blurred by `lod` mips. */
export function reflected(d: N, lod: N, local: N): N {
  // read as if seen from the panorama's eye: the elevation off the local up, the bearing carried over to its frame
  const up = dot(d, local);
  const el = atan(max(up, 0), sqrt(max(float(1).sub(up.mul(up)), 1e-6)));
  const flat = d.sub(local.mul(up));
  const az = atan(dot(flat, SKY.envNorth), dot(flat, SKY.envEast));
  const uv = vec2(fract(az.div(Math.PI * 2)), sqrt(el.div(Math.PI / 2)));
  return texture(envMap).sample(uv).depth(int(0)).level(lod).rgb;
}

// ---------------------------------------------------------------- the module

export class Sky {
  /** The traced air: light toward the eye (rgb) and what survives (rgb), at a fraction of the scene's size. */
  airL: StorageTexture;
  airT: StorageTexture;
  /** The air's own colour along each ray, before the clouds, for hazing what stands in it (the ship). */
  airN: StorageTexture;
  /** Last frame's, which each frame's trace is blended into (reprojected by direction): its jitter averages out. */
  readonly #histL = table(1, 1);
  readonly #histT = table(1, 1);
  readonly #lastVP = new Matrix4();
  readonly #vp = new Matrix4();
  #frame = 0;
  #air: ComputeNode | null = null;
  #size = new Vector2();
  readonly #renderer: WebGPURenderer;
  readonly #envMips: MipChain;
  #row = 0;
  /** The sky's irradiance table, read back for the ship's ambient light: per unit body light, by elevation. */
  ambient: Float32Array | null = null;

  constructor(renderer: WebGPURenderer) {
    this.#renderer = renderer;
    this.airL = this.#target(1, 1);
    this.airT = this.#target(1, 1);
    this.airN = this.#target(1, 1);
    SKY_TEXTURES.L = this.airL;
    SKY_TEXTURES.T = this.airT;
    this.#envMips = new MipChain(renderer, envMap);
  }

  #target(w: number, h: number): StorageTexture {
    return table(w, h);
  }

  /** Integrates the tables and bakes the cloud noise: once. */
  async init(): Promise<void> {
    const r = this.#renderer;
    await r.computeAsync([transmittanceKernel]);
    await r.computeAsync([multiKernel, shapeKernel, detailKernel, ambientKernel]);
    const buf = await r.getArrayBufferAsync(ambientBuffer.value);
    this.ambient = new Float32Array(buf);
    for (let i = 0; i < ENV_H / ENV_ROWS; i++) this.#envSlice();
  }

  /** Sizes the traced air to the scene (its width and height in pixels, before any division). */
  resize(width: number, height: number, divide: number): void {
    const w = Math.max(16, Math.round(width / divide)), h = Math.max(16, Math.round(height / divide));
    if (w === this.#size.x && h === this.#size.y) return;
    this.#size.set(w, h);
    // the textures are kept (materials hold them): their images are remade at the new size
    for (const t of [this.airL, this.airT, this.airN, this.#histL, this.#histT]) t.setSize(w, h, 1);
    this.#frame = 0;
    (SKY.airSize.value as Vector2).set(w, h);
    this.#air = this.#airKernel(w, h);
  }

  #airKernel(w: number, h: number): ComputeNode {
    const L = this.airL, T = this.airT, NR = this.airN, HL = this.#histL, HT = this.#histT;
    return Fn(() => {
      const id = instanceIndex;
      const x = id.mod(w), y = id.div(w);
      const ndc = vec2(float(x).add(0.5).div(w).mul(2).sub(1), float(1).sub(float(y).add(0.5).div(h).mul(2)));
      const far = U.unproject.mul(vec4(ndc, 1, 1));
      const d = normalize(far.xyz.div(far.w));
      // a different offset into the march each frame (interleaved gradient noise, turned by the golden ratio)
      const ign = fract(float(52.9829189).mul(fract(dot(vec2(float(x), float(y)), vec2(0.06711056, 0.00583715)))));
      const jitter = fract(ign.add(SKY.frame.mul(0.618034)));
      const s = traceSky(U.eye, d, jitter, 32, 8);
      // whether the ray ends on the sea, so the sea and the sky each read only their own texels
      const sea = select(raySphere(U.eye, d, float(R)).x.greaterThan(0), float(1), float(0));
      // where this direction was on the screen last frame, and what was traced there then
      const clip = SKY.lastVP.mul(vec4(d, 0));
      const was = vec2(clip.x.div(clip.w).mul(0.5).add(0.5), float(0.5).sub(clip.y.div(clip.w).mul(0.5)));
      const inside = clip.w.greaterThan(0).and(was.x.greaterThan(0)).and(was.x.lessThan(1)).and(was.y.greaterThan(0)).and(was.y.lessThan(1));
      const hl = texture(HL).sample(was).level(float(0)), ht = texture(HT).sample(was).level(float(0));
      // kept where it was the same side of the horizon, and only while the history is warm
      const keep = select(inside.and(abs(ht.a.sub(sea)).lessThan(0.5)), SKY.history, float(0));
      textureStore(L, uvec2(x, y), vec4(mix(s.L, hl.rgb, keep), 1));
      textureStore(T, uvec2(x, y), vec4(mix(s.T, ht.rgb, keep), sea));
      textureStore(NR, uvec2(x, y), vec4(s.near, 1));
    })().compute(w * h, [64]);
  }

  #envSlice(): void {
    SKY.envRow.value = this.#row * ENV_ROWS;
    this.#renderer.compute(envKernel);
    this.#row = (this.#row + 1) % (ENV_H / ENV_ROWS);
    if (this.#row === 0) this.#envMips.run();
  }

  /** One frame: the clouds drift, the air is traced, a slice of the panorama is redone round the eye. */
  update(camera: PerspectiveCamera, focus: Vector3, dt: number): void {
    const wind = SKY.drift.value as Vector3;
    wind.addScaledVector(DRIFT, dt);
    // the panorama's eye: over the sea under what the camera looks at, a frame that turns with the planet
    if (this.#row === 0) {
      const up = (SKY.envUp.value as Vector3).copy(focus).normalize();
      (SKY.envEye.value as Vector3).copy(up).multiplyScalar(R + 3);
      const east = (SKY.envEast.value as Vector3).set(-up.z, 0, up.x);
      if (east.lengthSq() < 1e-6) east.set(1, 0, 0);
      east.addScaledVector(up, -east.dot(up)).normalize();
      (SKY.envNorth.value as Vector3).crossVectors(up, east);
    }
    this.#envSlice();
    // the direction's projection this frame (the eye's turn only: the trace is reprojected by direction)
    this.#vp.copy(camera.matrixWorldInverse).setPosition(0, 0, 0).premultiply(camera.projectionMatrix);
    (SKY.lastVP.value as Matrix4).copy(this.#frame > 0 ? this.#lastVP : this.#vp);
    SKY.history.value = this.#frame > 0 ? 0.82 : 0;
    SKY.frame.value = this.#frame % 4096;
    if (this.#air) {
      this.#renderer.compute(this.#air);
      this.#renderer.copyTextureToTexture(this.airL, this.#histL);
      this.#renderer.copyTextureToTexture(this.airT, this.#histT);
    }
    this.#lastVP.copy(this.#vp);
    this.#frame++;
  }

  /** The traced air at a point of the screen: light toward the eye and what survives. */
  static airAt(uv: N): { L: N; T: N } {
    return { L: texture(SKY_TEXTURES.L!).sample(uv).rgb, T: texture(SKY_TEXTURES.T!).sample(uv).rgb };
  }
}

/** The textures the materials read (set when the sky is made, so nodes can be built before). */
export const SKY_TEXTURES: { L: StorageTexture | null; T: StorageTexture | null } = { L: null, T: null };

const DRIFT = new Vector3(6, 0.4, -3.5);

// ---------------------------------------------------------------- what the scene draws with

/** World direction through a point of the screen. */
export const viewDir = (uv: N): N => {
  const ndc = vec2(uv.x.mul(2).sub(1), float(1).sub(uv.y.mul(2)));
  const far = U.unproject.mul(vec4(ndc, 1, 1));
  return normalize(far.xyz.div(far.w));
};

/**
 * The traced air at a point of the screen, read from the four texels round it as a bilinear filter would, but leaving
 * out those whose rays ended on the other side of the horizon (the sea's for the sky, the sky's for the sea), so the
 * low-resolution trace does not bleed the bright sky into the water along the horizon or the sea into the sky.
 */
export function airAt(uv: N, sea: boolean): { L: N; T: N } {
  const size = SKY.airSize;
  const p = uv.mul(size).sub(0.5);
  const i0: N = floor(p), f: N = fract(p);
  const L = vec3(0).toVar(), T = vec3(0).toVar(), W = float(0).toVar();
  for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const at = ivec2(clamp(i0.add(vec2(ox, oy)), vec2(0), size.sub(1)));
    const l = textureLoad(SKY_TEXTURES.L!, at), t = textureLoad(SKY_TEXTURES.T!, at);
    const bw = (ox ? f.x : float(1).sub(f.x)).mul(oy ? f.y : float(1).sub(f.y));
    const side = sea ? t.a : float(1).sub(t.a);
    const w = bw.mul(side.mul(0.9999).add(0.0001));
    L.addAssign(l.rgb.mul(w));
    T.addAssign(t.rgb.mul(w));
    W.addAssign(w);
  }
  return { L: L.div(W), T: T.div(W) };
}

/** The background: the traced sky, the sun's and the moon's discs and the stars behind what survives of it. */
export function background(): N {
  return Fn(() => {
    const uv = screenUV;
    const d = viewDir(uv);
    const { L, T } = airAt(uv, false);
    // the sun's disc (0.53° across), limb-darkened, and a little glare round it
    const cs = dot(d, U.sunDir);
    const sunR = 0.0093;
    const ang = acos(clamp(cs, -1, 1));
    const limb = sqrt(max(float(1).sub(ang.div(sunR).mul(ang.div(sunR))), 0));
    const disc = smoothstep(sunR, sunR * 0.85, ang).mul(mix(float(0.55), float(1), limb));
    const sun = U.sunLight.mul(disc.mul(1 / (Math.PI * sunR * sunR)).mul(0.04));
    // the moon: a pale disc, half lit toward the sun
    const cm = dot(d, U.moonDir), moonR = 0.012;
    const am = acos(clamp(cm, -1, 1));
    const mdisc = smoothstep(moonR, moonR * 0.9, am);
    const side = normalize(d.sub(U.moonDir.mul(cm)));
    const lit = smoothstep(-0.2, 0.25, dot(side, U.sunDir).mul(0.9).add(dot(U.moonDir, U.sunDir).negate().mul(-0.6)).add(0.3));
    const moon = vec3(0.9, 0.92, 1).mul(mdisc).mul(lit.mul(0.95).add(0.05)).mul(length(U.sunLight).mul(0.0035));
    // stars: points in a grid over the sphere of directions, each its own brightness and tint, twinkling a little
    const g = d.mul(180), cell = floor(g), f = fract(g).sub(0.5);
    const h = hash33(cell);
    const star = smoothstep(0.08, 0.0, length(f.sub(h.sub(0.5).mul(0.7)))).mul(select(h.x.greaterThan(0.985), float(1), float(0)));
    const tw = sin(U.time.mul(h.y.mul(4).add(1)).add(h.z.mul(40))).mul(0.25).add(0.75);
    const stars = mix(vec3(0.75, 0.82, 1), vec3(1, 0.86, 0.7), h.y).mul(star.mul(tw).mul(pow(h.z, 3).mul(0.06).add(0.004))).mul(length(U.sunLight));
    return vec4(L.add(sun.add(moon).add(stars).mul(T)), 1);
  })();
}

/**
 * The haze laid over what the scene draws in front of the sea: the traced air to the sea along the same ray, scaled to
 * how far the surface stands short of the sea (a ship is nearer than the water behind it).
 */
export function airFog(sky: Sky): N {
  return Fn(() => {
    const near = texture(sky.airN).sample(screenUV).rgb;
    // what survives the air between the eye and the point: its density by Simpson's rule over the straight path
    const a = length(cameraPosition).sub(R), b = length(positionWorld).sub(R);
    const m = length(cameraPosition.add(positionWorld).mul(0.5)).sub(R);
    const den = densities(a).add(densities(m).mul(4)).add(densities(b)).div(6);
    const Tk = exp(extinction(den).negate().mul(distance(positionWorld, cameraPosition)));
    return vec4(output.rgb.mul(Tk).add(near.mul(vec3(1).sub(Tk))), output.a);
  })();
}

// ---------------------------------------------------------------- the CPU's twin, for the lights

const cpu = {
  rayleigh: AIR.rayleigh, ozone: AIR.ozone,
  mie: AIR.mieScattering + AIR.mieAbsorption,
};

/** The light that reaches height r from a body at cosine mu off the zenith (as lightTransmittance). */
export function transmittanceCpu(r: number, mu: number, out: Vector3): Vector3 {
  const horizon = -Math.sqrt(Math.max(0, 1 - (R * R) / (r * r)));
  const shadow = smooth(horizon - 0.012, horizon + 0.012, mu);
  if (shadow <= 0) return out.set(0, 0, 0);
  const m = Math.max(mu, -1);
  const b = r * m, c = r * r - RT * RT, far = -b + Math.sqrt(Math.max(b * b - c, 0));
  const steps = 48, dt = far / steps, s = Math.sqrt(Math.max(0, 1 - m * m));
  const od = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt, x = s * t, y = r + m * t;
    const h = Math.hypot(x, y) - R;
    if (h > AIR_TOP) continue;
    const dr = Math.exp(-Math.max(h, 0) / AIR.rayleighHeight), dm = Math.exp(-Math.max(h, 0) / AIR.mieHeight) * (SKY.haze.value as number);
    const dz = Math.max(0, 1 - Math.abs(Math.max(h, 0) - AIR.ozoneCentre) / AIR.ozoneWidth);
    for (let k = 0; k < 3; k++) od[k] += (cpu.rayleigh[k] * dr + cpu.mie * dm + cpu.ozone[k] * dz) * dt;
  }
  const lengthen = 1 + (AIR.lightAirMass - 1) * Math.pow(1 - Math.min(Math.max(m, 0), 1), 3);
  return out.set(Math.exp(-od[0] * lengthen), Math.exp(-od[1] * lengthen), Math.exp(-od[2] * lengthen)).multiplyScalar(shadow);
}

/** The sky's irradiance on a level surface at sea level, per unit body light, for a body at cosine mu (read back). */
export function ambientCpu(table: Float32Array, mu: number, out: Vector3): Vector3 {
  const x = Math.min(Math.max((mu * 0.5 + 0.5) * AMB_N - 0.5, 0), AMB_N - 1.001);
  const i = Math.floor(x), f = x - i;
  for (let k = 0; k < 3; k++) out.setComponent(k, table[i * 4 + k] * (1 - f) + table[(i + 1) * 4 + k] * f);
  return out;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

