// The island: one mesh from the dunes down the beach, across the lagoon's floor and the reef, and down the reef's
// wall to where the water is too deep for the floor to be seen (terrain.ts). Coral sand all over, wet and darker
// near and below the waterline, with sea grass in patches on the lagoon's floor.
//
// The mesh is a polar grid about the island's centre whose rings follow the coast, so the waterline lies along a
// ring: rings a metre or so apart across the beach and the shallows, growing apart inland and out over the deep.
// It is worked out on the island's chart and laid on the sphere (site.ts); the textures are laid along the chart.
//
// What covers the ground (sea grass, coral, the sand's mottling, litter) rides on the mesh's vertices: only the land
// needs it.
//
// Lit like everything on the island (light.ts).

import {
  BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicNodeMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace,
  TextureLoader, Vector3,
} from 'three/webgpu';
import { Fn, attribute, cross, dot, float, mix, normalGeometry, normalize, positionWorld, smoothstep, texture, vec3 } from 'three/tsl';
import type { View } from '../view/view';
import { ISLAND } from '../world/terrain';
import type { Light } from './light';
import { onSphere, type Site } from './site';

type N = any;

const SPOKES = 360;
/** The sand texture (ambientCG Ground055S) repeats every this many metres. */
const SAND_TILE = 4;
/** Its mean colour, linear (measured), and the coral sand's mean albedo it is scaled to. */
const SAND_MEAN = [0.345, 0.315, 0.221];
const SAND_ALBEDO = [0.46, 0.43, 0.37];
/** Wet sand reflects about half as much: water fills the gaps between the grains. */
const WET = 0.55;
/** Sea grass's albedo. */
const GRASS = [0.06, 0.075, 0.04];
/** Coral and rubble's: browns and olives, darker than the sand. */
const CORAL = [0.16, 0.12, 0.08];
/** The litter texture (ambientCG Ground053) repeats every this many metres; its mean colour, linear (measured), and
 * the dry fronds' and leaves' mean albedo it is scaled to. */
const LITTER_TILE = 3;
const LITTER_MEAN = [0.173, 0.106, 0.065];
const LITTER_ALBEDO = [0.22, 0.18, 0.12];

/** How far each ring lies from the waterline, metres (negative inland), for an island of the mean radius. */
function rings(): number[] {
  const out: number[] = [];
  for (let d = -ISLAND.radius; d < -24; d += 2) out.push(d);
  for (let d = -24; d < 40; d += 1.2) out.push(d);
  for (let d = 40, step = 1.2; d < ISLAND.lagoon * 1.3 + ISLAND.wall * 4; d += step, step *= 1.04) out.push(d);
  return out;
}

function geometry(site: Site, litter: (x: number, z: number) => number): BufferGeometry {
  const { island } = site;
  const ds = rings();
  const positions: number[] = [], normals: number[] = [], axes: number[] = [], ground: number[] = [];
  const cover: number[] = [], fallen: number[] = [];
  const n = new Vector3(), e = 0.5;
  for (const d of ds) for (let s = 0; s < SPOKES; s++) {
    const t = (s / SPOKES) * 2 * Math.PI, c = island.coast(t);
    // inland the rings shrink with the coast toward the centre; seaward they keep their distance from it
    const r = d < 0 ? c * (1 + d / ISLAND.radius) : c + d;
    const x = island.centre[0] + Math.cos(t) * r, z = island.centre[1] + Math.sin(t) * r;
    const at = onSphere(site, x, island.height(x, z), z);
    positions.push(...at.p);
    // the ground's normal on the chart (x, up, z), turned onto the sphere
    n.set(island.height(x - e, z) - island.height(x + e, z), 2 * e, island.height(x, z - e) - island.height(x, z + e)).normalize();
    for (let i = 0; i < 3; i++) normals.push(at.e1[i] * n.x + at.up[i] * n.y + at.e2[i] * n.z);
    axes.push(...at.e1);
    ground.push(x, z);
    cover.push(island.patches(x, z), island.reef(x, z), island.mottle(x, z));
    fallen.push(d < 0 ? litter(x, z) : 0);
  }
  const index: number[] = [];
  const at = (k: number, s: number) => k * SPOKES + (s % SPOKES);
  for (let k = 0; k < ds.length - 1; k++) for (let s = 0; s < SPOKES; s++) {
    index.push(at(k, s), at(k, s + 1), at(k + 1, s), at(k, s + 1), at(k + 1, s + 1), at(k + 1, s));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  g.setAttribute('axis', new Float32BufferAttribute(axes, 3));
  g.setAttribute('ground', new Float32BufferAttribute(ground, 2));
  g.setAttribute('cover', new Float32BufferAttribute(cover, 3));
  g.setAttribute('litter', new Float32BufferAttribute(fallen, 1));
  g.setIndex(index);
  return g;
}

/** litter(x, z): 0…1, how thickly fallen fronds and leaves cover the ground (scatter.litter). */
export function createLand(site: Site, view: View, light: Light, litter: (x: number, z: number) => number) {
  const loader = new TextureLoader();
  const load = (file: string, srgb: boolean) => {
    const t = loader.load(`${import.meta.env.BASE_URL}tex/${file}`);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    return t;
  };
  const sand = load('sand.jpg', true), sandNormal = load('sand-normal.jpg', false), leaves = load('litter.jpg', true);

  const material = new MeshBasicNodeMaterial();
  material.colorNode = Fn(() => {
    // where on the island's chart, and how high
    const p = positionWorld, xz = attribute('ground', 'vec2'), height = view.altitude(p), up = view.up(p);
    // two scales of the texture, so it doesn't visibly repeat
    const uv = xz.div(SAND_TILE), uv2 = xz.div(SAND_TILE * 3.7).add(0.37);
    const grain = texture(sand, uv).rgb.mul(0.65).add(texture(sand, uv2).rgb.mul(0.35));
    let albedo: N = grain.div(vec3(...SAND_MEAN)).mul(vec3(...SAND_ALBEDO));
    const cover: N = attribute('cover', 'vec3');
    // mottled: damper hollows and drier, paler rises
    albedo = albedo.mul(cover.z.mul(0.12).add(1));
    albedo = albedo.mul(mix(float(1), float(WET), smoothstep(0.4, 0.05, height)));
    // coral and rubble on the reef, mottled by the sand's pattern and its own
    const coral = smoothstep(0.2, 0.7, cover.y.add(grain.r.sub(SAND_MEAN[0]).mul(2)));
    albedo = mix(albedo, vec3(...CORAL).mul(grain.div(vec3(...SAND_MEAN))).mul(cover.z.mul(0.3).add(1)), coral);
    // sea grass, its edges broken by the sand's own pattern, only on the lagoon's floor (not the beach, nor the reef's wall)
    const flat = dot(normalize(normalGeometry), up);
    const floor = smoothstep(-1.2, -2.5, height).mul(smoothstep(-8, -6, height)).mul(smoothstep(0.9, 0.97, flat));
    const grass = smoothstep(0.35, 0.65, cover.x.add(grain.g.sub(SAND_MEAN[1]).mul(1.5))).mul(floor);
    albedo = mix(albedo, vec3(...GRASS).mul(grain.g.div(SAND_MEAN[1])), grass);

    // litter on the dry sand, its edges broken by its own pattern
    const strewn: N = texture(leaves, xz.div(LITTER_TILE)).rgb;
    const litter = smoothstep(0.35, 0.65, attribute('litter', 'float').add(cover.z.mul(0.25)).add(strewn.r.sub(LITTER_MEAN[0]).mul(3)))
      .mul(smoothstep(0.3, 1, height));
    albedo = mix(albedo, strewn.div(vec3(...LITTER_MEAN)).mul(vec3(...LITTER_ALBEDO)), litter);

    // the ripples' normal map, laid flat on the ground along the chart's axes (the ground is never steep enough for
    // that to matter), and none under the litter; the mesh sits in world space, so its normals are the world's
    const bump = texture(sandNormal, uv).xyz.mul(2).sub(1);
    const e1 = normalize(attribute('axis', 'vec3')), e2 = cross(e1, up);
    const tilt = e1.mul(bump.x).sub(e2.mul(bump.y)).mul(float(1.2).mul(float(1).sub(litter)));
    const n = normalize(normalize(normalGeometry).add(tilt));

    return albedo.mul(light(p, n));
  })();

  const mesh = new Mesh(geometry(site, litter), material);
  return { mesh, material };
}
