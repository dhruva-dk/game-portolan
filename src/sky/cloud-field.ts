import { Vector3 } from 'three/webgpu';
import {
  Break,
  If,
  ceil,
  clamp,
  dot,
  exp,
  float,
  int,
  length,
  luminance,
  max,
  min,
  mix,
  normalize,
  pow,
  select,
  smoothstep,
  sqrt,
  texture,
  texture3D,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import {
  BOTTOM,
  MIE_EXTINCTION,
  MIE_SCALE_HEIGHT,
  RAYLEIGH_SCALE_HEIGHT,
} from './atmosphere.ts';
import { CLOUD } from '../palette.ts';
import {
  POTENTIAL_DECILES,
  WEATHER_TILE,
  type CloudNoise,
} from './cloud-noise.ts';
import {
  henyeyGreenstein,
  loop,
  ramp,
  type FloatNode,
  type Vec3Node,
  type Vec4Node,
} from '../tsl.ts';
import { RAYLEIGH, type Tables } from './tables.ts';
import * as scalar from '../world/scalar.ts';

const fall = (a: number, b: number, x: FloatNode): FloatNode =>
  float(1).sub(smoothstep(a, b, x));

export const BASE = 1.2,
  TOP = 2.0;
const SHAPE_SCALE = 1.0,
  DETAIL_SCALE = 0.4;
export const SIGMA = 60;
const FULL = 0.35;
const MASS = 3;
const FIELD_SHIFT = 0.3;
const LAYER = 0.3;
const DOME = 0.6;
const LIFT = 0.15,
  MARGIN = 0.3;
const BASE_FADE = 0.1;
const BILLOW = 0.25;
const EROSION = 0.55;
const MAX_DISTANCE = 120;
const DETAIL_DISTANCE = 25;
const STEP = 0.06;
export const DIFFUSION = 0.75 * (1 - 0.85);
const TAPS = [0.05, 0.15, 0.35, 0.8];
const WARMED = 0.5,
  UNDERLIT = 0.7;

const phase = (c: FloatNode, k: number): FloatNode =>
  mix(henyeyGreenstein(c, -0.3 * k), henyeyGreenstein(c, 0.8 * k), 0.7);

export type CloudField = ReturnType<typeof createCloudField>;

function cloudThreshold(k: number): { threshold: number; fieldShift: number } {
  const x = scalar.clamp(1 - k) * 10;
  const i = Math.min(Math.floor(x), 9);
  const D = POTENTIAL_DECILES;
  const layer = LAYER * scalar.smoothstep(0.6, 1, k);
  return {
    threshold: D[i] + (x - i) * (D[i + 1] - D[i]) - layer,
    fieldShift: FIELD_SHIFT * 4 * k * (1 - k),
  };
}

export function createCloudField(tables: Tables, noise: CloudNoise) {
  const { haze, skyAmbientUp, skyRadiance, sunTransmittance } = tables;
  const threshold = uniform(0.4);
  const fieldShift = uniform(0);
  const coverage = {
    set(k: number) {
      const c = cloudThreshold(k);
      threshold.value = c.threshold;
      fieldShift.value = c.fieldShift;
    },
  };
  const drift = uniform(new Vector3());
  const sunDir = uniform(new Vector3(0, 1, 0));
  const eye = uniform(new Vector3());

  const locate = (q: Vec3Node) => {
    const altitude = length(vec3(q.x, q.y.add(eye.y).add(BOTTOM), q.z)).sub(
      BOTTOM
    );
    return {
      p: vec3(eye.x, 0, eye.z).add(q).sub(drift),
      h: clamp(altitude.sub(BASE).div(TOP - BASE), 0, 1),
    };
  };

  const coarse = (q: Vec3Node) => {
    const { p, h } = locate(q);
    const w = texture(noise.weather)
      .sample(p.xz.div(WEATHER_TILE * MASS))
      .level(float(0));
    const shift = w.g.sub(0.5).mul(fieldShift).sub(threshold);
    const inside = w.r.add(shift).mul(MASS);
    const z = h.mul(TOP - BASE);
    const top = min(pow(max(inside, 0), 0.75).mul(DOME), TOP - BASE);
    const bottom = min(fall(0, MARGIN, inside).mul(LIFT), top.mul(0.5));
    const reach = clamp(
      min(min(top.sub(z), z.sub(bottom).mul(2)), inside).div(BILLOW),
      0,
      1
    );
    const dense = float(0).toVar();
    If(reach.greaterThan(0), () => {
      const n = texture3D(noise.shape, p.div(SHAPE_SCALE)).level(float(0));
      const floorNoise = n.g.mul(0.625).add(n.b.mul(0.25)).add(n.a.mul(0.125));
      const billows = ramp(n.r, floorNoise.sub(1), 1);
      dense.assign(
        ramp(billows, float(1).sub(reach), 1).mul(
          smoothstep(0, BASE_FADE / (TOP - BASE), h)
        )
      );
    });
    return { dense, h, top: top.div(TOP - BASE), inside };
  };

  const erode = (dense: FloatNode, q: Vec3Node, h: FloatNode): FloatNode => {
    const { p } = locate(q);
    const d = texture3D(noise.detail, p.div(DETAIL_SCALE)).level(float(0));
    const df = d.r.mul(0.625).add(d.g.mul(0.25)).add(d.b.mul(0.125));
    const e = mix(df, float(1).sub(df), clamp(h.mul(4), 0, 1));
    return ramp(dense, e.mul(EROSION), 1);
  };

  const density = (q: Vec3Node): FloatNode => {
    const c = coarse(q);
    return select(
      c.dense.greaterThan(0),
      clamp(erode(c.dense, q, c.h).div(FULL), 0, 1),
      float(0)
    );
  };

  const toAltitude = (d: Vec3Node, a: number): FloatNode => {
    const r0 = float(BOTTOM).add(eye.y);
    const b = r0.mul(d.y);
    const c = eye.y.sub(a).mul(r0.add(BOTTOM + a));
    const s = sqrt(max(b.mul(b).sub(c), 0));
    return select(
      b.greaterThan(0),
      c.negate().div(b.add(s)),
      b.negate().add(s)
    );
  };

  const airTransmittance = (d: Vec3Node, dist: FloatNode): Vec3Node => {
    const z = max(
      eye.y.add(d.y.mul(dist)).add(dist.mul(dist).div(2 * BOTTOM)),
      0.01
    );
    const mean = (H: number) =>
      float(H)
        .mul(float(1).sub(exp(z.negate().div(H))))
        .div(z);
    const ext = RAYLEIGH.mul(mean(RAYLEIGH_SCALE_HEIGHT)).add(
      haze.mul(MIE_EXTINCTION).mul(mean(MIE_SCALE_HEIGHT))
    );
    return exp(ext.mul(dist).negate());
  };

  const march = (
    d: Vec3Node,
    maxSteps: number,
    jitter: FloatNode,
    distance: FloatNode,
    detail: boolean
  ): Vec4Node => {
    const L = vec3(0).toVar(),
      T = float(1).toVar();
    const near = toAltitude(d, BASE).toVar(),
      far = min(toAltitude(d, TOP), MAX_DISTANCE).toVar();
    const span = max(far.sub(near), 0);
    const steps = int(clamp(ceil(span.div(STEP)), 8, maxSteps)).toVar();
    const dt = span.div(float(steps)).toVar();
    const cosSun = dot(d, sunDir);
    const single = phase(cosSun, 1).toVar();
    const weightSum = float(0).toVar(),
      distSum = float(0).toVar();
    const open = sunTransmittance(float(BOTTOM), sunDir.y)
      .mul(max(sunDir.y, 0))
      .mul(1 / Math.PI)
      .add(skyAmbientUp);
    const under = vec3(luminance(open))
      .mul(vec3(...CLOUD.shadow))
      .mul(UNDERLIT)
      .toVar();
    If(d.y.greaterThan(-0.002).and(near.lessThan(MAX_DISTANCE)), () => {
      loop('cs', steps, (i) => {
        const t = near.add(float(i).add(jitter).mul(dt));
        const q = d.mul(t);
        const c = coarse(q);
        If(c.dense.greaterThan(0.001), () => {
          const rho = c.dense.toVar();
          if (detail)
            If(t.lessThan(DETAIL_DISTANCE), () => {
              rho.assign(erode(c.dense, q, c.h));
            });
          rho.assign(clamp(rho.div(FULL), 0, 1));
          If(rho.greaterThan(0.001), () => {
            const q1 = q.add(sunDir.mul(TAPS[0]));
            const c1 = coarse(q1);
            const first = c1.dense.toVar();
            if (detail)
              If(t.lessThan(DETAIL_DISTANCE).and(first.greaterThan(0)), () => {
                first.assign(erode(c1.dense, q1, c1.h));
              });
            let tau: FloatNode = clamp(first.div(FULL), 0, 1).mul(
              SIGMA * TAPS[0]
            );
            for (let k = 1; k < TAPS.length; k++) {
              tau = tau.add(
                clamp(
                  coarse(q.add(sunDir.mul(TAPS[k]))).dense.div(FULL),
                  0,
                  1
                ).mul(SIGMA * (TAPS[k] - TAPS[k - 1]))
              );
            }
            let ms: FloatNode = float(0);
            for (let k = 1; k < 4; k++) {
              const a = 0.6 ** k;
              ms = ms.add(exp(tau.mul(-a)).mul(phase(cosSun, a)).mul(a));
            }
            ms = max(ms, float(1 / Math.PI).div(tau.mul(DIFFUSION).add(1)));
            const powder = float(1).sub(
              exp(rho.mul(-SIGMA * 0.08)).mul(float(0.25).sub(cosSun.mul(0.25)))
            );
            const radius = length(vec3(q.x, q.y.add(eye.y).add(BOTTOM), q.z));
            const sunLight = sunTransmittance(
              radius,
              dot(normalize(vec3(q.x, q.y.add(eye.y).add(BOTTOM), q.z)), sunDir)
            );
            const above = min(
              float(TOP - BASE).mul(max(c.top.sub(c.h), 0)),
              max(c.inside, 0)
            )
              .mul(rho)
              .mul(SIGMA * DIFFUSION)
              .add(1);
            const below = float(TOP - BASE)
              .mul(c.h)
              .mul(rho)
              .mul(SIGMA * DIFFUSION)
              .add(1);
            const sunTone = mix(
              vec3(luminance(sunLight)),
              sunLight,
              WARMED
            ).mul(vec3(...CLOUD.lit));
            const S = sunTone
              .mul(exp(tau.negate()).mul(single).add(ms.mul(powder)))
              .add(under.mul(float(0.5).div(above).add(float(0.5).div(below))));
            const stepT = exp(rho.mul(-SIGMA).mul(dt));
            const absorbed = T.mul(float(1).sub(stepT));
            L.addAssign(S.mul(absorbed));
            distSum.addAssign(t.mul(absorbed));
            weightSum.addAssign(absorbed);
            T.mulAssign(stepT);
            If(T.lessThan(0.01), () => {
              L.divAssign(float(1).sub(T));
              T.assign(0);
              Break();
            });
          });
        });
      });
    });
    distance.assign(
      select(
        weightSum.greaterThan(1e-4),
        distSum.div(max(weightSum, 1e-4)),
        float(MAX_DISTANCE)
      )
    );
    const Tair = airTransmittance(d, distance);
    const glow = skyRadiance(normalize(vec3(d.x, max(d.y, 0), d.z)), sunDir);
    const seen = L.mul(Tair).add(
      glow.mul(float(1).sub(T)).mul(float(1).sub(Tair))
    );
    const fade = fall(MAX_DISTANCE * 0.8, MAX_DISTANCE, distance);
    return vec4(seen.mul(fade), mix(float(1), T, fade));
  };

  return {
    inputs: { coverage, drift, sunDir, eye },
    density,
    toAltitude,
    march,
    along: (d: Vec3Node, steps: number): Vec4Node =>
      march(d, steps, float(0.5), float(0).toVar(), false),
  };
}
