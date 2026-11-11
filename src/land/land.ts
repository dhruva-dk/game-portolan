// The island: one mesh from the dunes down the beach, across the lagoon's floor and the reef, and down the reef's
// wall to where the water is too deep for the floor to be seen (terrain.ts). Coral sand all over, wet and darker
// near and below the waterline, with sea grass in patches on the lagoon's floor.
//
// The mesh is a polar grid about the island's centre whose rings follow the coast, so the waterline lies along a
// ring: rings a metre or so apart across the beach and the shallows, growing apart inland and out over the deep.
//
// What covers the ground (sea grass, coral, the sand's mottling) rides on the mesh's vertices: only the land needs it.
//
// Lit like everything on the island (light.ts).

import {
  BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicNodeMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace,
  TextureLoader, Vector3,
} from 'three/webgpu';
import { Fn, attribute, float, mix, normalGeometry, normalize, positionWorld, smoothstep, texture, vec3 } from 'three/tsl';
import { type Below, light } from './light';
import { ISLAND, type Island } from './terrain';

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

/** How far each ring lies from the waterline, metres (negative inland), for an island of the mean radius. */
function rings(): number[] {
  const out: number[] = [];
  for (let d = -ISLAND.radius; d < -24; d += 4) out.push(d);
  for (let d = -24; d < 40; d += 1.2) out.push(d);
  for (let d = 40, step = 1.2; d < ISLAND.lagoon * 1.3 + ISLAND.wall * 4; d += step, step *= 1.04) out.push(d);
  return out;
}

function geometry(island: Island): BufferGeometry {
  const ds = rings();
  const positions: number[] = [], normals: number[] = [], cover: number[] = [];
  const n = new Vector3(), e = 0.5;
  for (const d of ds) for (let s = 0; s < SPOKES; s++) {
    const t = (s / SPOKES) * 2 * Math.PI, c = island.coast(t);
    // inland the rings shrink with the coast toward the centre; seaward they keep their distance from it
    const r = d < 0 ? c * (1 + d / ISLAND.radius) : c + d;
    const x = island.centre[0] + Math.cos(t) * r, z = island.centre[1] + Math.sin(t) * r;
    positions.push(x, island.height(x, z), z);
    n.set(island.height(x - e, z) - island.height(x + e, z), 2 * e, island.height(x, z - e) - island.height(x, z + e)).normalize();
    normals.push(n.x, n.y, n.z);
    cover.push(island.patches(x, z), island.reef(x, z), island.mottle(x, z));
  }
  const index: number[] = [];
  const at = (k: number, s: number) => k * SPOKES + (s % SPOKES);
  for (let k = 0; k < ds.length - 1; k++) for (let s = 0; s < SPOKES; s++) {
    index.push(at(k, s), at(k, s + 1), at(k + 1, s), at(k, s + 1), at(k + 1, s + 1), at(k + 1, s));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  g.setAttribute('cover', new Float32BufferAttribute(cover, 3));
  g.setIndex(index);
  return g;
}

export function createLand(island: Island, below: Below) {
  const loader = new TextureLoader();
  const load = (file: string, srgb: boolean) => {
    const t = loader.load(`${import.meta.env.BASE_URL}tex/${file}`);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    return t;
  };
  const sand = load('sand.jpg', true), sandNormal = load('sand-normal.jpg', false);

  const material = new MeshBasicNodeMaterial();
  material.colorNode = Fn(() => {
    const p = positionWorld, xz = p.xz;
    // two scales of the texture, so it doesn't visibly repeat
    const uv = xz.div(SAND_TILE), uv2 = xz.div(SAND_TILE * 3.7).add(0.37);
    const grain = texture(sand, uv).rgb.mul(0.65).add(texture(sand, uv2).rgb.mul(0.35));
    let albedo: N = grain.div(vec3(...SAND_MEAN)).mul(vec3(...SAND_ALBEDO));
    const cover: N = attribute('cover', 'vec3');
    // mottled: damper hollows and drier, paler rises
    albedo = albedo.mul(cover.z.mul(0.12).add(1));
    albedo = albedo.mul(mix(float(1), float(WET), smoothstep(0.4, 0.05, p.y)));
    // coral and rubble on the reef, mottled by the sand's pattern and its own
    const coral = smoothstep(0.2, 0.7, cover.y.add(grain.r.sub(SAND_MEAN[0]).mul(2)));
    albedo = mix(albedo, vec3(...CORAL).mul(grain.div(vec3(...SAND_MEAN))).mul(cover.z.mul(0.3).add(1)), coral);
    // sea grass, its edges broken by the sand's own pattern, only on the lagoon's floor (not the beach, nor the reef's wall)
    const floor = smoothstep(-1.2, -2.5, p.y).mul(smoothstep(-8, -6, p.y)).mul(smoothstep(0.9, 0.97, normalGeometry.y));
    const grass = smoothstep(0.35, 0.65, cover.x.add(grain.g.sub(SAND_MEAN[1]).mul(1.5))).mul(floor);
    albedo = mix(albedo, vec3(...GRASS).mul(grain.g.div(SAND_MEAN[1])), grass);

    // the ripples' normal map, laid flat on the ground (the ground is never steep enough for that to matter); the
    // mesh sits in world space, so its normals are the world's
    const bump = texture(sandNormal, uv).xyz.mul(2).sub(1);
    const n = normalize(normalize(normalGeometry).add(vec3(bump.x, 0, bump.y.negate()).mul(1.2)));

    return albedo.mul(light(p, n, below));
  })();

  const mesh = new Mesh(geometry(island), material);
  return { mesh, material };
}
