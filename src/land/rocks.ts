// The rocks along the coast (scatter.ts says where). A handful of shapes, each drawn once for all its rocks.
//
// Each shape is a sphere made lumpy by noise, its faces then sheared off by a few planes (the blocky, jointed look of
// weathered reef rock), and squashed flatter than it is wide. Textured by projecting ambientCG Rock030 along the
// world's three axes and blending by the surface's facing (no seams, no UVs to unwrap); darker where wet; lit like
// everything on the island (light.ts).

import {
  BufferGeometry, Euler, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicNodeMaterial, NoColorSpace, Quaternion,
  RepeatWrapping, SRGBColorSpace, TextureLoader, Vector3,
} from 'three/webgpu';
import { Fn, abs, float, mix, normalWorld, normalize, positionWorld, smoothstep, texture, vec3 } from 'three/tsl';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Light } from './light';
import { random, scatterRocks } from './scatter';
import type { Island } from './terrain';

type N = any;

const SHAPES = 6;
/** Triangles per shape: 20 × (DETAIL + 1)². */
const DETAIL = 8;
/** The texture repeats every this many metres. */
const ROCK_TILE = 2.5;
/** Its mean colour, linear (measured), and the weathered grey rock's mean albedo it is scaled to. */
const ROCK_MEAN = [0.084, 0.079, 0.066];
const ROCK_ALBEDO = [0.22, 0.21, 0.19];
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

function shape(seed: number): BufferGeometry {
  const rand = random(seed * 131 + 7);
  let g: BufferGeometry = new IcosahedronGeometry(1, DETAIL);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  // the planes that shear it: mostly its sides and top (the bottom is buried)
  const cuts = Array.from({ length: 5 + Math.floor(rand() * 4) }, () => {
    const a = rand() * 2 * Math.PI, up = rand() * 1.2 - 0.2;
    const n = new Vector3(Math.cos(a), up, Math.sin(a)).normalize();
    return { n, at: 0.5 + rand() * 0.3 };
  });
  const stretch = new Vector3(1, 0.55 + rand() * 0.3, 0.7 + rand() * 0.4);
  const pos = g.getAttribute('position'), p = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    let r = 1, f = 1.3, a = 0.28;
    for (let o = 0; o < 4; o++, f *= 2.1, a *= 0.45) r += a * noise3(p.x * f, p.y * f, p.z * f, seed + o);
    // ridges: the folded crease of noise
    r += 0.09 * (1 - 2 * Math.abs(noise3(p.x * 4, p.y * 4, p.z * 4, seed + 9)));
    p.multiplyScalar(r);
    for (const { n, at } of cuts) {
      const over = p.dot(n) - at;
      if (over > 0) p.addScaledVector(n, -over * 0.93);
    }
    p.multiply(stretch);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}

export function createRocks(island: Island, light: Light) {
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
    const p = positionWorld, g = normalize(normalWorld);
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

    let albedo: N = grain.div(vec3(...ROCK_MEAN)).mul(vec3(...ROCK_ALBEDO));
    albedo = albedo.mul(mix(float(1), float(WET), smoothstep(0.5, 0.1, p.y)));
    albedo = mix(albedo, vec3(...ALGAE).mul(grain.div(vec3(...ROCK_MEAN))), smoothstep(-0.1, -0.6, p.y).mul(0.6));
    return albedo.mul(light(p, n));
  })();

  const rocks = scatterRocks(island, SHAPES);
  const m = new Matrix4(), q = new Quaternion(), e = new Euler(), s = new Vector3(), at = new Vector3();
  const meshes = Array.from({ length: SHAPES }, (_, k) => {
    const mine = rocks.filter((r) => r.shape === k);
    const mesh = new InstancedMesh(shape(k + 1), material, Math.max(mine.length, 1));
    mesh.count = mine.length;
    mine.forEach((r, i) => {
      // a slight lean, as if settled
      e.set((Math.sin(r.yaw * 3) * 0.12), r.yaw, Math.cos(r.yaw * 5) * 0.12);
      m.compose(at.set(r.x, r.y, r.z), q.setFromEuler(e), s.setScalar(r.size));
      mesh.setMatrixAt(i, m);
    });
    mesh.computeBoundingSphere();
    return mesh;
  });
  return { meshes, material, rocks };
}
