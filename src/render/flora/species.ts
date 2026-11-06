// Every region's plants, from the four kits, under one contract: how to build a copy, where it grows, and the
// distances at which it changes its level of detail and stops being drawn. The kits each wrote their own contract
// (kitA.ts to kitD.ts); this is where their differences are smoothed over.
import type { Object3D } from 'three';
import { REGIONS } from '../../sim/world/index.ts';
import type { Kit } from './tag.ts';
import type { Anchor } from './scatter.ts';
import { LOD_DISTANCES as C_LODS } from './kitC.ts';
import { LOD_DISTANCES as D_LODS } from './kitD.ts';
import { PLANTS as basaltStacks } from './basaltStacks.ts';
import { PLANTS as blossomRun } from './blossomRun.ts';
import { PLANTS as coralAtolls } from './coralAtolls.ts';
import { PLANTS as fireArchipelago } from './fireArchipelago.ts';
import { PLANTS as fjords } from './fjords.ts';
import { PLANTS as glassSea } from './glassSea.ts';
import { PLANTS as iceCrown } from './iceCrown.ts';
import { PLANTS as jadeShoals } from './jadeShoals.ts';
import { PLANTS as kelpShallows } from './kelpShallows.ts';
import { PLANTS as maelstrom } from './maelstrom.ts';
import { PLANTS as mangroveLabyrinth } from './mangroveLabyrinth.ts';
import { PLANTS as mistwood } from './mistwood.ts';
import { PLANTS as narrows } from './narrows.ts';
import { PLANTS as spiceIsles } from './spiceIsles.ts';
import { PLANTS as spires } from './spires.ts';
import { PLANTS as weepingIsle } from './weepingIsle.ts';

export type Lod = 0 | 1 | 2;

export interface Species {
  id: string;
  name: string;
  region: number;
  kit: Kit;
  build(seed: number, lod: Lod): Object3D;
  minHeight: number;
  maxHeight: number;
  minSlope: number;
  maxSlope: number;
  /** Per 100 m². */
  density: number;
  /** 0…1, how tightly it gathers. */
  clump: number;
  /** A grove's size, metres. */
  grove: number;
  anchor: Anchor;
  /** Where LOD 1 and LOD 2 take over, and where it is no longer drawn; null leaves the last to the plant's size. */
  lods: readonly [number, number, number | null];
}

interface AnyPlant {
  id: string;
  name: string;
  build(seed: number, lod: Lod): Object3D;
  placement: { minHeight: number; maxHeight: number; maxSlope: number; density: number; cluster: number; minSlope?: number; anchor?: Anchor };
  lodDistances?: readonly number[];
  cullDistance?: number;
}

const KITS: Record<string, [Kit, readonly AnyPlant[]]> = {
  iceCrown: ['A', iceCrown], fjords: ['A', fjords], mistwood: ['A', mistwood], spires: ['A', spires],
  narrows: ['B', narrows], basaltStacks: ['B', basaltStacks], kelpShallows: ['B', kelpShallows], blossomRun: ['B', blossomRun],
  glassSea: ['C', glassSea], jadeShoals: ['C', jadeShoals], coralAtolls: ['C', coralAtolls], spiceIsles: ['C', spiceIsles],
  fireArchipelago: ['D', fireArchipelago], weepingIsle: ['D', weepingIsle], mangroveLabyrinth: ['D', mangroveLabyrinth], maelstrom: ['D', maelstrom],
};

/** A grove's size from how many there are: sparse trees gather in wide groves, dense herbs in small patches. */
const groveFor = (density: number): number => Math.max(4, Math.min(40, Math.sqrt(100 / Math.max(density, 0.01)) * 3));

function lodsOf(kit: Kit, p: AnyPlant): Species['lods'] {
  const d = p.lodDistances;
  switch (kit) {
    case 'A': return [d![0], d![1], d![2]];
    case 'B': return [d![0], d![1], p.cullDistance ?? null];
    case 'C': return [C_LODS[1], C_LODS[2], null];
    default: return [D_LODS[0], D_LODS[1], null];
  }
}

export const SPECIES: readonly Species[] = REGIONS.flatMap((r, region) => {
  const [kit, plants] = KITS[r.id] ?? ['A', []];
  return plants.map((p): Species => {
    const pl = p.placement;
    // kit C gives a group's radius in metres; the others how tightly they gather
    const clump = kit === 'C' ? 0.75 : pl.cluster;
    const grove = kit === 'C' ? Math.max(4, pl.cluster * 2) : groveFor(pl.density);
    return {
      id: p.id, name: p.name, region, kit, build: (seed, lod) => p.build(seed, lod),
      minHeight: pl.minHeight, maxHeight: pl.maxHeight, minSlope: pl.minSlope ?? 0, maxSlope: pl.maxSlope,
      density: pl.density, clump, grove, anchor: pl.anchor ?? 'ground', lods: lodsOf(kit, p),
    };
  });
});
