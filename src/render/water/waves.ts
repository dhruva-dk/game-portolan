import {
  DataTexture,
  FloatType,
  LinearMipmapLinearFilter,
  RGBAFormat,
  RepeatWrapping,
  Vector2,
  type StorageTexture,
} from 'three/webgpu';
import {
  Fn,
  cos,
  float,
  floor,
  instanceIndex,
  instancedArray,
  length,
  localId,
  max,
  select,
  sin,
  smoothstep,
  sqrt,
  textureLoad,
  textureStore,
  uint,
  uniform,
  uniformArray,
  uvec2,
  vec2,
  vec4,
  workgroupBarrier,
  workgroupId,
} from 'three/tsl';
import { storageTable, type Compute } from '../gpu.ts';
import { BANDS, CASCADES, CHOP, PERIOD, SIZE } from '../../world/cascades.ts';
import { clamp } from '../../world/scalar.ts';
import {
  G,
  coxMunk,
  initialSpectrum,
  meanSquareSlope,
  normalQuantile,
  seaState,
  whitecaps,
  type Sea,
} from '../../world/spectrum.ts';
import {
  workgroupArrayOf,
  type FloatNode,
  type UintNode,
  type Vec2Node,
  type Vec4Node,
} from '../tsl.ts';

export const CURVED = [1, 2];
export const FOAMING = 2;
const RIPPLE_FLOOR = 4e-4;

const HALF = SIZE / 2;
const AREA = SIZE * SIZE;
const COUNT = CASCADES.length;
const widths = uniformArray<'float'>(CASCADES, 'float');

const surface = (): StorageTexture =>
  storageTable(SIZE, SIZE, {
    min: LinearMipmapLinearFilter,
    wrap: RepeatWrapping,
    mipmaps: true,
    anisotropy: 4,
  });

const twice = (a: Vec4Node, w: Vec2Node): Vec4Node =>
  vec4(
    a.x.mul(w.x).sub(a.y.mul(w.y)),
    a.x.mul(w.y).add(a.y.mul(w.x)),
    a.z.mul(w.x).sub(a.w.mul(w.y)),
    a.z.mul(w.y).add(a.w.mul(w.x))
  );

export type Waves = ReturnType<typeof createWaves>;

export function createWaves() {
  const spectra = new Float32Array(AREA * COUNT * 4);
  const initial = new DataTexture(
    spectra,
    SIZE,
    SIZE * COUNT,
    RGBAFormat,
    FloatType
  );
  const time = uniform(0);
  const amplitude = uniform(1);
  const ripples = uniform(0.01);
  const steepness = uniform(0.1);
  const fieldsA = instancedArray(AREA * COUNT, 'vec4');
  const fieldsB = instancedArray(AREA * COUNT, 'vec4');
  const foam = instancedArray(AREA * FOAMING, 'float');
  const fade = uniform(0.95);
  const breaking = Array.from({ length: FOAMING }, () =>
    uniform(new Vector2(0, 0.01))
  );
  const displacement = CASCADES.map(surface);
  const slopes = CASCADES.map(surface);

  const spectrumKernel = Fn(() => {
    const c = instanceIndex.div(AREA),
      i = instanceIndex.mod(AREA);
    const x = i.mod(SIZE),
      y = i.div(SIZE);
    const width = widths.element(c);
    const h0 = textureLoad(initial, uvec2(x, y.add(c.mul(SIZE))));
    const k = vec2(float(x).sub(HALF), float(y).sub(HALF)).mul(
      float(2 * Math.PI).div(width)
    );
    const kl = length(k);
    const step = (2 * Math.PI) / PERIOD;
    const w = floor(sqrt(kl.mul(G)).div(step)).mul(step);
    const cw = cos(w.mul(time)),
      sw = sin(w.mul(time));
    const h = vec2(
      h0.x.mul(cw).add(h0.y.mul(sw)).add(h0.z.mul(cw)).sub(h0.w.mul(sw)),
      h0.y.mul(cw).sub(h0.x.mul(sw)).add(h0.z.mul(sw)).add(h0.w.mul(cw))
    ).toVar();
    const some = kl.greaterThan(1e-6);
    const unit = select(some, k.div(kl), vec2(0));
    const inverse = select(some, float(1).div(kl), float(0));
    const ih = vec2(h.y.negate(), h.x);
    const dx = ih.mul(unit.x),
      dz = ih.mul(unit.y);
    const sx = ih.mul(k.x),
      sz = ih.mul(k.y);
    const jxx = h.mul(k.x.mul(k.x).mul(inverse).negate());
    const jzz = h.mul(k.y.mul(k.y).mul(inverse).negate());
    const jxz = h.mul(k.x.mul(k.y).mul(inverse).negate());
    const pack = (a: Vec2Node, b: Vec2Node) => vec2(a.x.sub(b.y), a.y.add(b.x));
    fieldsA.element(instanceIndex).assign(vec4(pack(h, dx), pack(dz, sx)));
    fieldsB.element(instanceIndex).assign(vec4(pack(sz, jxx), pack(jzz, jxz)));
  })().compute(AREA * COUNT, [64]);

  const fft = (rows: boolean) =>
    Fn(() => {
      const line = workgroupId.x,
        i = localId.x;
      const at = (j: UintNode) =>
        rows
          ? line.mul(SIZE).add(j)
          : line.div(SIZE).mul(AREA).add(j.mul(SIZE)).add(line.mod(SIZE));
      const a = workgroupArrayOf('vec4', SIZE),
        b = workgroupArrayOf('vec4', SIZE);
      a.element(i).assign(fieldsA.element(at(i)));
      a.element(i.add(HALF)).assign(fieldsA.element(at(i.add(HALF))));
      b.element(i).assign(fieldsB.element(at(i)));
      b.element(i.add(HALF)).assign(fieldsB.element(at(i.add(HALF))));
      workgroupBarrier();
      for (let p = 1; p < SIZE; p *= 2) {
        const k = i.bitAnd(uint(p - 1));
        const angle = float(k).mul(Math.PI / p);
        const w = vec2(cos(angle), sin(angle));
        const a0 = a.element(i).toVar(),
          a1 = twice(a.element(i.add(HALF)), w).toVar();
        const b0 = b.element(i).toVar(),
          b1 = twice(b.element(i.add(HALF)), w).toVar();
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
  const rowsKernel = fft(true),
    columnsKernel = fft(false);

  const assembleKernels = CASCADES.map((_, c) =>
    Fn(() => {
      const x = instanceIndex.mod(SIZE),
        y = instanceIndex.div(SIZE);
      const at = instanceIndex.add(c * AREA);
      const sign = float(1).sub(float(x.add(y).bitAnd(uint(1))).mul(2));
      const a = fieldsA.element(at).mul(sign),
        b = fieldsB.element(at).mul(sign);
      let froth: FloatNode = float(0);
      if (c < FOAMING) {
        const jacobian = float(1)
          .add(b.y.mul(CHOP))
          .mul(float(1).add(b.z.mul(CHOP)))
          .sub(b.w.mul(b.w).mul(CHOP * CHOP));
        const kept = foam.element(instanceIndex.add(c * AREA));
        const at = breaking[c];
        froth = max(
          kept.mul(fade),
          smoothstep(at.x, at.x.sub(at.y), jacobian)
        ).toVar();
        kept.assign(froth);
      }
      textureStore(
        displacement[c],
        uvec2(x, y),
        vec4(a.y.mul(CHOP), a.x, a.z.mul(CHOP), froth)
      );
      textureStore(
        slopes[c],
        uvec2(x, y),
        vec4(a.w, b.x, a.w.mul(a.w), b.x.mul(b.x))
      );
    })().compute(AREA, [64])
  );

  const curvature = CURVED.map(surface);
  const curvatureKernels = CURVED.map((c, i) =>
    Fn(() => {
      const x = instanceIndex.mod(SIZE),
        y = instanceIndex.div(SIZE);
      const h = (dx: number, dy: number) => {
        const xx = x.add(SIZE + dx).mod(SIZE),
          yy = y.add(SIZE + dy).mod(SIZE);
        const k = yy
          .mul(SIZE)
          .add(xx)
          .add(c * AREA);
        const sign = float(1).sub(float(xx.add(yy).bitAnd(uint(1))).mul(2));
        return fieldsA.element(k).x.mul(sign);
      };
      const e2 = (CASCADES[c] / SIZE) ** 2,
        h0 = h(0, 0).mul(2);
      const hxx = h(1, 0).add(h(-1, 0)).sub(h0).div(e2),
        hzz = h(0, 1).add(h(0, -1)).sub(h0).div(e2);
      const hxz = h(1, 1)
        .sub(h(1, -1))
        .sub(h(-1, 1))
        .add(h(-1, -1))
        .div(4 * e2);
      textureStore(curvature[i], uvec2(x, y), vec4(hxx, hzz, hxz, 0));
    })().compute(AREA, [64])
  );
  const passes: Compute[] = [
    spectrumKernel,
    rowsKernel,
    columnsKernel,
    ...assembleKernels,
    ...curvatureKernels,
  ];

  let wind = -1,
    gusting = -1,
    held = 0;
  const spreads = CASCADES.map(() => 0);

  return {
    displacement,
    slopes,
    curvature,
    amplitude,
    ripples,
    steepness,
    update(sea: Sea, now: number, clock: number, dt: number): Compute[] {
      if (Math.abs(sea.wind - wind) > 0.05) {
        wind = sea.wind;
        const data = spectra;
        held = 0;
        CASCADES.forEach((L, c) => {
          data.set(
            initialSpectrum(SIZE, L, sea, c + 1, BANDS[c]),
            c * AREA * 4
          );
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
        for (let c = 0; c < FOAMING; c++) {
          breaking[c].value.set(
            1 +
              normalQuantile(Math.max(whitecaps(now) / FOAMING, 1e-6)) *
                spreads[c],
            spreads[c]
          );
        }
        ripples.value = Math.max(coxMunk(now) - held, RIPPLE_FLOOR);
      }
      fade.value = Math.exp(-dt / (1 + 4 * clamp((now - 5) / 15)));
      time.value = clock % PERIOD;
      return passes;
    },
  };
}
