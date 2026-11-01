// The shapes shared by the rock forms and the catalogue.
import type * as THREE from 'three';
import type { Lod } from './mesh.ts';
import type { SkinId } from './skins.ts';

/** One mesh of a rock: geometry plus which skin it wears (the form's own if left out), or the still pool water. */
export interface Part {
  geo: THREE.BufferGeometry;
  skin?: SkinId;
  pool?: boolean;
}

export interface BuildOpts {
  /** Wear another skin: the generic forms take REGION_SKIN[region] so they look local. */
  skin?: SkinId;
  /** Lava only: 0 cold, 1 glowing in every crack. Defaults to a seeded choice. */
  hot?: number;
}

/** A form's generator: the parts of one rock, at a size in metres and a level of detail. */
export type Generator = (seed: number, size: number, lod: Lod, opts: BuildOpts) => Part[];
