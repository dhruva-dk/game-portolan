// The waves on the GPU: each cascade's starting amplitudes, moved on in time every frame, turned from wavenumbers
// to the sea by an inverse FFT, and written into textures the surface samples.
//
// Each frame: one kernel moves every mode on (h(k, t) = h0(k) e^{-iωt} + h0*(-k) e^{iωt}) and spreads it into eight
// spectra (height, the two horizontal displacements and five of their derivatives), packed two real fields to a
// complex number and two complex numbers to a vec4; then a Stockham FFT, a whole row in one workgroup's memory,
// across the rows and down the columns; then one kernel per cascade writes three textures:
//   displacement  (x, height, z, persistent foam)
//   slope         (∂h/∂x, ∂h/∂z, λ∂Dx/∂x, λ∂Dz/∂z), for the normal and the fold of the surface
//   moments       ((∂h/∂x)², (∂h/∂z)², ∂h/∂x ∂h/∂z, λ∂Dx/∂z): filtered down the mips, the slopes' variance over a
//                 pixel's footprint, which turns detail too fine to draw into roughness (Bruneton, Neyret and
//                 Holzschuch, "Real-time Realistic Ocean Lighting", 2010), so the sun's glitter widens into a road
//                 toward the horizon and the sea never sparkles in noise.
// Foam is the surface folding over (the Jacobian of its displacement dropping toward zero) and stays, fading, after
// the crest has passed.
import { RepeatWrapping, LinearMipmapLinearFilter, HalfFloatType, StorageArrayTexture, type ComputeNode, type Node } from 'three/webgpu';
import {
  Fn, clamp, cos, cosh, exp, float, instanceIndex, instancedArray, localId, log, max, pow, select, sin, sqrt, tanh,
  storageTexture, int, uint, uniform, uvec2, vec2, vec4, workgroupArray, workgroupBarrier, workgroupId, atan,
} from 'three/tsl';
import { Vector2 } from 'three/webgpu';
import { CASCADES, CUTS, G, N, SIZES, SWELL_SPREAD, type SpectrumParams } from './spectrum.ts';

type F = Node<'float'>;
type V2 = Node<'vec2'>;
type U = Node<'uint'>;

/** What the waves are built from and moved by. */
export const SEA = {
  windAlpha: uniform(0.01),
  windPeak: uniform(1),
  windDir: uniform(new Vector2(1, 0)),
  swellAlpha: uniform(0),
  swellPeak: uniform(1),
  swellDir: uniform(new Vector2(1, 0)),
  seed: uniform(0, 'uint'),
  chop: uniform(0.9),
  time: uniform(0),
  dt: uniform(1 / 60),
  /** Foam: the fold (Jacobian) below which the surface breaks white, how fast it whitens, and how long it lasts, s. */
  foamFold: uniform(0.55),
  foamGain: uniform(2.5),
  foamLife: uniform(2.8),
};

export function setSpectrum(p: SpectrumParams, seed: number): void {
  SEA.windAlpha.value = p.windAlpha;
  SEA.windPeak.value = p.windPeak;
  (SEA.windDir.value as Vector2).set(...p.windDir);
  SEA.swellAlpha.value = p.swellAlpha;
  SEA.swellPeak.value = p.swellPeak;
  (SEA.swellDir.value as Vector2).set(...p.swellDir);
  SEA.seed.value = seed;
}

const NN = N * N;
const HALF = N / 2;
const STAGES = Math.log2(N);

// ---------------------------------------------------------------- the spectrum, as spectrum.ts has it

const pcg = (v: U): U => {
  const state = v.mul(uint(747796405)).add(uint(2891336453));
  const word = state.shiftRight(state.shiftRight(uint(28)).add(uint(4))).bitXor(state).mul(uint(277803737));
  return word.shiftRight(uint(22)).bitXor(word);
};

const gaussian = (c: U, x: U, y: U): V2 => {
  const s = c.mul(uint(N)).add(y).mul(uint(N)).add(x).mul(uint(2)).add(SEA.seed.mul(uint(2 * NN * CASCADES)));
  const u1 = float(pcg(s)).add(0.5).div(4294967296);
  const u2 = float(pcg(s.add(uint(1)))).add(0.5).div(4294967296);
  const r = sqrt(log(u1).mul(-2));
  const a = u2.mul(2 * Math.PI);
  return vec2(r.mul(cos(a)), r.mul(sin(a)));
};

const jonswap = (w: F, alpha: F, peak: F, gamma: number): F => {
  const sigma = select(w.lessThanEqual(peak), float(0.07), float(0.09));
  const r = exp(w.sub(peak).mul(w.sub(peak)).negate().div(sigma.mul(sigma).mul(peak).mul(peak).mul(2)));
  const w2 = w.mul(w);
  const q = peak.div(w);
  const q2 = q.mul(q);
  return alpha.mul(G * G).div(w2.mul(w2).mul(w)).mul(exp(q2.mul(q2).mul(-1.25))).mul(pow(float(gamma), r));
};

const donelanBanner = (w: F, peak: F, theta: F): F => {
  const r = w.div(peak);
  const beta = select(r.lessThan(0.95), pow(r, 1.3).mul(2.61),
    select(r.lessThan(1.6), pow(r, -0.65).mul(2.28), pow(float(10), exp(log(r.mul(r)).mul(-0.567)).mul(0.8393).sub(0.4))));
  const c = cosh(beta.mul(theta));
  return beta.div(tanh(beta.mul(Math.PI)).mul(2)).div(c.mul(c));
};

const spectrum = (kx: F, kz: F): F => {
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

/** The cascade's tile and band of wavenumbers, by its index. */
const cascadeSize = (c: U): F => select(c.equal(uint(0)), float(SIZES[0]), select(c.equal(uint(1)), float(SIZES[1]), float(SIZES[2])));
const cutLow = (c: U): F => select(c.equal(uint(0)), float(CUTS[0]), select(c.equal(uint(1)), float(CUTS[1]), float(CUTS[2])));
const cutHigh = (c: U): F => select(c.equal(uint(0)), float(CUTS[1]), select(c.equal(uint(1)), float(CUTS[2]), float(CUTS[3])));

const modeOf = (i: U): F => select(i.lessThan(uint(HALF)), float(i), float(i).sub(N));

// ---------------------------------------------------------------- the GPU's state

const cmul = (a: V2, b: V2): V2 => vec2(a.x.mul(b.x).sub(a.y.mul(b.y)), a.x.mul(b.y).add(a.y.mul(b.x)));

/** The layers of the waves' texture: each kind's first cascade; the cascades follow it. */
export const LAYER = { displacement: 0, slope: CASCADES, moments: 2 * CASCADES } as const;

function waveField(): StorageArrayTexture {
  const t = new StorageArrayTexture(N, N, 3 * CASCADES);
  t.type = HalfFloatType;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  (t as unknown as { mipmapsAutoUpdate: boolean }).mipmapsAutoUpdate = true;
  t.anisotropy = 8;
  return t;
}

export class Waves {
  /** Displacement, slope and moments for every cascade (see the top of this file), one texture so the water's
   *  shader samples all nine through one sampler: Metal allows sixteen to a stage. */
  readonly field = waveField();
  /** Builds the starting amplitudes: run when the sea state changes. */
  readonly build: ComputeNode;
  /** Moves the waves on: run every frame. */
  readonly frame: ComputeNode[];

  constructor() {
    const h0 = instancedArray(CASCADES * NN, 'vec4');
    const work = instancedArray(2 * CASCADES * NN, 'vec4');
    const foam = instancedArray(CASCADES * NN, 'float');

    this.build = Fn(() => {
      const id = uint(instanceIndex);
      const c = id.div(uint(NN));
      const rem = id.mod(uint(NN));
      const y = rem.div(uint(N)), x = rem.mod(uint(N));
      const dk = float(2 * Math.PI).div(cascadeSize(c));
      const kx = modeOf(x).mul(dk), kz = modeOf(y).mul(dk);
      const k = sqrt(kx.mul(kx).add(kz.mul(kz)));
      const inBand = k.greaterThan(1e-6).and(k.greaterThanEqual(cutLow(c))).and(k.lessThan(cutHigh(c)));
      const a = select(inBand, sqrt(spectrum(kx, kz)).mul(dk).mul(0.5), float(0));
      const am = select(inBand, sqrt(spectrum(kx.negate(), kz.negate())).mul(dk).mul(0.5), float(0));
      const g = gaussian(c, x, y).mul(a);
      const xm = uint(N).sub(x).mod(uint(N)), ym = uint(N).sub(y).mod(uint(N));
      const gm = gaussian(c, xm, ym).mul(am);
      h0.element(id).assign(vec4(g, gm.x, gm.y.negate()));
    })().compute(CASCADES * NN, [64]);

    const evolve = Fn(() => {
      const id = uint(instanceIndex);
      const c = id.div(uint(NN));
      const rem = id.mod(uint(NN));
      const y = rem.div(uint(N)), x = rem.mod(uint(N));
      const dk = float(2 * Math.PI).div(cascadeSize(c));
      const kx = modeOf(x).mul(dk), kz = modeOf(y).mul(dk);
      const k = max(sqrt(kx.mul(kx).add(kz.mul(kz))), 1e-6);
      const w = sqrt(k.mul(G));
      // the phase wrapped in double the precision a float holds at long times: ω t taken modulo 2π in two parts
      const t = SEA.time;
      const phase = w.mul(t).sub(w.mul(t).div(2 * Math.PI).floor().mul(2 * Math.PI));
      const e = vec2(cos(phase), sin(phase));
      const s = h0.element(id);
      const h = cmul(s.xy, vec2(e.x, e.y.negate())).add(cmul(s.zw, e));
      const hr = h.x, hi = h.y;
      const ix = kx.div(k), iz = kz.div(k);
      // -i (k/|k|) h, i k h, and k_a k_b / |k| h
      const Dx = vec2(hi, hr.negate()).mul(ix), Dz = vec2(hi, hr.negate()).mul(iz);
      const Dyx = vec2(hi.negate(), hr).mul(kx), Dyz = vec2(hi.negate(), hr).mul(kz);
      const Dxx = h.mul(kx.mul(ix)), Dzz = h.mul(kz.mul(iz)), Dxz = h.mul(kx.mul(iz));
      // two real fields to a complex number: A + iB
      const pack = (A: V2, B: V2): V2 => vec2(A.x.sub(B.y), A.y.add(B.x));
      work.element(c.mul(uint(NN)).add(rem)).assign(vec4(pack(Dx, Dz), pack(h, Dxz)));
      work.element(c.add(uint(CASCADES)).mul(uint(NN)).add(rem)).assign(vec4(pack(Dyx, Dyz), pack(Dxx, Dzz)));
    })().compute(CASCADES * NN, [64]);

    const fft = (vertical: boolean) => Fn(() => {
      const ping = workgroupArray('vec4', N) as unknown as { element(i: U): Node<'vec4'> };
      const pong = workgroupArray('vec4', N) as unknown as { element(i: U): Node<'vec4'> };
      const line = uint(workgroupId.x);
      const j = uint(localId.x);
      const base = line.div(uint(N)).mul(uint(NN));
      const r = line.mod(uint(N));
      const at = (e: U): U => (vertical ? base.add(e.mul(uint(N))).add(r) : base.add(r.mul(uint(N))).add(e));
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

    const store = storageTexture(this.field);
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
      store.depth(layer.add(LAYER.displacement)).store(at, vec4(dx, dy, dz, f));
      store.depth(layer.add(LAYER.slope)).store(at, vec4(dyx, dyz, dxx, dzz));
      store.depth(layer.add(LAYER.moments)).store(at, vec4(dyx.mul(dyx), dyz.mul(dyz), dyx.mul(dyz), dxz));
    })().compute(CASCADES * NN, [64]);

    this.frame = [evolve, fft(false), fft(true), resolve];
  }
}
