// The sea's waves on the GPU: a random sea drawn from the spectrum (spectrum.ts), moved on in time and turned into a
// surface by an inverse FFT each frame (Tessendorf, "Simulating Ocean Water", 2001).
//
// Each frame, for one N×N patch L metres wide that tiles the sea:
//   1. spectrum   h̃(k, t) = h₀(k)·e^{−iωt} + conj h₀(−k)·e^{iωt}, and from it the spectra of seven more fields: the
//                 sideways displacement (x, z) that sharpens the crests, the slopes (x, z), and the displacement's
//                 derivatives for the Jacobian. Their surfaces are real, so they go two to a complex FFT: eight
//                 fields in four, held as two vec4 per texel.
//   2. rows       an inverse FFT along each row: one workgroup per row, radix-2 Stockham in workgroup memory.
//   3. columns    the same down each column.
//   4. assemble   undo the centred wavevectors' (−1)^(x+y), and write the displacement (x, height, z) and the slopes
//                 with the Jacobian, where J < 1 the surface is squeezed and J < 0 it has folded: a breaking crest.
//
// ω is rounded to multiples of 2π/PERIOD, so the sea repeats every PERIOD seconds and time can wrap without a jump.

import { DataTexture, FloatType, HalfFloatType, LinearFilter, RGBAFormat, RepeatWrapping, StorageTexture, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, cos, float, floor, instanceIndex, instancedArray, length, localId, select, sin, sqrt, textureLoad, textureStore,
  uint, uniform, uvec2, vec2, vec4, workgroupArray, workgroupBarrier, workgroupId,
} from 'three/tsl';
import { G, initialSpectrum, seaState, type Sea } from './spectrum';

type N = any;

/** Texels across the patch. */
export const SIZE = 256;
/** The patch's width, metres. */
export const PATCH = 256;
/** The sea repeats after this many seconds. */
const PERIOD = 200;
/** How far the crests lean: the sideways displacement's scale. */
const CHOP = 1;

const HALF = SIZE / 2;

function surface(): StorageTexture {
  const t = new StorageTexture(SIZE, SIZE);
  t.type = HalfFloatType;
  t.minFilter = t.magFilter = LinearFilter;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Two complex numbers in a vec4 (xy, zw), each times the complex w. */
const twice = (a: N, w: N): N => vec4(
  a.x.mul(w.x).sub(a.y.mul(w.y)), a.x.mul(w.y).add(a.y.mul(w.x)),
  a.z.mul(w.x).sub(a.w.mul(w.y)), a.z.mul(w.y).add(a.w.mul(w.x)),
);

export function createWaves(renderer: WebGPURenderer) {
  const initial = new DataTexture(new Float32Array(SIZE * SIZE * 4), SIZE, SIZE, RGBAFormat, FloatType);
  const time = uniform(0);
  /** Half the sea's significant height: about how high a crest stands. */
  const amplitude = uniform(1);
  // the eight fields' spectra, then (in place) their surfaces
  const fieldsA = instancedArray(SIZE * SIZE, 'vec4');
  const fieldsB = instancedArray(SIZE * SIZE, 'vec4');
  /** x, height, z: where the water at a point of the patch has moved to, metres. */
  const displacement = surface();
  /** The height's slopes along x and z, and the Jacobian of the sideways displacement. */
  const slopes = surface();

  const spectrumKernel = Fn(() => {
    const x = instanceIndex.mod(SIZE), y = instanceIndex.div(SIZE);
    const h0 = textureLoad(initial, uvec2(x, y));
    const k = vec2(float(x).sub(HALF), float(y).sub(HALF)).mul((2 * Math.PI) / PATCH);
    const kl = length(k);
    const step = (2 * Math.PI) / PERIOD;
    const w = floor(sqrt(kl.mul(G)).div(step)).mul(step);
    const c = cos(w.mul(time)), s = sin(w.mul(time));
    // h̃ = h₀·e^{−iωt} + conj h₀(−k)·e^{iωt}: with the surface Σ h̃ e^{ik·x}, the waves at k run toward k
    const h = vec2(
      h0.x.mul(c).add(h0.y.mul(s)).add(h0.z.mul(c)).sub(h0.w.mul(s)),
      h0.y.mul(c).sub(h0.x.mul(s)).add(h0.z.mul(s)).add(h0.w.mul(c)),
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
  })().compute(SIZE * SIZE, [64]);

  /** An inverse FFT of every row (or column) of both buffers: a workgroup a line, a thread a butterfly. */
  const fft = (rows: boolean) => Fn(() => {
    const line = workgroupId.x, i = localId.x;
    const at = (j: N) => (rows ? line.mul(SIZE).add(j) : j.mul(SIZE).add(line));
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
  })().compute(SIZE * HALF, [HALF]);
  const rowsKernel = fft(true), columnsKernel = fft(false);

  const assembleKernel = Fn(() => {
    const x = instanceIndex.mod(SIZE), y = instanceIndex.div(SIZE);
    const sign = float(1).sub(float(x.add(y).bitAnd(uint(1))).mul(2));
    const a = fieldsA.element(instanceIndex).mul(sign), b = fieldsB.element(instanceIndex).mul(sign);
    // a = (height, Dx, Dz, slope x), b = (slope z, ∂Dx/∂x, ∂Dz/∂z, ∂Dx/∂z)
    const jacobian = float(1).add(b.y.mul(CHOP)).mul(float(1).add(b.z.mul(CHOP))).sub(b.w.mul(b.w).mul(CHOP * CHOP));
    textureStore(displacement, uvec2(x, y), vec4(a.y.mul(CHOP), a.x, a.z.mul(CHOP), 1));
    textureStore(slopes, uvec2(x, y), vec4(a.w, b.x, jacobian, 1));
  })().compute(SIZE * SIZE, [64]);

  let wind = -1, heading = 0, clock = 0;

  return {
    displacement,
    slopes,
    amplitude,
    update(sea: Sea, dt: number) {
      // a new sea only when the wind changes; the same seed keeps the waves where they are
      if (Math.abs(sea.wind - wind) > 0.05 || Math.abs(sea.heading - heading) > 0.01) {
        wind = sea.wind;
        heading = sea.heading;
        (initial.image.data as Float32Array).set(initialSpectrum(SIZE, PATCH, sea));
        initial.needsUpdate = true;
        amplitude.value = seaState(sea.wind, sea.fetch).hs / 2;
      }
      clock = (clock + dt) % PERIOD;
      time.value = clock;
      renderer.compute(spectrumKernel);
      renderer.compute(rowsKernel);
      renderer.compute(columnsKernel);
      renderer.compute(assembleKernel);
    },
  };
}
