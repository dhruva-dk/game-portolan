// The rock library: detail rock forms generated in code, one or more per region, laid over the World's heightfield
// so shores and cliffs read true at 50 m and at 10 m.
//
// Every form is a seeded parametric generator with three levels of detail:
//   ROCKS[i].build(seed, size, lod) -> THREE.Object3D
// size is in metres (what it measures is in sizeOf, the sensible range in sizes), lod 0 is for 10 m, 1 for 50 m and
// 2 for 300 m. The rock's origin is where it meets the ground or the sea (y = 0 is the waterline for floes); y is up.
//
// placement says where the World or the integration step should scatter it:
//   onCliff    on steep faces (align the form's +z to the face's outward normal, push its back into the slope)
//   onShore    on the beach and rock band from about 1 m below the waterline to about 3 m above it
//   underwater on the sea floor in the shallows
//   afloat     floating on the sea (floes)
//   density    copies per hectare (10,000 m²) of the eligible ground, at the middle of the size range
//
// Materials share ROCK_UNIFORMS: point uSea at the planet (centre, radius + tide) and tick uTime.
import * as THREE from 'three';
import type { RegionId } from '../../sim/world/index.ts';
import { basaltColumns, basaltStack, boulderBeach } from './forms/basalt.ts';
import { coralHead, coralRubble } from './forms/coral.ts';
import { graniteScree, graniteSlab } from './forms/fjords.ts';
import { seaBoulder, tidePoolRock } from './forms/generic.ts';
import { icePressureRidge, iceFloe, iceSpire } from './forms/ice.ts';
import { lavaFresh, lavaRopy } from './forms/lava.ts';
import { slateShelf } from './forms/maelstrom.ts';
import { sandstoneBlocks, sandstoneLedges } from './forms/narrows.ts';
import { limestoneNeedle, limestoneSeaCave } from './forms/spires.ts';
import { weepingCliff } from './forms/weeping.ts';
import { poolMaterial, rockMaterial } from './material.ts';
import type { Lod } from './mesh.ts';
import { REGION_SKIN, type SkinId } from './skins.ts';
import type { BuildOpts, Generator, Part } from './types.ts';

export { ROCK_UNIFORMS, rockMaterial, poolMaterial, rockTexturesReady, setRockTextureBase, setRockAnisotropy } from './material.ts';
export { REGION_SKIN, SKINS, type SkinId } from './skins.ts';
export type { BuildOpts, Part } from './types.ts';
export type { Lod } from './mesh.ts';

export interface Placement {
  onCliff: boolean;
  onShore: boolean;
  underwater: boolean;
  /** Floats on the sea (floes). */
  afloat?: boolean;
  /** Copies per hectare of eligible ground. */
  density: number;
}

export interface RockForm {
  id: string;
  name: string;
  regions: RegionId[];
  /** The skin it wears unless BuildOpts.skin says otherwise. */
  skin: SkinId;
  /** Sensible size range in metres, and what size measures. */
  sizes: [number, number];
  sizeOf: 'height' | 'width' | 'length' | 'radius';
  placement: Placement;
  /** The raw parts, for instancing or merging into a region's own meshes. */
  parts(seed: number, size: number, lod: Lod, opts?: BuildOpts): Part[];
  /** One rock as an Object3D: a Mesh, or a Group when it has several parts (pool water, a second skin). */
  build(seed: number, size: number, lod: Lod, opts?: BuildOpts): THREE.Object3D;
}

const ALL_REGIONS: RegionId[] = Object.keys(REGION_SKIN) as RegionId[];

function form(
  id: string, name: string, regions: RegionId[], skin: SkinId, sizes: [number, number], sizeOf: RockForm['sizeOf'],
  placement: Placement, gen: Generator,
): RockForm {
  const parts = (seed: number, size: number, lod: Lod, opts: BuildOpts = {}) => gen(seed, size, lod, opts);
  return {
    id, name, regions, skin, sizes, sizeOf, placement, parts,
    build: (seed, size, lod, opts = {}) => toObject(parts(seed, size, lod, opts), opts.skin ?? skin, id),
  };
}

/** Turns parts into a Mesh (one part) or a Group, with shadows on. */
export function toObject(parts: Part[], skin: SkinId, name = 'rock'): THREE.Object3D {
  const meshes = parts.map((p) => {
    const m = new THREE.Mesh(p.geo, p.pool ? poolMaterial() : rockMaterial(p.skin ?? skin));
    m.castShadow = !p.pool;
    m.receiveShadow = true;
    m.name = name;
    return m;
  });
  if (meshes.length === 1) return meshes[0];
  const g = new THREE.Group();
  g.name = name;
  g.add(...meshes);
  return g;
}

const at = (onCliff: boolean, onShore: boolean, underwater: boolean, density: number, afloat = false): Placement =>
  ({ onCliff, onShore, underwater, density, ...(afloat ? { afloat } : {}) });

export const ROCKS: RockForm[] = [
  // the Ice Crown
  form('iceSpire', 'blue-ice spire', ['iceCrown'], 'ice', [12, 60], 'height', at(false, true, false, 1.5), iceSpire),
  form('icePressureRidge', 'pressure ridge', ['iceCrown'], 'ice', [6, 30], 'length', at(false, true, false, 4, true), icePressureRidge),
  form('iceFloe', 'broken floe', ['iceCrown'], 'ice', [3, 25], 'width', at(false, false, false, 25, true), iceFloe),
  // the Fjords
  form('graniteSlab', 'granite slab', ['fjords'], 'granite', [4, 30], 'length', at(false, true, false, 8), graniteSlab),
  form('graniteScree', 'granite scree', ['fjords'], 'granite', [3, 15], 'radius', at(true, true, false, 5), graniteScree),
  // the Spires
  form('limestoneNeedle', 'limestone needle', ['spires'], 'limestone', [15, 70], 'height', at(false, true, false, 2), limestoneNeedle),
  form('limestoneSeaCave', 'sea cave', ['spires'], 'limestone', [8, 35], 'height', at(true, true, false, 1), limestoneSeaCave),
  // the Narrows
  form('sandstoneLedges', 'banded sandstone ledges', ['narrows'], 'sandstone', [6, 40], 'height', at(true, false, false, 4), sandstoneLedges),
  form('sandstoneBlocks', 'fallen sandstone blocks', ['narrows'], 'sandstone', [2, 10], 'radius', at(false, true, false, 10), sandstoneBlocks),
  // the Basalt Stacks
  form('basaltColumns', 'basalt causeway', ['basaltStacks'], 'basalt', [4, 20], 'radius', at(false, true, true, 2), basaltColumns),
  form('basaltStack', 'basalt stack', ['basaltStacks'], 'basalt', [8, 40], 'height', at(false, true, false, 1.5), basaltStack),
  form('boulderBeach', 'boulder beach', ['basaltStacks'], 'basalt', [3, 12], 'radius', at(false, true, false, 6), boulderBeach),
  // the Coral Atolls
  form('coralRubble', 'coral rubble', ['coralAtolls'], 'coral', [2, 8], 'radius', at(false, true, false, 12), coralRubble),
  form('coralHead', 'coral head', ['coralAtolls'], 'coral', [0.8, 4], 'width', at(false, false, true, 60), coralHead),
  // the Fire Archipelago
  form('lavaFresh', 'fresh lava rock', ['fireArchipelago'], 'scoria', [2, 15], 'width', at(true, true, false, 10), lavaFresh),
  form('lavaRopy', 'ropy lava', ['fireArchipelago'], 'pahoehoe', [3, 20], 'length', at(false, true, false, 6), lavaRopy),
  // the Weeping Isle
  form('weepingCliff', 'weeping cliff', ['weepingIsle'], 'weeping', [10, 80], 'height', at(true, false, false, 2), weepingCliff),
  // the Maelstrom
  form('slateShelf', 'slate shelf', ['maelstrom'], 'slate', [5, 30], 'length', at(true, true, false, 5), slateShelf),
  // everywhere, in the region's own skin
  form('seaBoulder', 'sea boulder', ALL_REGIONS, 'seaside', [0.6, 6], 'width', at(false, true, true, 40), seaBoulder),
  form('tidePoolRock', 'tide-pool rock', ALL_REGIONS, 'shore', [2, 10], 'width', at(false, true, false, 6), tidePoolRock),
];

export const rockById = (id: string): RockForm | undefined => ROCKS.find((r) => r.id === id);

/** The forms that belong to a region, its own first and then the generic ones. */
export const rocksFor = (region: RegionId): RockForm[] => ROCKS.filter((r) => r.regions.includes(region));

/** The skin a form should wear in a region: its own, or the region's skin for the generic forms. */
export function skinFor(rock: RockForm, region: RegionId): SkinId {
  return rock.regions.length === ALL_REGIONS.length ? REGION_SKIN[region] : rock.skin;
}

/** Distances (m) at which a rock of this size switches to LOD 1 and LOD 2. */
export function lodDistances(size: number): [number, number] {
  return [Math.max(30, size * 2.5), Math.max(120, size * 8)];
}

/** One rock with all three levels of detail, switching by camera distance. */
export function buildLOD(rock: RockForm, seed: number, size: number, opts: BuildOpts = {}): THREE.LOD {
  const lod = new THREE.LOD();
  const [d1, d2] = lodDistances(size);
  lod.addLevel(rock.build(seed, size, 0, opts), 0);
  lod.addLevel(rock.build(seed, size, 1, opts), d1);
  lod.addLevel(rock.build(seed, size, 2, opts), d2);
  lod.name = rock.id;
  return lod;
}

export interface Scatter {
  seed: number;
  size: number;
  /** Where the copy goes; its scale is applied on top of size. */
  matrix: THREE.Matrix4;
}

/**
 * Hundreds of copies at one level of detail in a few draw calls: the copies are grouped into `variants` shapes
 * (by seed), each shape is built once at its group's middle size, and every copy is an instance scaled to its size.
 */
export function instanceRocks(rock: RockForm, items: Scatter[], lod: Lod, opts: BuildOpts & { variants?: number } = {}): THREE.Group {
  const k = Math.max(1, opts.variants ?? 4), group = new THREE.Group(), skin = opts.skin ?? rock.skin;
  const buckets: Scatter[][] = Array.from({ length: k }, () => []);
  for (const it of items) buckets[Math.abs(Math.floor(it.seed)) % k].push(it);
  const m = new THREE.Matrix4(), s = new THREE.Matrix4();
  buckets.forEach((list, b) => {
    if (!list.length) return;
    const sizes = list.map((it) => it.size).sort((x, y) => x - y), mid = sizes[Math.floor(sizes.length / 2)];
    for (const p of rock.parts(list[0].seed, mid, lod, opts)) {
      const im = new THREE.InstancedMesh(p.geo, p.pool ? poolMaterial() : rockMaterial(p.skin ?? skin), list.length);
      list.forEach((it, i) => {
        const f = it.size / mid;
        im.setMatrixAt(i, m.copy(it.matrix).multiply(s.makeScale(f, f, f)));
      });
      im.castShadow = !p.pool;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = `${rock.id}:${b}`;
      group.add(im);
    }
  });
  return group;
}
