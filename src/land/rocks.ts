// The islands' rocks (scatter.ts says where): big masses heaped into outcrops and the boulders round them. A handful
// of shapes of each (rock-shape.ts), each drawn once for all its rocks on the islands in view (site.ts).
//
// Textured by projecting ambientCG Rock030 along the world's three axes and blending by the surface's facing (no
// seams, no UVs to unwrap: any three axes do, so the world's serve), scaled to a warm red-brown, paler on the tops
// the sun and rain bleach, dark in the cracks and under the ledges; darker where wet, filmed with algae below the
// waterline; lit like everything else (sky/light.ts).
//
// Triangles: 20 × (detail + 1)² a shape: 2880 for a mass, 500 for a boulder.

import {
  Euler, Matrix4, MeshBasicNodeMaterial, NoColorSpace, Quaternion, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector3,
} from 'three/webgpu';
import { Fn, abs, attribute, dot, float, mix, normalWorld, normalize, positionWorld, smoothstep, texture, vec3 } from 'three/tsl';
import type { View } from '../view/view';
import type { Rock } from '../world/scatter';
import type { Chart } from '../world/sphere';
import type { Light } from '../sky/light';
import { rockShape } from './rock-shape';
import { createInstances, standing, type Placed } from './site';

type N = any;

/** How many shapes of each kind, and how finely each is made. */
export const KINDS = { big: { shapes: 4, detail: 11 }, boulder: { shapes: 4, detail: 4 } };
/** The texture repeats every this many metres. */
const ROCK_TILE = 2.5;
/** Its mean colour, linear (measured), and the weathered rock's mean albedo it is scaled to: a warm red-brown. */
const ROCK_MEAN = [0.084, 0.079, 0.066];
const ROCK_ALBEDO = [0.2, 0.105, 0.06];
/** The bleached tops' albedo. */
const BLEACHED = [0.3, 0.2, 0.13];
/** Deep in a crack or under a ledge, the share of the albedo left: it stands for the light that doesn't reach in. */
const CAVITY = 0.3;
/** Wet rock reflects about half as much; below the waterline it is filmed with algae. */
const WET = 0.5;
const ALGAE = [0.06, 0.07, 0.04];

/** rocks[i]: those on island i, whose chart is charts[i]. */
export function createRocks(rocks: Rock[][], charts: Chart[], view: View, light: Light) {
  const loader = new TextureLoader();
  const load = (file: string, srgb: boolean) => {
    const t = loader.load(`${import.meta.env.BASE_URL}tex/${file}`);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    return t;
  };
  const colour = load('rock.jpg', true), bumps = load('rock-normal.jpg', false);

  const material = new MeshBasicNodeMaterial();
  material.colorNode = Fn(() => {
    const p = positionWorld, g = normalize(normalWorld), height = view.altitude(p);
    // the texture along each axis, weighed by how squarely the surface faces it
    let w: N = abs(g).pow(4);
    w = w.div(w.x.add(w.y).add(w.z));
    const ux = p.zy.div(ROCK_TILE), uy = p.xz.div(ROCK_TILE), uz = p.xy.div(ROCK_TILE);
    const grain = texture(colour, ux).rgb.mul(w.x).add(texture(colour, uy).rgb.mul(w.y)).add(texture(colour, uz).rgb.mul(w.z));
    // each projection's normal map tilts the surface along that projection's two axes
    const t = (uv: N) => texture(bumps, uv).xy.mul(2).sub(1);
    const tx = t(ux), ty = t(uy), tz = t(uz);
    const tilt = vec3(0, tx.y, tx.x).mul(w.x).add(vec3(ty.x, 0, ty.y).mul(w.y)).add(vec3(tz.x, tz.y, 0).mul(w.z));
    const n = normalize(g.add(tilt));

    const tone = grain.div(vec3(...ROCK_MEAN));
    let albedo: N = mix(vec3(...ROCK_ALBEDO), vec3(...BLEACHED), smoothstep(0.55, 0.95, dot(g, view.up(p)))).mul(tone);
    albedo = albedo.mul(mix(float(1), float(CAVITY), attribute('cavity', 'float')));
    albedo = albedo.mul(mix(float(1), float(WET), smoothstep(0.5, 0.1, height)));
    albedo = mix(albedo, vec3(...ALGAE).mul(tone), smoothstep(-0.1, -0.6, height).mul(0.6));
    return albedo.mul(light(p, n));
  })();

  const m = new Matrix4(), q = new Quaternion(), e = new Euler(), s = new Vector3(), zero = new Vector3();
  const place = (r: Rock, chart: Chart): Placed => {
    // a slight lean, as if settled
    e.set(Math.sin(r.yaw * 3) * 0.12, r.yaw, Math.cos(r.yaw * 5) * 0.12);
    m.compose(zero, q.setFromEuler(e), s.setScalar(r.size));
    return { matrix: standing(chart, r.x, r.y, r.z, m, new Matrix4()) };
  };
  const kind = (big: boolean) => Array.from({ length: big ? KINDS.big.shapes : KINDS.boulder.shapes }, (_, k) =>
    createInstances(rockShape(k + (big ? 1 : 51), big ? KINDS.big.detail : KINDS.boulder.detail, big), material,
      rocks.map((on, i) => on.filter((r) => r.big === big && r.shape === k).map((r) => place(r, charts[i])))));
  return [...kind(true), ...kind(false)];
}
