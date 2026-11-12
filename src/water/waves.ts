// The sea's waves on the GPU: random seas drawn from the spectrum (spectrum.ts) for each cascade (cascades.ts), moved
// on in time and turned into surfaces by an inverse FFT each frame (Tessendorf, "Simulating Ocean Water", 2001).
//
// Each frame, for all the cascades' N×N patches at once:
//   1. spectrum   h̃(k, t) = h₀(k)·e^{−iωt} + conj h₀(−k)·e^{iωt}, and from it the spectra of seven more fields: the
//                 sideways displacement (x, z) that sharpens the crests, the slopes (x, z), and the displacement's
//                 derivatives for the Jacobian. Their surfaces are real, so they go two to a complex FFT: eight
//                 fields in four, held as two vec4 per texel.
//   2. rows       an inverse FFT along each row: one workgroup per row, radix-2 Stockham in workgroup memory.
//   3. columns    the same down each column.
//   4. assemble   per cascade, undo the centred wavevectors' (−1)^(x+y) and write two textures:
//                   displacement  (x, height, z, foam): foam is laid where the surface's Jacobian J is lowest,
//                                 where the waves squeeze the water together toward folding over (Tessendorf §4.4),
//                                 and fades over seconds after. J − 1 has the cascade's mean square slope for its
//                                 variance, so J is about 1 ± √mss; the threshold is set so that the share of the sea
//                                 breaking is what is seen at sea at that wind (Monahan). The two larger cascades
//                                 only: the 16 m patch's ripples don't break.
//                   slopes        (∂h/∂x, ∂h/∂z, and their squares), so that the mipmaps three builds from them hold
//                                 the slopes' mean and mean square, and so their variance, over any footprint
//
// ω is rounded to multiples of 2π/PERIOD, so the sea repeats every PERIOD seconds and time can wrap without a jump.
// The waves run on the world's clock (Environment.clock), so the CPU's copy of the long waves (swell.ts) can be read
// at the same moment.

import {
  DataTexture, FloatType, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, RGBAFormat, RepeatWrapping, StorageTexture,
  Vector2,
} from 'three/webgpu';
import {
  Fn, cos, float, floor, instanceIndex, instancedArray, length, localId, max, select, sin, smoothstep, sqrt, textureLoad, textureStore,
  uint, uniform, uvec2, vec2, vec4, workgroupArray, workgroupBarrier, workgroupId,
} from 'three/tsl';
import type { Compute } from '../gpu';
import { BANDS, CASCADES, CHOP, PERIOD, SIZE } from './cascades';
import { G, coxMunk, initialSpectrum, meanSquareSlope, normalQuantile, seaState, whitecaps, type Sea } from './spectrum';

type N = any;

/** Cascades whose curvature focuses caustics: the shorter waves, a few metres and less. */
export const CURVED = [1, 2];
/** Cascades whose waves break: the first this many. */
export const FOAMING = 2;
/** The ripples' mean square slope is never taken below this, however much the cascades hold. */
const RIPPLE_FLOOR = 4e-4;

const HALF = SIZE / 2;
const AREA = SIZE * SIZE;
const COUNT = CASCADES.length;

function surface(): StorageTexture {
  const t = new StorageTexture(SIZE, SIZE);
  t.type = HalfFloatType;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Two complex numbers in a vec4 (xy, zw), each times the complex w. */
const twice = (a: N, w: N): N => vec4(
  a.x.mul(w.x).sub(a.y.mul(w.y)), a.x.mul(w.y).add(a.y.mul(w.x)),
  a.z.mul(w.x).sub(a.w.mul(w.y)), a.z.mul(w.y).add(a.w.mul(w.x)),
);

export type Waves = ReturnType<typeof createWaves>;

export function createWaves() {
  // each cascade's h₀ stacked: cascade c in rows c·N … c·N + N − 1
  const initial = new DataTexture(new Float32Array(AREA * COUNT * 4), SIZE, SIZE * COUNT, RGBAFormat, FloatType);
  const time = uniform(0);
  /** Half the sea's significant height: about how high a crest stands. */
  const amplitude = uniform(1);
  /** The mean square slope of the ripples no cascade holds, for the surface's roughness. */
  const ripples = uniform(0.01);
  /** The rms slope along one axis of the waves the cascades hold. */
  const steepness = uniform(0.1);
  // the eight fields' spectra for every cascade, then (in place) their surfaces
  const fieldsA = instancedArray(AREA * COUNT, 'vec4');
  const fieldsB = instancedArray(AREA * COUNT, 'vec4');
  /** Each breaking cascade's foam, 0–1 per texel, kept from frame to frame. */
  const foam = instancedArray(AREA * FOAMING, 'float');
  /** How much foam is left after this frame: e^(−dt/τ). */
  const fade = uniform(0.95);
  /** Per breaking cascade: the J below which it breaks, and how much further below the foam is whole. */
  const breaking = Array.from({ length: FOAMING }, () => uniform(new Vector2(0, 0.01)));
  const displacement = CASCADES.map(surface);
  const slopes = CASCADES.map(surface);

  const spectrumKernel = Fn(() => {
    const c = instanceIndex.div(AREA), i = instanceIndex.mod(AREA);
    const x = i.mod(SIZE), y = i.div(SIZE);
    const width = (select as N)(c.equal(0), CASCADES[0], select(c.equal(1), CASCADES[1], CASCADES[2]));
    const h0 = textureLoad(initial, uvec2(x, y.add(c.mul(SIZE))));
    const k = vec2(float(x).sub(HALF), float(y).sub(HALF)).mul(float(2 * Math.PI).div(width));
    const kl = length(k);
    const step = (2 * Math.PI) / PERIOD;
    const w = floor(sqrt(kl.mul(G)).div(step)).mul(step);
    const cw = cos(w.mul(time)), sw = sin(w.mul(time));
    // h̃ = h₀·e^{−iωt} + conj h₀(−k)·e^{iωt}: with the surface Σ h̃ e^{ik·x}, the waves at k run toward k
    const h = vec2(
      h0.x.mul(cw).add(h0.y.mul(sw)).add(h0.z.mul(cw)).sub(h0.w.mul(sw)),
      h0.y.mul(cw).sub(h0.x.mul(sw)).add(h0.z.mul(sw)).add(h0.w.mul(cw)),
    ).toVar();
    const some = kl.greaterThan(1e-6);
    const unit = select(some, k.div(kl), vec2(0)) as N;
    const inverse = select(some, float(1).div(kl), float(0)) as N;
    const ih = vec2(h.y.negate(), h.x); // i·h̃
    // D = IFFT(i k/|k| h̃) moves water toward the crests; its derivatives ∂Dx/∂x = IFFT(−kx²/|k| h̃) and so on
    const dx = ih.mul(unit.x), dz = ih.mul(unit.y);
    const sx = ih.mul(k.x), sz = ih.mul(k.y);
    const jxx = h.mul(k.x.mul(k.x).mul(inverse).negate());
    const jzz = h.mul(k.y.mul(k.y).mul(inverse).negate());
    const jxz = h.mul(k.x.mul(k.y).mul(inverse).negate());
    // two real surfaces in one complex FFT: A + iB
    const pack = (a: N, b: N) => vec2(a.x.sub(b.y), a.y.add(b.x));
    fieldsA.element(instanceIndex).assign(vec4(pack(h, dx), pack(dz, sx)));
    fieldsB.element(instanceIndex).assign(vec4(pack(sz, jxx), pack(jzz, jxz)));
  })().compute(AREA * COUNT, [64]);

  /** An inverse FFT of every row (or column) of every cascade: a workgroup a line, a thread a butterfly. */
  const fft = (rows: boolean) => Fn(() => {
    const line = workgroupId.x, i = localId.x;
    // rows of all the cascades follow one another; a column is a line within one cascade
    const at = (j: N) => (rows
      ? line.mul(SIZE).add(j)
      : line.div(SIZE).mul(AREA).add(j.mul(SIZE)).add(line.mod(SIZE)));
    const a = workgroupArray('vec4', SIZE) as N, b = workgroupArray('vec4', SIZE) as N;
    a.element(i).assign(fieldsA.element(at(i)));
    a.element(i.add(HALF)).assign(fieldsA.element(at(i.add(HALF))));
    b.element(i).assign(fieldsB.element(at(i)));
    b.element(i.add(HALF)).assign(fieldsB.element(at(i.add(HALF))));
    workgroupBarrier();
    for (let p = 1; p < SIZE; p *= 2) {
      const k = i.bitAnd(uint(p - 1));
      const angle = float(k).mul(Math.PI / p);
      const w = vec2(cos(angle), sin(angle));
      const a0 = a.element(i).toVar(), a1 = twice(a.element(i.add(HALF)), w).toVar();
      const b0 = b.element(i).toVar(), b1 = twice(b.element(i.add(HALF)), w).toVar();
      workgroupBarrier();
      const j = i.mul(2).sub(k);
      a.element(j).assign(a0.add(a1));
      a.element(j.add(p)).assign(a0.sub(a1));
      b.element(j).assign(b0.add(b1));
      b.element(j.add(p)).assign(b0.sub(b1));
      workgroupBarrier();
    }
    fieldsA.element(at(i)).assign(a.element(i));
    fieldsA.element(at(i.add(HALF))).assign(a.element(i.add(HALF)));
    fieldsB.element(at(i)).assign(b.element(i));
    fieldsB.element(at(i.add(HALF))).assign(b.element(i.add(HALF)));
  })().compute(SIZE * COUNT * HALF, [HALF]);
  const rowsKernel = fft(true), columnsKernel = fft(false);

  const assembleKernels = CASCADES.map((_, c) => Fn(() => {
    const x = instanceIndex.mod(SIZE), y = instanceIndex.div(SIZE);
    const at = instanceIndex.add(c * AREA);
    const sign = float(1).sub(float(x.add(y).bitAnd(uint(1))).mul(2));
    const a = fieldsA.element(at).mul(sign), b = fieldsB.element(at).mul(sign);
    // a = (height, Dx, Dz, slope x), b = (slope z, ∂Dx/∂x, ∂Dz/∂z, ∂Dx/∂z)
    let froth: N = float(0);
    if (c < FOAMING) {
      const jacobian = float(1).add(b.y.mul(CHOP)).mul(float(1).add(b.z.mul(CHOP))).sub(b.w.mul(b.w).mul(CHOP * CHOP));
      const kept = foam.element(instanceIndex.add(c * AREA));
      const at = breaking[c];
      froth = max(kept.mul(fade), smoothstep(at.x, at.x.sub(at.y), jacobian)).toVar();
      kept.assign(froth);
    }
    textureStore(displacement[c], uvec2(x, y), vec4(a.y.mul(CHOP), a.x, a.z.mul(CHOP), froth));
    textureStore(slopes[c], uvec2(x, y), vec4(a.w, b.x, a.w.mul(a.w), b.x.mul(b.x)));
  })().compute(AREA, [64]));

  // The two smaller cascades' curvature, (∂²h/∂x², ∂²h/∂z², ∂²h/∂x∂z), from their slopes' differences across
  // neighbouring texels of the FFT's own grid: what focuses the sunlight into caustics on the floor (water.ts). Kept as
  // its own texture so it can be interpolated: interpolated slopes, differenced, would show bilinear's texel grid.
  const curvature = CURVED.map(surface);
  const curvatureKernels = CURVED.map((c, i) => Fn(() => {
    const x = instanceIndex.mod(SIZE), y = instanceIndex.div(SIZE);
    const h = (dx: number, dy: number) => {
      const xx = x.add(SIZE + dx).mod(SIZE), yy = y.add(SIZE + dy).mod(SIZE);
      const k = yy.mul(SIZE).add(xx).add(c * AREA);
      const sign = float(1).sub(float(xx.add(yy).bitAnd(uint(1))).mul(2));
      return fieldsA.element(k).x.mul(sign);
    };
    const e2 = (CASCADES[c] / SIZE) ** 2, h0 = h(0, 0).mul(2);
    const hxx = h(1, 0).add(h(-1, 0)).sub(h0).div(e2), hzz = h(0, 1).add(h(0, -1)).sub(h0).div(e2);
    const hxz = h(1, 1).sub(h(1, -1)).sub(h(-1, 1)).add(h(-1, -1)).div(4 * e2);
    textureStore(curvature[i], uvec2(x, y), vec4(hxx, hzz, hxz, 0));
  })().compute(AREA, [64]));
  /** A frame's passes, in order, each its own. */
  const passes: Compute[] = [spectrumKernel, rowsKernel, columnsKernel, ...assembleKernels, ...curvatureKernels];

  let wind = -1, gusting = -1, held = 0;
  const spreads = CASCADES.map(() => 0);

  return {
    displacement,
    slopes,
    /** For CURVED's cascades, in that order. */
    curvature,
    amplitude,
    ripples,
    steepness,
    /**
     * sea: the sea the wind has raised (its mean over the match: waves take hours to grow); now: the wind blowing
     * now, m/s, which the whitecaps, the ripples and the foam follow within seconds; clock: the world's, seconds; dt:
     * since the last update, for the foam's fading. Returns the passes due: every one, every frame.
     */
    update(sea: Sea, now: number, clock: number, dt: number): Compute[] {
      // a new sea only when its wind changes; the same seeds keep the waves where they are
      if (Math.abs(sea.wind - wind) > 0.05) {
        wind = sea.wind;
        const data = initial.image.data as Float32Array;
        held = 0;
        CASCADES.forEach((L, c) => {
          data.set(initialSpectrum(SIZE, L, sea, c + 1, BANDS[c]), c * AREA * 4);
          const mss = meanSquareSlope(SIZE, L, sea, BANDS[c]);
          held += mss;
          spreads[c] = Math.sqrt(mss) * CHOP;
        });
        initial.needsUpdate = true;
        amplitude.value = seaState(sea.wind, sea.fetch).hs / 2;
        steepness.value = Math.sqrt(held / 2);
        gusting = -1;
      }
      if (Math.abs(now - gusting) > 0.01) {
        gusting = now;
        // each breaking cascade lays its share of the whitecaps
        for (let c = 0; c < FOAMING; c++) {
          breaking[c].value.set(1 + normalQuantile(Math.max(whitecaps(now) / FOAMING, 1e-6)) * spreads[c], spreads[c]);
        }
        ripples.value = Math.max(coxMunk(now) - held, RIPPLE_FLOOR);
      }
      // foam lasts longer the harder the wind blows: τ from a second to five (the residual foam a whitecap leaves,
      // Monahan's stage B, a few seconds)
      fade.value = Math.exp(-dt / (1 + 4 * Math.min(Math.max((now - 5) / 15, 0), 1)));
      time.value = clock % PERIOD;
      return passes;
    },
  };
}
