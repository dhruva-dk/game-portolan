// What a plant material is, written on it by the kit that made it, so the WebGPU planet can make its node twin
// (flora/nodes.ts): which kit's wind moves it, and what its surface does beyond a plain lit texture.
import type { Color, Material, Texture } from 'three';

export type Kit = 'A' | 'B' | 'C' | 'D';

export interface FloraTag {
  kit: Kit;
  /** Kit A: snow or moss lying on the upper faces and wherever aCover asks. */
  cover?: { map: Texture; tint: Color; scale: number };
  /** Cut-out cards whose coverage is kept in the distance; the size the alpha is judged at, texels. */
  cutout?: number;
  /** Kit A cards: the normals are the crown's and are not turned to the eye on the back faces. */
  crownNormals?: boolean;
  /** Kit B cards fade as they turn edge-on. */
  edgeFade?: boolean;
  /** Kit B: how the water moves it. */
  mode?: 'air' | 'submerged' | 'surface';
  /** How much light comes through from behind, 0…1. */
  translucency?: number;
  /** Kit B: washed toward pale grey, 0…1. */
  bleach?: number;
  /** Kit C: rocked by the swell under water rather than the wind. */
  surge?: boolean;
  /** Kit C: coral's skin, grooves or cups, as bumps. */
  coral?: { kind: 'brain' | 'polyp'; freq: number; bump: number };
  /** Kit D: moss on the upper faces and wherever aMoss asks. */
  moss?: { map: Texture; tint: Color; amount: number };
  /** Kit D: dark and slick under the sea, stained in the band the tide covers. */
  tide?: boolean;
}

export function tag<M extends Material>(m: M, t: FloraTag): M {
  m.userData.flora = t;
  return m;
}

export const tagOf = (m: Material): FloraTag | undefined => m.userData.flora as FloraTag | undefined;
