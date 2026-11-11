// The sea: Tessendorf's waves ("Simulating Ocean Water", 2001) from a JONSWAP spectrum in three cascades, moved on
// by an FFT every frame, laid on the sphere and shaded as deep water under the sky.
//
// Each frame one kernel moves every mode on and spreads it into eight spectra (height, the two horizontal
// displacements and five derivatives, packed two real fields to a complex number), a Stockham FFT runs across the rows
// and down the columns in workgroup memory, and one kernel per cascade writes three layers:
//   displacement  (x, height, z)
//   slope         (∂h/∂x, ∂h/∂z, λ∂Dx/∂x, λ∂Dz/∂z)
//   moments       ((∂h/∂x)², (∂h/∂z)², persistent foam, λ∂Dx/∂z), whose mips are the slopes' variance over a pixel
//                 (Bruneton, Neyret and Holzschuch 2010): detail too fine to draw becomes roughness, so the sun's
//                 glitter widens into a road toward the horizon instead of sparkling in noise.
//
// The waves are tiles in a plane; the sea is a sphere. The plane is laid round an anchor by the azimuthal-equidistant
// map. When the eye has sailed far from the anchor a new one is laid under it, its axes carried by parallel
// transport, and the sea is drawn from both for a few seconds weighted cos/sin, which keeps the variance of one sea.
// The grid is rings round the point under the eye, fine under it and coarse at the horizon, drawn out to the horizon.
//
// The water's light: the sky and clouds reflected (the panorama, blurred by the slopes' variance) by Fresnel; the sun's
// glitter (Beckmann, its width the variance); under the surface the light scattered back by the deep, blue; the sun
// through the thin crests, turquoise (after Atlas, GDC 2019); and foam where the surface folds and after.
import { BufferGeometry, Float32BufferAttribute, HalfFloatType, LinearMipmapLinearFilter, Mesh, MeshBasicNodeMaterial, Quaternion, RepeatWrapping, StorageArrayTexture, Vector2, Vector3, type ComputeNode, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, If, atan, cameraPosition, clamp, cos, cosh, dot, exp, float, instanceIndex, instancedArray, int, length, localId, log, log2, max, min, mix,
  normalize, positionGeometry, positionWorld, pow, reflect, screenUV, select, sin, smoothstep, sqrt, storageTexture, tanh, texture, uint,
  uniform, uvec2, varyingProperty, vec2, vec3, vec4, workgroupArray, workgroupBarrier, workgroupId,
} from 'three/tsl';
import { CALM_SEA, CASCADES, CUTS, G, LongWaves, N, SIZES, SWELL_SPREAD, significantHeight, spectrumParams, type SeaState, type SpectrumParams } from '../render/ocean/spectrum.ts';
import { MipChain, R, U, shared } from './world.ts';
import { SKY_TEXTURES, ambientAt, moonAt, reflected, sunAt } from './sky.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Nd = any;

export { CALM_SEA, type SeaState };

// ---------------------------------------------------------------- the waves

export const SEA = shared({
  windAlpha: uniform(0.01),
  windPeak: uniform(1),
  windDir: uniform(new Vector2(1, 0)),
  swellAlpha: uniform(0),
  swellPeak: uniform(1),
  swellDir: uniform(new Vector2(1, 0)),
  seed: uniform(0, 'uint'),
  chop: uniform(1.0),
  time: uniform(0),
  dt: uniform(1 / 60),
  /** Foam: the fold below which the surface breaks white, how fast it whitens, how long it lasts, s. */
  foamFold: uniform(0.6),
  foamGain: uniform(2.2),
  foamLife: uniform(3.2),
  crest: uniform(2),
});

const NN = N * N;
const HALF = N / 2;
const STAGES = Math.log2(N);
const LAYER = { displacement: 0, slope: CASCADES, moments: 2 * CASCADES } as const;

const pcg = (v: Nd): Nd => {
  const state = v.mul(uint(747796405)).add(uint(2891336453));
  const word = state.shiftRight(state.shiftRight(uint(28)).add(uint(4))).bitXor(state).mul(uint(277803737));
  return word.shiftRight(uint(22)).bitXor(word);
};

const gaussian = (c: Nd, x: Nd, y: Nd): Nd => {
  const s = c.mul(uint(N)).add(y).mul(uint(N)).add(x).mul(uint(2)).add(SEA.seed.mul(uint(2 * NN * CASCADES)));
  const u1 = float(pcg(s)).add(0.5).div(4294967296);
  const u2 = float(pcg(s.add(uint(1)))).add(0.5).div(4294967296);
  const r = sqrt(log(u1).mul(-2));
  const a = u2.mul(2 * Math.PI);
  return vec2(r.mul(cos(a)), r.mul(sin(a)));
};

const jonswap = (w: Nd, alpha: Nd, peak: Nd, gamma: number): Nd => {
  const sigma = select(w.lessThanEqual(peak), float(0.07), float(0.09));
  const r = exp(w.sub(peak).mul(w.sub(peak)).negate().div(sigma.mul(sigma).mul(peak).mul(peak).mul(2)));
  const w2 = w.mul(w);
  const q = peak.div(w);
  const q2 = q.mul(q);
  return alpha.mul(G * G).div(w2.mul(w2).mul(w)).mul(exp(q2.mul(q2).mul(-1.25))).mul(pow(float(gamma), r));
};

const donelanBanner = (w: Nd, peak: Nd, theta: Nd): Nd => {
  const r = w.div(peak);
  const beta = select(r.lessThan(0.95), pow(r, 1.3).mul(2.61),
    select(r.lessThan(1.6), pow(r, -0.65).mul(2.28), pow(float(10), exp(log(r.mul(r)).mul(-0.567)).mul(0.8393).sub(0.4))));
  const c = cosh(beta.mul(theta));
  return beta.div(tanh(beta.mul(Math.PI)).mul(2)).div(c.mul(c));
};

const spectrum = (kx: Nd, kz: Nd): Nd => {
  const k = max(sqrt(kx.mul(kx).add(kz.mul(kz))), 1e-6);
  const w = sqrt(k.mul(G));
  const dwdk = float(G).div(w.mul(2));
  const wd = SEA.windDir, sd = SEA.swellDir;
  const cosW = kx.mul(wd.x).add(kz.mul(wd.y)).div(k);
  const sinW = kz.mul(wd.x).sub(kx.mul(wd.y)).div(k);
  const wind = jonswap(w, SEA.windAlpha, SEA.windPeak, 3.3).mul(donelanBanner(w, SEA.windPeak, atan(sinW, cosW)));
  const cosS = kx.mul(sd.x).add(kz.mul(sd.y)).div(k);
  const half = sqrt(max(cosS.add(1).mul(0.5), 0));
  const swell = jonswap(w, SEA.swellAlpha, SEA.swellPeak, 7)
    .mul(Math.sqrt(SWELL_SPREAD + 0.25) / (2 * Math.sqrt(Math.PI))).mul(pow(half, float(2 * SWELL_SPREAD)));
  return wind.add(swell).mul(dwdk).div(k).mul(exp(k.mul(k).mul(-1e-4)));
};

const pick = (c: Nd, a: readonly number[], o: number): Nd => select(c.equal(uint(0)), float(a[o]), select(c.equal(uint(1)), float(a[o + 1]), float(a[o + 2])));
const modeOf = (i: Nd): Nd => select(i.lessThan(uint(HALF)), float(i), float(i).sub(N));
const cmul = (a: Nd, b: Nd): Nd => vec2(a.x.mul(b.x).sub(a.y.mul(b.y)), a.x.mul(b.y).add(a.y.mul(b.x)));

function waveField(): StorageArrayTexture {
  const t = new StorageArrayTexture(N, N, 3 * CASCADES);
  t.type = HalfFloatType;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  (t as unknown as { mipmapsAutoUpdate: boolean }).mipmapsAutoUpdate = false;
  t.anisotropy = 8;
  return t;
}

function waveKernels(field: StorageArrayTexture): { build: ComputeNode; frame: ComputeNode[] } {
  const h0 = instancedArray(CASCADES * NN, 'vec4');
  const work = instancedArray(2 * CASCADES * NN, 'vec4');
  const foam = instancedArray(CASCADES * NN, 'float');
  const coords = () => {
    const id = uint(instanceIndex);
    const c = id.div(uint(NN)), rem = id.mod(uint(NN));
    const y = rem.div(uint(N)), x = rem.mod(uint(N));
    const dk = float(2 * Math.PI).div(pick(c, SIZES, 0));
    return { id, c, rem, x, y, dk, kx: modeOf(x).mul(dk), kz: modeOf(y).mul(dk) };
  };

  const build = Fn(() => {
    const { id, c, x, y, dk, kx, kz } = coords();
    const k = sqrt(kx.mul(kx).add(kz.mul(kz)));
    const inBand = k.greaterThan(1e-6).and(k.greaterThanEqual(pick(c, CUTS, 0))).and(k.lessThan(pick(c, CUTS, 1)));
    const a = select(inBand, sqrt(spectrum(kx, kz)).mul(dk).mul(0.5), float(0));
    const am = select(inBand, sqrt(spectrum(kx.negate(), kz.negate())).mul(dk).mul(0.5), float(0));
    const g = gaussian(c, x, y).mul(a);
    const xm = uint(N).sub(x).mod(uint(N)), ym = uint(N).sub(y).mod(uint(N));
    const gm = gaussian(c, xm, ym).mul(am);
    h0.element(id).assign(vec4(g, gm.x, gm.y.negate()));
  })().compute(CASCADES * NN, [64]);

  const evolve = Fn(() => {
    const { id, c, rem, kx, kz } = coords();
    const k = max(sqrt(kx.mul(kx).add(kz.mul(kz))), 1e-6);
    const w = sqrt(k.mul(G));
    const t = SEA.time;
    const phase = w.mul(t).sub(w.mul(t).div(2 * Math.PI).floor().mul(2 * Math.PI));
    const e = vec2(cos(phase), sin(phase));
    const s = h0.element(id);
    const h = cmul(s.xy, vec2(e.x, e.y.negate())).add(cmul(s.zw, e));
    const hr = h.x, hi = h.y;
    const ix = kx.div(k), iz = kz.div(k);
    const Dx = vec2(hi, hr.negate()).mul(ix), Dz = vec2(hi, hr.negate()).mul(iz);
    const Dyx = vec2(hi.negate(), hr).mul(kx), Dyz = vec2(hi.negate(), hr).mul(kz);
    const Dxx = h.mul(kx.mul(ix)), Dzz = h.mul(kz.mul(iz)), Dxz = h.mul(kx.mul(iz));
    const pack = (A: Nd, B: Nd): Nd => vec2(A.x.sub(B.y), A.y.add(B.x));
    work.element(c.mul(uint(NN)).add(rem)).assign(vec4(pack(Dx, Dz), pack(h, Dxz)));
    work.element(c.add(uint(CASCADES)).mul(uint(NN)).add(rem)).assign(vec4(pack(Dyx, Dyz), pack(Dxx, Dzz)));
  })().compute(CASCADES * NN, [64]);

  const fft = (vertical: boolean) => Fn(() => {
    const ping = workgroupArray('vec4', N) as Nd;
    const pong = workgroupArray('vec4', N) as Nd;
    const line = uint(workgroupId.x);
    const j = uint(localId.x);
    const base = line.div(uint(N)).mul(uint(NN));
    const r = line.mod(uint(N));
    const at = (e: Nd): Nd => (vertical ? base.add(e.mul(uint(N))).add(r) : base.add(r.mul(uint(N))).add(e));
    ping.element(j).assign(work.element(at(j)));
    ping.element(j.add(uint(HALF))).assign(work.element(at(j.add(uint(HALF)))));
    workgroupBarrier();
    let src = ping, dst = pong;
    for (let s = 0; s < STAGES; s++) {
      const ns = 1 << s;
      const kk = j.bitAnd(uint(ns - 1));
      const a = src.element(j);
      const b = src.element(j.add(uint(HALF)));
      const angle = float(kk).mul(Math.PI / ns);
      const tw = vec2(cos(angle), sin(angle));
      const bw = vec4(cmul(b.xy, tw), cmul(b.zw, tw));
      const o = j.sub(kk).mul(uint(2)).add(kk);
      dst.element(o).assign(a.add(bw));
      dst.element(o.add(uint(ns))).assign(a.sub(bw));
      workgroupBarrier();
      [src, dst] = [dst, src];
    }
    work.element(at(j)).assign(src.element(j));
    work.element(at(j.add(uint(HALF)))).assign(src.element(j.add(uint(HALF))));
  })().compute(2 * CASCADES * N * HALF, [HALF]);

  const store = storageTexture(field) as Nd;
  const resolve = Fn(() => {
    const id = uint(instanceIndex);
    const c = id.div(uint(NN));
    const i = id.mod(uint(NN));
    const y = i.div(uint(N)), x = i.mod(uint(N));
    const a = work.element(c.mul(uint(NN)).add(i));
    const b = work.element(c.add(uint(CASCADES)).mul(uint(NN)).add(i));
    const lam = SEA.chop;
    const dx = a.x.mul(lam), dz = a.y.mul(lam), dy = a.z, dxz = a.w.mul(lam);
    const dyx = b.x, dyz = b.y, dxx = b.z.mul(lam), dzz = b.w.mul(lam);
    const J = dxx.add(1).mul(dzz.add(1)).sub(dxz.mul(dxz));
    const f = foam.element(id);
    const fresh = clamp(SEA.foamFold.sub(J).mul(SEA.foamGain), 0, 1);
    const kept = f.mul(exp(SEA.dt.negate().div(SEA.foamLife)));
    f.assign(max(kept, fresh));
    const at = uvec2(x, y);
    const layer = int(c);
    store.depth(layer.add(LAYER.displacement)).store(at, vec4(dx, dy, dz, 0));
    store.depth(layer.add(LAYER.slope)).store(at, vec4(dyx, dyz, dxx, dzz));
    store.depth(layer.add(LAYER.moments)).store(at, vec4(dyx.mul(dyx), dyz.mul(dyz), f, dxz));
  })().compute(CASCADES * NN, [64]);

  return { build, frame: [evolve, fft(false), fft(true), resolve] };
}

// ---------------------------------------------------------------- the grid and the frames

/** The grid's rings: 0.3 m apart under the eye, each 2.2% further than the last, out to the far side. */
const FIRST = 0.3, GROWTH = 1.022, SPOKES = 512;

/** How many of the grid's indices reach the horizon (and as far past it as a crest could show) from `height` up. */
function gridToHorizon(height: number, crest: number): number {
  const reach = R * (Math.acos(R / (R + Math.max(height, 0.5))) + Math.acos(R / (R + crest)));
  const ring = Math.ceil(Math.log(1 + (Math.min(reach, Math.PI * R) * (GROWTH - 1)) / FIRST) / Math.log(GROWTH)) + 2;
  return 3 * SPOKES + 6 * SPOKES * Math.max(ring - 1, 0);
}

function polarGrid(): BufferGeometry {
  const rings: number[] = [];
  const end = Math.PI * R;
  for (let k = 1; ; k++) {
    const s = (FIRST * (Math.pow(GROWTH, k) - 1)) / (GROWTH - 1);
    if (s >= end * 0.998) { rings.push(end); break; }
    rings.push(s);
  }
  const pos: number[] = [0, 0, 0], idx: number[] = [];
  rings.forEach((r, k) => {
    for (let s = 0; s < SPOKES; s++) pos.push(r, 0, (s / SPOKES) * Math.PI * 2 + (k % 2) * (Math.PI / SPOKES));
  });
  for (let s = 0; s < SPOKES; s++) idx.push(0, 1 + ((s + 1) % SPOKES), 1 + s);
  for (let k = 1; k < rings.length; k++) for (let s = 0; s < SPOKES; s++) {
    const a = 1 + (k - 1) * SPOKES + s, b = 1 + (k - 1) * SPOKES + ((s + 1) % SPOKES), c = a + SPOKES, d = b + SPOKES;
    idx.push(a, b, c, b, d, c);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const FRAME = shared({
  nadir: uniform(new Vector3(0, 1, 0)),
  gridE1: uniform(new Vector3(1, 0, 0)),
  gridE2: uniform(new Vector3(0, 0, -1)),
  anchor0: uniform(new Vector3(0, 1, 0)),
  axis0: uniform(new Vector3(1, 0, 0)),
  anchor1: uniform(new Vector3(0, 1, 0)),
  axis1: uniform(new Vector3(1, 0, 0)),
  weight: uniform(new Vector2(1, 0)),
});

interface FrameNodes { anchor: Nd; axis: Nd }
const FRAMES: FrameNodes[] = [{ anchor: FRAME.anchor0, axis: FRAME.axis0 }, { anchor: FRAME.anchor1, axis: FRAME.axis1 }];

/** Where up lies in a frame, metres in its plane, and the plane's axes carried to up. */
function inFrame(up: Nd, f: FrameNodes): { q: Nd; e1: Nd; e2: Nd } {
  const A = f.anchor, a1 = f.axis;
  const a2 = A.cross(a1);
  const c = dot(up, A);
  const d = up.sub(A.mul(c));
  const s = length(d);
  const dir: Nd = select(s.greaterThan(1e-7), d.div(max(s, 1e-7)), a1);
  const theta = atan(s, c);
  const cp = dot(dir, a1), sp = dot(dir, a2);
  const g = dir.mul(cos(theta)).sub(A.mul(sin(theta)));
  const t = A.cross(dir);
  return { q: vec2(cp, sp).mul(theta.mul(R)), e1: g.mul(cp).sub(t.mul(sp)), e2: g.mul(sp).add(t.mul(cp)) };
}

// ---------------------------------------------------------------- the water's look

export const WATER = shared({
  /** What the deep scatters back of the light that enters it (an albedo): a dark, saturated blue. */
  deep: uniform(new Vector3(0.0045, 0.016, 0.042)),
  /** The colour light takes through a thin crest. */
  crest: uniform(new Vector3(0.06, 0.62, 0.55)),
  foam: uniform(new Vector3(0.8, 0.84, 0.86)),
  /** The slope variance finer than the smallest cascade: capillary ripples. */
  ripples: uniform(0.0016),
});

function surfaceMaterial(field: StorageArrayTexture): MeshBasicNodeMaterial {
  const mat = new MeshBasicNodeMaterial();
  mat.fog = false;
  const tex = texture(field);
  const sample = (uv: Nd, layer: number): Nd => tex.sample(uv).depth(int(layer));

  // ----- vertex: the grid on the sphere, moved by the waves
  const along = positionGeometry.x, bearing = positionGeometry.z;
  const th = along.div(R);
  const out = FRAME.gridE1.mul(cos(bearing)).add(FRAME.gridE2.mul(sin(bearing)));
  const up = FRAME.nadir.mul(cos(th)).add(out.mul(sin(th))).normalize();
  const spacing = max(along.mul(GROWTH - 1).add(FIRST), sin(th).mul((R * 2 * Math.PI) / SPOKES));
  const displaced = (f: FrameNodes) => {
    const { q, e1, e2 } = inFrame(up, f);
    const d = vec3(0).toVar();
    for (let c = 0; c < CASCADES; c++) {
      const lod = max(log2(spacing.div(SIZES[c] / N)).add(1), 0);
      d.addAssign(sample(q.div(SIZES[c]), LAYER.displacement + c).level(lod).xyz);
    }
    return { q, world: e1.mul(d.x).add(up.mul(d.y)).add(e2.mul(d.z)), height: d.y };
  };
  const vq = varyingProperty('vec4', 'vSeaQ');
  const vRise = varyingProperty('float', 'vSeaRise');
  const vUp = varyingProperty('vec3', 'vSeaUp');
  mat.positionNode = Fn(() => {
    const a = displaced(FRAMES[0]);
    const q = vec4(a.q, 0, 0).toVar();
    const lift = a.world.mul(FRAME.weight.x).toVar();
    const rise = a.height.mul(FRAME.weight.x).toVar();
    If(FRAME.weight.y.greaterThan(0), () => {
      const b = displaced(FRAMES[1]);
      q.zw.assign(b.q);
      lift.addAssign(b.world.mul(FRAME.weight.y));
      rise.addAssign(b.height.mul(FRAME.weight.y));
    });
    vq.assign(q);
    vRise.assign(rise);
    vUp.assign(up);
    return up.mul(R).add(lift);
  })();

  // ----- fragment
  mat.colorNode = Fn(() => {
    const u = normalize(vUp);
    const slope = vec3(0).toVar(), variance = float(0).toVar(), foam = float(0).toVar(), fold = float(1).toVar(), lace = float(0).toVar();
    const shade = (q: Nd, f: FrameNodes, w: Nd) => {
      const { e1, e2 } = inFrame(u, f);
      const s = vec4(0).toVar();
      const dxz = float(0).toVar(), v = float(0).toVar(), white = float(0).toVar();
      for (let c = 0; c < CASCADES; c++) {
        const uv = q.div(SIZES[c]);
        const sl = sample(uv, LAYER.slope + c), mo = sample(uv, LAYER.moments + c);
        s.addAssign(sl);
        dxz.addAssign(mo.w);
        v.addAssign(max(mo.x.sub(sl.x.mul(sl.x)), 0).add(max(mo.y.sub(sl.y.mul(sl.y)), 0)));
        white.addAssign(mo.z.mul(c === 0 ? 1 : c === 1 ? 0.8 : 0.35));
      }
      // the finest cascade's height, for the foam's lace
      lace.addAssign(sample(q.div(SIZES[2]), LAYER.displacement + 2).y.mul(w));
      const sx = s.x.div(max(s.z.add(1), 0.2)), sz = s.y.div(max(s.w.add(1), 0.2));
      slope.addAssign(e1.mul(sx).add(e2.mul(sz)).mul(w));
      variance.addAssign(v.mul(w.mul(w)));
      foam.addAssign(white.mul(w));
      fold.assign(min(fold, s.z.add(1).mul(s.w.add(1)).sub(dxz.mul(dxz))));
    };
    shade(vq.xy, FRAMES[0], FRAME.weight.x);
    If(FRAME.weight.y.greaterThan(0), () => {
      shade(vq.zw, FRAMES[1], FRAME.weight.y);
    });
    const n = normalize(u.sub(slope));
    const p = positionWorld;
    const toEye = cameraPosition.sub(p);
    const dist = length(toEye);
    const v = toEye.div(dist);
    const nv = clamp(dot(n, v), 0.001, 1);
    const sigma2 = variance.mul(0.5).add(WATER.ripples);

    // the sky and clouds reflected, folded back over the horizon where a slope would look into the sea
    const r = reflect(v.negate(), n).toVar();
    const below = dot(r, u);
    r.assign(normalize(r.sub(u.mul(min(below, 0).mul(2.0)))));
    const blur = log2(max(sqrt(sigma2).mul(2 * 81), 1));
    const sky = reflected(r, blur);
    // Fresnel (Schlick, water's 0.02), dimmed toward grazing as rough slopes shadow each other
    const fresnel = float(0.02).add(pow(float(1).sub(nv), 5).mul(0.98)).mul(mix(float(1), float(0.75), smoothstep(0.01, 0.06, sigma2))).toVar();

    // the light arriving: the sun and the moon, and the sky over the whole dome
    const sunE = sunAt(u), moonE = moonAt(u);
    const ambient = ambientAt(u);
    const L = U.sunDir;
    const nl = max(dot(n, L), 0), ul = max(dot(u, L), 0);
    // the sun's glitter: Beckmann over the slopes' variance, the visible part of it
    const h = normalize(L.add(v));
    const nh = max(dot(n, h), 1e-3), nh2 = nh.mul(nh);
    const a2 = sigma2.mul(2);
    const D = exp(nh2.sub(1).div(nh2.mul(a2))).div(float(Math.PI).mul(a2).mul(nh2.mul(nh2)));
    const vh = max(dot(v, h), 0);
    const Fs = float(0.02).add(pow(float(1).sub(vh), 5).mul(0.98));
    const glitter = sunE.mul(Fs.mul(D).mul(nl).div(max(nv.mul(4).mul(max(nl, 0.05)), 1e-3)).mul(smoothstep(0, 0.02, nl)));
    const Lm = U.moonDir;
    const hm = normalize(Lm.add(v)), nhm = max(dot(n, hm), 1e-3), nhm2 = nhm.mul(nhm);
    const Dm = exp(nhm2.sub(1).div(nhm2.mul(a2))).div(float(Math.PI).mul(a2).mul(nhm2.mul(nhm2)));
    const moonGlint = moonE.mul(float(0.02).mul(Dm).div(max(nv.mul(4), 1e-3))).mul(max(dot(n, Lm), 0));

    // under the surface: the light into the water scattered back by the deep
    const into = ambient.add(sunE.mul(ul)).add(moonE.mul(max(dot(u, Lm), 0)));
    const body = into.mul(WATER.deep).mul(mix(float(0.75), float(1.1), nv));
    // the sun through a thin crest standing between it and the eye
    const toward = pow(clamp(dot(v, L.negate()).mul(0.5).add(0.5), 0, 1), 3);
    const thin = pow(clamp(float(0.5).sub(dot(L, n).mul(0.5)).add(0.2), 0, 1), 2);
    const crest = clamp(vRise.mul(0.55).add(0.35), 0, 2);
    const facing = pow(clamp(float(1).sub(nv), 0, 1), 2);
    const through = sunE.mul(WATER.crest).mul(toward.mul(thin).mul(crest).mul(facing).mul(0.035).add(crest.mul(0.004)));
    // foam where it folds now and where it folded a moment ago, broken into lace by the ripples under it
    const fresh = smoothstep(0.45, -0.1, fold);
    const amount = clamp(foam.mul(0.9).add(fresh.mul(0.8)), 0, 1);
    const grain = clamp(lace.mul(18).add(0.5), 0, 1);
    const far = smoothstep(60, 260, dist);
    const white = mix(smoothstep(float(1).sub(amount), float(1.25).sub(amount), grain.mul(0.6).add(amount.mul(0.4))).mul(amount.sqrt()), amount.mul(0.5), far);
    const foamLit = WATER.foam.mul(sunE.mul(max(dot(n, L), 0).mul(0.8).add(ul.mul(0.2))).add(ambient).add(moonE.mul(max(dot(u, Lm), 0)))).div(Math.PI);

    const water = sky.mul(fresnel).add(body.add(through).mul(float(1).sub(fresnel))).add(glitter.add(moonGlint).mul(float(1).sub(white)));
    const lit = mix(water, foamLit, white);
    // the air between the eye and the sea, traced at a fraction of the screen's size
    const airL = texture(SKY_TEXTURES.L!).sample(screenUV).rgb, airT = texture(SKY_TEXTURES.T!).sample(screenUV).rgb;
    return lit.mul(airT).add(airL);
  })();

  return mat;
}

// ---------------------------------------------------------------- the ocean

/** How far the eye sails from the waves' anchor before a new one is laid under it, radians of the planet: 270 m. */
const REANCHOR = 270 / R;
const CROSSFADE = 4;

interface Anchor { at: Vector3; axis: Vector3 }
const _q = new Quaternion(), _v = new Vector3();

export class Ocean {
  readonly field = waveField();
  readonly long = new LongWaves();
  readonly mesh: Mesh;
  readonly #kernels = waveKernels(this.field);
  #mips: MipChain | null = null;
  readonly #seed: number;
  #state: SeaState = { ...CALM_SEA };
  #params: SpectrumParams = spectrumParams(CALM_SEA);
  #built = '';
  #from: Anchor | null = null;
  #to: Anchor | null = null;
  #fade = 0;
  #time = 0;

  constructor(seed = 7) {
    this.#seed = seed;
    this.mesh = new Mesh(polarGrid(), surfaceMaterial(this.field));
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sea';
    this.mesh.renderOrder = -1;
  }

  set sea(s: SeaState) { this.#state = { ...s }; }
  get sea(): SeaState { return this.#state; }
  get significantHeight(): number { return significantHeight(this.#params); }

  /** Follows the point under the eye, rebuilds the spectrum if the sea has changed, and moves the waves on. */
  update(renderer: WebGPURenderer, eye: Vector3, time: number, dt: number): void {
    this.#time = time;
    const nadir = _v.copy(eye).normalize();
    this.#follow(nadir, dt);
    const grid = this.mesh.geometry;
    grid.setDrawRange(0, Math.min(gridToHorizon(eye.length() - R, SEA.crest.value as number), grid.index!.count));

    const s = this.#state;
    const key = [s.wind, s.heading, s.fetch, s.swell, s.swellLength, s.swellHeading].map((x) => x.toFixed(3)).join();
    if (key !== this.#built) {
      const p = (this.#params = spectrumParams(s));
      SEA.windAlpha.value = p.windAlpha;
      SEA.windPeak.value = p.windPeak;
      (SEA.windDir.value as Vector2).set(...p.windDir);
      SEA.swellAlpha.value = p.swellAlpha;
      SEA.swellPeak.value = p.swellPeak;
      (SEA.swellDir.value as Vector2).set(...p.swellDir);
      SEA.seed.value = this.#seed;
      SEA.crest.value = Math.min(1.5 * significantHeight(p) + 0.25, 4);
      this.long.update(p, this.#seed);
      renderer.compute(this.#kernels.build);
      this.#built = key;
    }
    SEA.chop.value = s.chop;
    SEA.time.value = time;
    SEA.dt.value = Math.min(dt, 0.1);
    renderer.compute(this.#kernels.frame);
    (this.#mips ??= new MipChain(renderer, this.field)).run();
  }

  #follow(nadir: Vector3, dt: number): void {
    (FRAME.nadir.value as Vector3).copy(nadir);
    const e1 = FRAME.gridE1.value as Vector3;
    e1.addScaledVector(nadir, -e1.dot(nadir));
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0).addScaledVector(nadir, -nadir.x);
    e1.normalize();
    (FRAME.gridE2.value as Vector3).crossVectors(e1, nadir);

    if (!this.#from) this.#from = anchorAt(nadir, null);
    const from = this.#from;
    if (!this.#to) {
      const off = from.at.angleTo(nadir);
      if (off > REANCHOR * 2.5) this.#from = anchorAt(nadir, from);
      else if (off > REANCHOR) { this.#to = anchorAt(nadir, from); this.#fade = 0; }
    } else {
      this.#fade += dt / CROSSFADE;
      if (this.#fade >= 1) { this.#from = this.#to; this.#to = null; this.#fade = 0; }
    }
    const a = this.#from!, b = this.#to ?? this.#from!;
    (FRAME.anchor0.value as Vector3).copy(a.at);
    (FRAME.axis0.value as Vector3).copy(a.axis);
    (FRAME.anchor1.value as Vector3).copy(b.at);
    (FRAME.axis1.value as Vector3).copy(b.axis);
    const t = this.#to ? (this.#fade * Math.PI) / 2 : 0;
    (FRAME.weight.value as Vector2).set(Math.cos(t), this.#to ? Math.sin(t) : 0);
  }

  /** The swell's height (m) over the sea's level at unit up: the longest waves, summed on the CPU. */
  heightAt(up: Vector3): number {
    const w = FRAME.weight.value as Vector2;
    let h = 0;
    const frames: [Anchor | null, number][] = [[this.#from, w.x], [this.#to, w.y]];
    for (const [f, weight] of frames) {
      if (!f || weight <= 0) continue;
      const q = inFrameCpu(up, f);
      h += this.long.at(q.x, q.y, this.#time) * weight;
    }
    return h;
  }
}

function anchorAt(at: Vector3, last: Anchor | null): Anchor {
  const axis = new Vector3();
  if (last) {
    _q.setFromUnitVectors(last.at, at);
    axis.copy(last.axis).applyQuaternion(_q);
  } else {
    axis.set(1, 0, 0).addScaledVector(at, -at.x);
    if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1).addScaledVector(at, -at.z);
  }
  axis.addScaledVector(at, -axis.dot(at)).normalize();
  return { at: at.clone(), axis };
}

const _d = new Vector3(), _a2 = new Vector3(), _out = new Vector2();
function inFrameCpu(up: Vector3, f: Anchor): Vector2 {
  const A = f.at, a1 = f.axis;
  _a2.crossVectors(A, a1);
  const c = up.dot(A);
  _d.copy(up).addScaledVector(A, -c);
  const s = _d.length();
  if (s > 1e-7) _d.divideScalar(s); else _d.copy(a1);
  const theta = Math.atan2(s, c);
  return _out.set(_d.dot(a1) * theta * R, _d.dot(_a2) * theta * R);
}
