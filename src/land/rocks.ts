// The islands' rocks (scatter.ts says where): big rounded masses and the boulders round them. A handful of shapes of
// each, each drawn once for all its rocks on the islands in view (site.ts).
//
// Each shape is a sphere swollen into a few broad lobes by low noise, creased by its folded ridges, its faces then
// pared by a few planes (the boulders' more sharply: they are broken pieces, the masses weathered round), and
// squashed flatter than it is wide. Textured by projecting ambientCG Rock030 along the world's three axes and
// blending by the surface's facing (no seams, no UVs to unwrap: any three axes do, so the world's serve), scaled to
// a weathered brown, paler on the tops the sun and rain bleach; darker where wet, filmed with algae below the
// waterline; lit like everything else (light.ts).
//
// Triangles: 20 × (detail + 1)² a shape: 3380 for a mass, 720 for a boulder.

import {
  BufferGeometry, Euler, IcosahedronGeometry, Matrix4, MeshBasicNodeMaterial, NoColorSpace, Quaternion, RepeatWrapping,
  SRGBColorSpace, TextureLoader, Vector3,
} from 'three/webgpu';
import { Fn, abs, dot, float, mix, normalWorld, normalize, positionWorld, smoothstep, texture, vec3 } from 'three/tsl';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { View } from '../view/view';
import { random } from '../world/random';
import type { Rock } from '../world/scatter';
import type { Chart } from '../world/sphere';
import type { Light } from './light';
import { createInstances, standing, type Placed } from './site';

type N = any;

/** How many shapes of each kind, and how finely each is made. */
export const KINDS = { big: { shapes: 4, detail: 12 }, boulder: { shapes: 4, detail: 5 } };
/** The texture repeats every this many metres. */
const ROCK_TILE = 2.5;
/** Its mean colour, linear (measured), and the weathered rock's mean albedo it is scaled to: a warm brown. */
const ROCK_MEAN = [0.084, 0.079, 0.066];
const ROCK_ALBEDO = [0.3, 0.2, 0.13];
/** The bleached tops' albedo. */
const BLEACHED = [0.42, 0.33, 0.24];
/** Wet rock reflects about half as much; below the waterline it is filmed with algae. */
const WET = 0.5;
const ALGAE = [0.06, 0.07, 0.04];

/** Smooth 3D value noise, −1…1. */
function noise3(x: number, y: number, z: number, seed: number): number {
  const h = (i: number, j: number, k: number) => {
    let n = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k, 0x1b873593) ^ Math.imul(seed, 0x9e3779b9);
    n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
    n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(x - xi), v = s(y - yi), w = s(z - zi);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const plane = (k: number) => lerp(lerp(h(xi, yi, k), h(xi + 1, yi, k), u), lerp(h(xi, yi + 1, k), h(xi + 1, yi + 1, k), u), v);
  return lerp(plane(zi), plane(zi + 1), w) * 2 - 1;
}

function shape(seed: number, big: boolean): BufferGeometry {
  const rand = random(seed * 131 + 7);
  let g: BufferGeometry = new IcosahedronGeometry(1, big ? KINDS.big.detail : KINDS.boulder.detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  // the planes that pare it: mostly its sides and top (the bottom is buried)
  const cuts = Array.from({ length: (big ? 3 : 5) + Math.floor(rand() * 3) }, () => {
    const a = rand() * 2 * Math.PI, up = rand() * 1.2 - 0.2;
    return { n: new Vector3(Math.cos(a), up, Math.sin(a)).normalize(), at: (big ? 0.75 : 0.5) + rand() * 0.25 };
  });
  const stretch = big ? new Vector3(1, 0.6 + rand() * 0.25, 0.75 + rand() * 0.35) : new Vector3(1, 0.55 + rand() * 0.3, 0.7 + rand() * 0.4);
  const pos = g.getAttribute('position'), p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    // broad lobes, then finer lumps
    let r = 1, f = big ? 0.9 : 1.3, a = big ? 0.32 : 0.28;
    for (let o = 0; o < 4; o++, f *= 2.1, a *= 0.45) r += a * noise3(p.x * f, p.y * f, p.z * f, seed + o);
    // ridges and clefts: the folded crease of noise
    r += (big ? 0.07 : 0.09) * (1 - 2 * Math.abs(noise3(p.x * 3.5, p.y * 3.5, p.z * 3.5, seed + 9)));
    p.multiplyScalar(r);
    for (const { n, at } of cuts) {
      const over = p.dot(n) - at;
      if (over > 0) p.addScaledVector(n, -over * (big ? 0.6 : 0.93));
    }
    p.multiply(stretch);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}

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
    createInstances(shape(k + (big ? 1 : 51), big), material,
      rocks.map((on, i) => on.filter((r) => r.big === big && r.shape === k).map((r) => place(r, charts[i])))));
  return [...kind(true), ...kind(false)];
}
