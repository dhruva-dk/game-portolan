// The ground's look, wherever it is: sand in flat bands by height, each of two tones (palette.ts) with a crisp edge
// to the next: the sea floor's pale sand, with rubble and sea grass where the ground's cover says (ground.ts) and
// stones and weed strewn over it (strewn.ts); a paler band along the waterline; the beach; the deeper, drier sand
// higher up; and under the trees, where fronds have fallen, a darker patch. The bands' edges wander with the ground's
// mottling, so none is a contour line.
// The islands' meshes and the sea floor's both shade with this, so where they overlap they look the same.
//
// Everything is a function of the world position alone (the sea floor's mesh slides along under the eye).
// Lit like everything else (sky/light.ts).

import { mix, vec3 } from 'three/tsl';
import { LITTER, SAND, SAND_DRY, SAND_SHORE, SEABED_SAND, SEABED_STONE, SEABED_WEED, type Tones } from '../palette';
import type { View } from '../view/view';
import type { Ground } from './ground';
import type { Light } from '../sky/light';
import { createStrewn } from './strewn';
import { cut, type FloatNode, type Vec3Node } from '../tsl';

/** Where each band begins, metres over the sea: the shore's pale sand, the beach, the dry sand. */
const SHORE = -0.15, BEACH = 0.45, DRY = 2.6;
/** How far up or down the ground's mottling moves a band's edge, metres. */
const RAGGED = 0.5;
/** The ground's cover (0…1) past which rubble lies on the floor, and sea grass; and litter under the trees. */
const RUBBLE = 0.7, GRASS = 0.65, FALLEN = 0.5;

export type Sand = (p: Vec3Node, n: Vec3Node, litter: FloatNode | null) => Vec3Node;

export function createSand(view: View, ground: Ground, light: Light): Sand {
  const strewn = createStrewn();

  /**
   * The colour of the ground at world position p, n its normal (world), litter 0…1 how thickly fronds and leaves
   * lie there (null on the sea floor's mesh, where none can).
   */
  return (p, n, litter) => {
    const height = view.altitude(p), cover = ground.cover(p);
    const mottle = cover.z.sub(0.5);
    const level = height.add(mottle.mul(RAGGED));
    let lit: Vec3Node = vec3(...SEABED_SAND.lit), shadow: Vec3Node = vec3(...SEABED_SAND.shadow);
    const lay = (t: Tones, share: FloatNode) => {
      lit = mix(lit, vec3(...t.lit), share);
      shadow = mix(shadow, vec3(...t.shadow), share);
    };
    // on the floor: rubble and sea grass in patches, stones and weed over them
    lay(SEABED_STONE, cut(cover.y.add(mottle.mul(0.3)), RUBBLE));
    lay(SEABED_WEED, cut(cover.x.add(cover.w.sub(0.5).mul(0.3)), GRASS));
    const strewed = strewn(p, height, cover);
    lay(SEABED_STONE, strewed.x);
    lay(SEABED_WEED, strewed.y);
    // up the beach
    lay(SAND_SHORE, cut(level, SHORE));
    lay(SAND, cut(level, BEACH));
    lay(SAND_DRY, cut(level, DRY));
    if (litter) lay(LITTER, cut(litter.add(mottle.mul(0.6)), FALLEN).mul(cut(height, BEACH)));
    return light.floor(p, n, lit, shadow);
  };
}
