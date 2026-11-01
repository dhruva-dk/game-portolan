// Region ground materials: the scanned texture sets each region's terrain is painted with.
// Shared by north.ts (the Ice Crown and the northern ring) and south.ts (the southern ring and the Maelstrom),
// and read by the planet renderer. Each of those files exports REGION_MATERIALS for its own eight regions;
// the integration step merges them into one Record<RegionId, MaterialSet>.
//
// Image files live under public/, so paths here are relative to the app root, like the rewrite's 'tex/...'.
// A dev page one folder down prefixes '../' (or '/') when it loads them.
import type { RegionId } from '../../sim/world/index.ts';

/** Where on the ground a layer is painted. Every set fills all six. */
export type MaterialRole =
  | 'beach' // dry shore just above the waterline
  | 'seabed' // shallow sea floor, seen through the water
  | 'cliff' // steep faces, best projected sideways (triplanar)
  | 'slope' // moderate inclines between the shore and the top
  | 'top' // flat high ground
  | 'wetShore'; // the band the waves and the tide keep wet

export const MATERIAL_ROLES: readonly MaterialRole[] = ['beach', 'seabed', 'cliff', 'slope', 'top', 'wetShore'];

export type NorthRegionId = 'iceCrown' | 'fjords' | 'mistwood' | 'spires' | 'narrows' | 'basaltStacks' | 'kelpShallows' | 'blossomRun';
export type SouthRegionId = Exclude<RegionId, NorthRegionId>;

/** One scanned material's image files, 2K JPG unless noted. */
export interface MaterialMaps {
  /** sRGB colour. */
  albedo: string;
  /** Linear, OpenGL convention (green points up the texture). */
  normal: string;
  /** Linear grey. */
  roughness: string;
  /** Linear grey ambient occlusion. */
  ao: string;
  /** Linear grey height, for height-blending one layer into the next. */
  displacement?: string;
}

/** One role's layer: a scanned material plus how this region paints it. Two roles may share a scan. */
export interface MaterialLayer {
  role: MaterialRole;
  /** Short name of the scan, unique within the region, like 'granite'. Layers that share a scan share it. */
  scan: string;
  /** The library asset page the scan came from (Poly Haven or ambientCG), for credits. */
  source: string;
  maps: MaterialMaps;
  /** Metres of ground one repeat of the texture covers. */
  scale: number;
  /** Linear RGB multiplier on the albedo. [1, 1, 1] keeps the scan's own colour. */
  tint: readonly [number, number, number];
  /** 0 is dry, 1 is soaked: the renderer darkens the albedo and lowers the roughness by this much. */
  wet: number;
  /** Multiplier on the normal map's strength. Defaults to 1. */
  normalScale?: number;
}

export interface MaterialSet {
  region: RegionId;
  layers: Record<MaterialRole, MaterialLayer>;
}

/** The library's file naming: tex/regions/<region>/<scan>_<map>.jpg. */
export function scanMaps(region: RegionId, scan: string, displacement = false): MaterialMaps {
  const p = `tex/regions/${region}/${scan}_`;
  const maps: MaterialMaps = { albedo: `${p}albedo.jpg`, normal: `${p}normal.jpg`, roughness: `${p}rough.jpg`, ao: `${p}ao.jpg` };
  if (displacement) maps.displacement = `${p}disp.jpg`;
  return maps;
}

/** The distinct scans a set uses, by name. */
export function setScans(set: MaterialSet): Map<string, MaterialLayer> {
  const out = new Map<string, MaterialLayer>();
  for (const role of MATERIAL_ROLES) if (!out.has(set.layers[role].scan)) out.set(set.layers[role].scan, set.layers[role]);
  return out;
}
