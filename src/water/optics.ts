import {
  dot,
  exp,
  float,
  fwidth,
  length,
  max,
  min,
  mix,
  normalize,
  pow,
  saturate,
  smoothstep,
  sqrt,
  vec3,
} from 'three/tsl';
import { FOAM, SEA_DEEP, SEA_MIDDLE, SEA_SHALLOW } from '../palette.ts';
import type { Sky } from '../sky/sky.ts';
import type { View } from '../view/view.ts';
import { cut, type FloatNode, type Vec3Node, type Vec4Node } from '../tsl.ts';

const ABSORPTION = [0.45, 0.068, 0.025];
export const N_WATER = 1.34;
const F0 = 0.02;
const MIRROR = 0.45;
const BLURRED = 0.55;
const SHALLOW_TO = 0,
  MIDDLE_AT = 4,
  DEEP_AT = 14;
const CLOUDY = 0.22;
const AIRED = 0.6,
  AIR_VEIL = 2;
const TROUGH = 0.88,
  TROUGH_AT = 0.4;
const GLINT = 0.9985,
  GLINT_EDGE = 0.0006,
  GLINT_LIGHT = 0.5;

const absorption = vec3(...ABSORPTION);

const fresnel = (cos: FloatNode): FloatNode =>
  float(F0).add(pow(float(1).sub(saturate(cos)), 5).mul(1 - F0));

export function createOptics(sky: Sky, view: View) {
  const wet = (p: Vec3Node): FloatNode =>
    smoothstep(0.03, -0.03, view.altitude(p));

  const sunBelow = (p: Vec3Node): Vec3Node => {
    const depth = max(view.altitude(p).negate(), 0);
    const ly = dot(view.up(p), sky.sun(p));
    const cos = sqrt(
      float(1).sub(
        float(1)
          .sub(ly.mul(ly))
          .div(N_WATER * N_WATER)
      )
    );
    const through = exp(absorption.mul(depth.div(cos)).negate()).mul(
      float(1).sub(fresnel(max(ly, 0)))
    );
    return mix(vec3(1), through, wet(p));
  };

  const skyBelow = (p: Vec3Node): Vec3Node => {
    const through = exp(
      absorption.mul(max(view.altitude(p).negate(), 0).mul(1.2)).negate()
    ).mul(1 - 0.066);
    return mix(vec3(1), through, wet(p));
  };

  return {
    sunBelow,
    skyBelow,
    seaRadiance: (s: Surface, ships: Ships, held?: Held): Vec3Node =>
      seaRadiance(sky, view, s, ships, held),
  };
}

interface Surface {
  p: Vec3Node;
  v: Vec3Node;
  n: Vec3Node;
  alpha: FloatNode;
  crest: FloatNode;
  foam: FloatNode;
  behind: Vec3Node;
  path: FloatNode;
  depth: FloatNode;
}

interface Ships {
  lit: FloatNode;
  glow: FloatNode;
  air: FloatNode;
}

interface Held {
  dye: Vec4Node;
  ink: Vec4Node;
  far: FloatNode;
}

const TINT_CHROMA = 1.5,
  TINT_RICH = 0.3,
  FAR_RICH = 0.9;
const TINT_LIGHT = 0.6,
  MIDDLE = 0.55;
const oklab = (c: Vec3Node): Vec3Node => {
  const l = pow(
    max(dot(c, vec3(0.4122214708, 0.5363325363, 0.0514459929)), 0),
    1 / 3
  );
  const m = pow(
    max(dot(c, vec3(0.2119034982, 0.6806995451, 0.1073969566)), 0),
    1 / 3
  );
  const s = pow(
    max(dot(c, vec3(0.0883024619, 0.2817188376, 0.6299787005)), 0),
    1 / 3
  );
  const lms = vec3(l, m, s);
  return vec3(
    dot(lms, vec3(0.2104542553, 0.793617785, -0.0040720468)),
    dot(lms, vec3(1.9779984951, -2.428592205, 0.4505937099)),
    dot(lms, vec3(0.0259040371, 0.7827717662, -0.808675766))
  );
};
const linear = (lab: Vec3Node): Vec3Node => {
  const l = pow(dot(lab, vec3(1, 0.3963377774, 0.2158037573)), 3);
  const m = pow(dot(lab, vec3(1, -0.1055613458, -0.0638541728)), 3);
  const s = pow(dot(lab, vec3(1, -0.0894841775, -1.291485548)), 3);
  const lms = vec3(l, m, s);
  return max(
    vec3(
      dot(lms, vec3(4.0767416621, -3.3077115913, 0.2309699292)),
      dot(lms, vec3(-1.2684380046, 2.6097574011, -0.3413193965)),
      dot(lms, vec3(-0.0041960863, -0.7034186147, 1.707614701))
    ),
    0
  );
};
function tinted(
  c: Vec3Node,
  colour: Vec3Node,
  a: FloatNode,
  far: FloatNode
): Vec3Node {
  const lab = oklab(c),
    hers = oklab(colour),
    chroma = length(hers.yz),
    ratio = chroma.div(max(hers.x, 1e-3));
  const light = lab.x.mul(mix(float(1), hers.x.div(MIDDLE), a.mul(TINT_LIGHT)));
  const strength = mix(
    length(lab.yz).mul(min(ratio.div(TINT_RICH), 1).mul(TINT_CHROMA)),
    light.mul(ratio).mul(FAR_RICH),
    far
  );
  const keep = float(1).sub(a);
  const kept = lab.yz.mul(keep.mul(keep).mul(mix(float(1), keep, far)));
  return linear(
    vec3(light, kept.add(hers.yz.div(max(chroma, 1e-4)).mul(strength.mul(a))))
  );
}

function whiteSurface(
  sky: Sky,
  p: Vec3Node,
  up: Vec3Node,
  illuminance: Vec3Node
): Vec3Node {
  return illuminance
    .mul(max(dot(sky.sun(p), up), 0))
    .div(Math.PI)
    .add(sky.ambient(p, up));
}

function seaRadiance(
  sky: Sky,
  view: View,
  s: Surface,
  ships: Ships,
  held?: Held
): Vec3Node {
  const { p, v, n, alpha, crest, foam, behind, path, depth } = s;
  const l = sky.sun(p),
    up = view.up(p);
  const nv = max(n.dot(v), 1e-4);
  const F = fresnel(nv).mul(MIRROR);
  const sun = sky.sunIlluminance(p).mul(sky.cloudShadow(p)).mul(ships.lit);

  const irradiance = whiteSurface(sky, p, up, sun);
  const middle = mix(
    vec3(...SEA_SHALLOW),
    vec3(...SEA_MIDDLE),
    smoothstep(SHALLOW_TO, MIDDLE_AT, depth)
  );
  const own = mix(
    middle,
    vec3(...SEA_DEEP),
    smoothstep(MIDDLE_AT, DEEP_AT, depth)
  );
  const tone = mix(own, vec3(...SEA_SHALLOW), ships.air.mul(AIRED)).mul(
    mix(float(TROUGH), float(1), cut(crest, TROUGH_AT))
  );
  const body = tone.mul(irradiance).mul(ships.glow);

  const r = v.negate().reflect(n);
  const below = dot(r, up);
  const above = sky.reflect(
    normalize(r.sub(up.mul(min(below, 0)))),
    max(sqrt(alpha), BLURRED)
  );
  const seen = mix(body, above, fresnel(below.negate()));
  const nh = n.dot(normalize(l.add(v)));
  const edge = max(fwidth(nh), GLINT_EDGE);
  const glint = vec3(...FOAM)
    .mul(sun)
    .mul(
      smoothstep(float(GLINT).sub(edge), float(GLINT).add(edge), nh).mul(
        GLINT_LIGHT
      )
    );

  const veil = float(1).sub(
    exp(path.mul(-CLOUDY).sub(ships.air.mul(AIR_VEIL)))
  );
  const through = behind
    .mul(exp(absorption.mul(path).negate()))
    .div(N_WATER * N_WATER);
  const under = mix(through, body, veil);
  let water = seen.mul(F).add(under.mul(float(1).sub(F)));
  if (held)
    water = tinted(water, held.dye.xyz, held.dye.w, held.far)
      .mul(float(1).sub(held.ink.w))
      .add(held.ink.xyz.mul(irradiance));
  return mix(water.add(glint), vec3(...FOAM).mul(irradiance), foam);
}
