import {
  abs,
  clamp,
  exp,
  float,
  length,
  luminance,
  max,
  min,
  mix,
  mod,
  pow,
  screenUV,
  select,
  smoothstep,
  step,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { DAWN_MIST, STORM_SLATE, type Rgb } from '../palette.ts';
import type { FloatNode, Vec3Node } from '../tsl.ts';
import * as scalar from '../../world/scalar.ts';

interface Look {
  exposure: number;
  temp: number;
  tint: number;
  contrast: number;
  saturation: number;
  warm: number;
  sea: number;
  sky: number;
  fade: number;
  fadeTo: Rgb;
  vignette: number;
}

const DAY: readonly (readonly [number, Look])[] = [
  [
    0.17,
    {
      exposure: 0,
      temp: 0.2,
      tint: 0.02,
      contrast: 1,
      saturation: 1,
      warm: 1.05,
      sea: 1,
      sky: 1,
      fade: 0,
      fadeTo: [0, 0, 0],
      vignette: 0.2,
    },
  ],
  [
    0.47,
    {
      exposure: 0,
      temp: 0.04,
      tint: 0,
      contrast: 1,
      saturation: 1,
      warm: 1,
      sea: 1,
      sky: 1,
      fade: 0,
      fadeTo: [0, 0, 0],
      vignette: 0.14,
    },
  ],
  [
    0.97,
    {
      exposure: 0,
      temp: 0,
      tint: 0,
      contrast: 1,
      saturation: 1,
      warm: 1,
      sea: 1,
      sky: 1,
      fade: 0,
      fadeTo: [0, 0, 0],
      vignette: 0.1,
    },
  ],
];
const DAWN: Look = {
  exposure: 0,
  temp: -0.02,
  tint: -0.06,
  contrast: 1,
  saturation: 1,
  warm: 1.05,
  sea: 1,
  sky: 1,
  fade: 0.02,
  fadeTo: DAWN_MIST,
  vignette: 0.16,
};
const STORM: Look = {
  exposure: 0.8,
  temp: -0.15,
  tint: -0.1,
  contrast: 1,
  saturation: 0.92,
  warm: 1,
  sea: 0.9,
  sky: 0.95,
  fade: 0.03,
  fadeTo: STORM_SLATE,
  vignette: 0.32,
};

type Amount = Exclude<keyof Look, 'fadeTo'>;
const amounts = <T>(each: (k: Amount) => T): { [K in Amount]: T } => ({
  exposure: each('exposure'),
  temp: each('temp'),
  tint: each('tint'),
  contrast: each('contrast'),
  saturation: each('saturation'),
  warm: each('warm'),
  sea: each('sea'),
  sky: each('sky'),
  fade: each('fade'),
  vignette: each('vignette'),
});

function between(a: Look, b: Look, t: number): Look {
  const [u, v] = [a.fadeTo, b.fadeTo];
  const fadeTo: Rgb = [
    scalar.lerp(u[0], v[0], t),
    scalar.lerp(u[1], v[1], t),
    scalar.lerp(u[2], v[2], t),
  ];
  return { ...amounts((k) => scalar.lerp(a[k], b[k], t)), fadeTo };
}

function dayLook(rise: number, rising = false): Look {
  let i = 0;
  while (i < DAY.length - 2 && rise > DAY[i + 1][0]) i++;
  const [e0, a] = DAY[i],
    [e1, b] = DAY[i + 1];
  const day = between(a, b, scalar.smoothstep(e0, e1, rise));
  return rising
    ? between(day, DAWN, 1 - scalar.smoothstep(DAY[0][0], DAY[1][0], rise))
    : day;
}

const KNEE = 0.85;
const BURNT = 6,
  WHITENED = 0.7;
const curve = (light: Vec3Node): Vec3Node => {
  const c = max(light, vec3(0)),
    top = max(max(c.x, c.y), max(c.z, 1e-6));
  const rolled = float(1)
    .sub(exp(top.sub(KNEE).div(KNEE - 1)))
    .mul(1 - KNEE)
    .add(KNEE);
  const held = c.mul(select(top.greaterThan(KNEE), rolled.div(top), float(1)));
  return clamp(
    mix(held, vec3(1), smoothstep(1, BURNT, top).mul(WHITENED)),
    0,
    1
  );
};
export const encode = (c: Vec3Node): Vec3Node =>
  mix(
    c.mul(12.92),
    pow(max(c, vec3(0)), vec3(1 / 2.4))
      .mul(1.055)
      .sub(0.055),
    step(vec3(0.0031308), c)
  );

type Mixed = { [K in Amount]: FloatNode } & { fadeTo: Vec3Node };
function mixed(a: Look, b: Look, t: FloatNode): Mixed {
  return {
    ...amounts((k) => mix(float(a[k]), float(b[k]), t)),
    fadeTo: mix(vec3(...a.fadeTo), vec3(...b.fadeTo), t),
  };
}

function looked(l: Mixed, color: Vec3Node): Vec3Node {
  const balance = vec3(
    float(1).add(l.temp.mul(0.09)).sub(l.tint.mul(0.02)),
    float(1).add(l.tint.mul(0.05)),
    float(1).sub(l.temp.mul(0.09)).sub(l.tint.mul(0.02))
  );
  const c = pow(
    max(color.mul(balance), vec3(1e-6)).div(0.18),
    vec3(l.contrast)
  ).mul(0.18);
  const mx = max(max(c.x, c.y), c.z),
    chroma = max(mx.sub(min(min(c.x, c.y), c.z)), 1e-6);
  const hue = select(
    mx.equal(c.x),
    mod(c.y.sub(c.z).div(chroma).add(6), 6),
    select(
      mx.equal(c.y),
      c.z.sub(c.x).div(chroma).add(2),
      c.x.sub(c.y).div(chroma).add(4)
    )
  ).mul(60);
  const band = (center: number, width: number) =>
    max(
      float(1).sub(abs(mod(hue.sub(center - 540), 360).sub(180)).div(width)),
      0
    );
  const s = l.saturation.mul(
    float(1)
      .add(l.warm.sub(1).mul(band(35, 50)))
      .add(l.sea.sub(1).mul(band(175, 45)))
      .add(l.sky.sub(1).mul(band(220, 40)))
  );
  const saturated = mix(vec3(luminance(c)), c, s);
  return max(mix(saturated, l.fadeTo, l.fade), vec3(0));
}

export function createGrade(rise: number, rising: boolean, open: Vec3Node) {
  const day = dayLook(rise, rising);
  const vignette = uniform(day.vignette);
  const gain = float(2 ** day.exposure).div(max(luminance(open), 1e-4));
  const grade = (color: Vec3Node, storm: FloatNode): Vec3Node => {
    const v = length(screenUV.sub(0.5).mul(vec2(1.4, 1.1)));
    const corner = float(1).sub(
      smoothstep(0.15, 0.8, v).mul(mix(vignette, STORM.vignette, storm))
    );
    const toned = curve(
      color
        .mul(corner)
        .mul(gain)
        .mul(mix(float(1), float(2 ** (STORM.exposure - day.exposure)), storm))
    );
    return looked(mixed(day, STORM, storm), toned);
  };
  return { grade, gain };
}
