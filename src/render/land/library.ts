// The ground every region is painted with: its six roles (top, slope, cliff, beach, wet shore, seabed), each a scanned
// material from the region's own set (src/render/materials), and the list of distinct scans they come from.
//
// The shader indexes a role by region × 6 + role; the scans are streamed into the GPU's slots by scans.ts.
import { REGIONS, type RegionId } from '../../sim/world/index.ts';
import { REGION_MATERIALS as NORTH } from '../materials/north.ts';
import { REGION_MATERIALS as SOUTH } from '../materials/south.ts';
import type { MaterialLayer, MaterialMaps, MaterialRole, MaterialSet } from '../materials/types.ts';

/** The roles in the order the shader keeps them. */
export const ROLES = ['top', 'slope', 'cliff', 'beach', 'wetShore', 'seabed'] as const satisfies readonly MaterialRole[];
export const ROLE = Object.fromEntries(ROLES.map((r, i) => [r, i])) as Record<(typeof ROLES)[number], number>;
export const ROLE_COUNT = ROLES.length;

export const SETS: Record<RegionId, MaterialSet> = { ...NORTH, ...SOUTH };

/** One scanned material as the GPU holds it: its files, and which region's set it belongs to. */
export interface Scan {
  key: string;
  region: number;
  maps: MaterialMaps;
}

/** One region's role: the scan it paints with and how. */
export interface Layer {
  scan: number;
  scale: number;
  tint: readonly [number, number, number];
  wet: number;
  normalScale: number;
}

/** How much moss grows on each region's shaded rock, 0…1: the damp, temperate places. */
export const MOSS: Partial<Record<RegionId, number>> = {
  fjords: 0.55, mistwood: 1, spires: 0.35, basaltStacks: 0.6, kelpShallows: 0.3, blossomRun: 0.45, weepingIsle: 1,
  mangroveLabyrinth: 0.8, jadeShoals: 0.4, spiceIsles: 0.35, maelstrom: 0.5,
};

export const SCANS: Scan[] = [];
/** Per region, per role (region × 6 + role). */
export const LAYERS: Layer[] = [];

{
  const byKey = new Map<string, number>();
  REGIONS.forEach((info, region) => {
    const set = SETS[info.id];
    for (const role of ROLES) {
      const l: MaterialLayer = set.layers[role];
      const key = `${info.id}/${l.scan}`;
      let scan = byKey.get(key);
      if (scan === undefined) {
        scan = SCANS.length;
        byKey.set(key, scan);
        SCANS.push({ key, region, maps: l.maps });
      }
      LAYERS.push({ scan, scale: l.scale, tint: l.tint, wet: l.wet, normalScale: l.normalScale ?? 1 });
    }
  });
}
