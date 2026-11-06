// The eye's adaptation: a histogram of the frame's light, metered the way a camera's matrix meter does, and an
// exposure that drifts toward it, faster into the light than out of it.
//
// One kernel reads a grid of the frame's luminance; a second, one workgroup, sorts it into a histogram in workgroup
// memory, discards the darkest and brightest ends (the shadow under a hull, the sun's disc and its glitter), averages
// the rest, and moves the exposure toward the key. The exposure lives in a storage buffer the tone mapping reads, so
// nothing comes back to the CPU. The frame drawn uses the exposure metered from the frame before it.
import { Vector2, type ComputeNode, type Node, type Texture } from 'three/webgpu';
import {
  Fn, If, clamp, exp, exp2, float, floor, instanceIndex, instancedArray, int, localId, log2, max, min, mix, smoothstep, texture,
  storage, uniform, vec2, workgroupArray, workgroupBarrier, dot, vec3,
} from 'three/tsl';
import { loop } from './tsl.ts';
import { P } from './uniforms.ts';

const GRID = new Vector2(64, 36);
const BINS = 64;
/** The histogram's range of log2 luminance. */
const LOW = -14;
const HIGH = 8;

/** The exposure state: [0] the multiplier the frame is drawn with, [1] the adapted log2 luminance, [2] the metered. */
export const exposureState = instancedArray(4, 'float');

export const METER = {
  /** The share of the histogram dropped at the dark end and kept up to at the bright end. */
  low: uniform(0.45),
  high: uniform(0.94),
  /** The grey the meter aims the scene's average at. */
  key: uniform(0.16),
  /** Exposure compensation, stops: the colour script darkens nights and brightens fog with it. */
  bias: uniform(0),
  /** The limits of adaptation, as log2 luminance: the eye stops adapting in the deepest night and the brightest noon. */
  minLog: uniform(-9.5),
  maxLog: uniform(2.5),
  /** How fast the eye adapts, per second, into brighter and darker light. */
  up: uniform(2.2),
  down: uniform(1.1),
};

export class Exposure {
  readonly passes: ComputeNode[];
  readonly #source: { value: Texture };

  constructor(source: Texture) {
    const lums = instancedArray(GRID.x * GRID.y, 'vec2');
    const src = texture(source);
    this.#source = src as unknown as { value: Texture };
    const meter = Fn(() => {
      const id = int(instanceIndex);
      const x = id.mod(GRID.x), y = id.div(GRID.x);
      const uv = vec2(float(x).add(0.5), float(y).add(0.5)).div(vec2(GRID.x, GRID.y));
      const o = vec2(0.25).div(vec2(GRID.x, GRID.y));
      const c = src.sample(uv.add(o)).rgb.add(src.sample(uv.sub(o)).rgb)
        .add(src.sample(uv.add(vec2(o.x, o.y.negate()))).rgb).add(src.sample(uv.add(vec2(o.x.negate(), o.y))).rgb).mul(0.25);
      const lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // centre-weighted: what the player looks at counts more than the corners of the sky
      const d = uv.sub(0.5).mul(vec2(1.6, 2));
      const weight = mix(float(0.35), float(1), float(1).sub(smoothstep(0.2, 1.0, d.length())));
      lums.element(instanceIndex).assign(vec2(log2(max(lum, 1e-6)), weight));
    })().compute(GRID.x * GRID.y, [64]);

    const adapt = Fn(() => {
      const hist = workgroupArray('float', BINS) as unknown as { element(i: Node<'int'> | Node<'uint'>): Node<'float'> };
      const bin = int(localId.x);
      const count = float(0).toVar();
      loop('k', GRID.x * GRID.y, (k) => {
        const s = lums.element(k);
        const b = clamp(floor(s.x.sub(LOW).div(HIGH - LOW).mul(BINS)), 0, BINS - 1);
        If(b.equal(float(bin)), () => {
          count.addAssign(s.y);
        });
      });
      hist.element(bin).assign(count);
      workgroupBarrier();
      If(bin.equal(0), () => {
        const total = float(0).toVar();
        loop('b', BINS, (b) => {
          total.addAssign(hist.element(b));
        });
        const lowCut = total.mul(METER.low), highCut = total.mul(METER.high);
        const below = float(0).toVar();
        const sum = float(0).toVar();
        const weight = float(0).toVar();
        loop('b', BINS, (b) => {
          const n = hist.element(b);
          // the part of this bin between the two cuts
          const kept = max(min(below.add(n), highCut).sub(max(below, lowCut)), 0);
          const centre = float(b).add(0.5).div(BINS).mul(HIGH - LOW).add(LOW);
          sum.addAssign(centre.mul(kept));
          weight.addAssign(kept);
          below.addAssign(n);
        });
        const metered = clamp(sum.div(max(weight, 1e-4)), METER.minLog, METER.maxLog);
        const first = exposureState.element(3).lessThan(0.5);
        const current = exposureState.element(1);
        const rate = mix(METER.down, METER.up, float(metered.greaterThan(current)));
        const adapted = mix(current, metered, float(1).sub(exp(rate.negate().mul(min(P.dt, 0.25))))).toVar();
        If(first, () => {
          adapted.assign(metered);
        });
        // darker scenes are kept darker than the key: night should look like night once the eye has adapted to it
        const nightKey = mix(float(0.35), float(1), smoothstep(-8.5, -2.5, adapted));
        exposureState.element(0).assign(METER.key.mul(nightKey).mul(exp2(METER.bias)).div(exp2(adapted)));
        exposureState.element(1).assign(adapted);
        exposureState.element(2).assign(metered);
        exposureState.element(3).assign(1);
      });
    })().compute(BINS, [BINS]);
    this.passes = [meter, adapt];
  }

  /** Points the meter at another texture (the scene pass's after a resize). */
  set source(t: Texture) {
    this.#source.value = t;
  }
}

/** The exposure the frame is drawn with, for the tone mapping: a read-only view of the same buffer (toReadOnly() on
 *  the state itself would make the kernels' writes illegal). */
export const exposure: Node<'float'> = storage(exposureState.value, 'float', 4).toReadOnly().element(0);
