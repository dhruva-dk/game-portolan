// The ground's look, wherever it is: sand in flat bands by height, each of two tones (palette.ts) with a crisp edge
// to the next: the sea floor's pale sand, with rubble and sea grass where the ground's cover says (ground.ts) and
// stones and weed strewn over it (strewn.ts); a paler band along the waterline; the beach; the deeper, drier sand
// higher up; and under the trees, where fronds have fallen, a darker patch. The bands' edges wander with the ground's
// mottling, so none is a contour line. Where the ground is steeper than sand lies, a cliff's bare rock in strata.
// Where the land is the terrain's its cover carries the land's own (world/planet-terrain.ts): earthier sand in patches
// where the shrubs grow, and the tops' bare rock; the islands' land has none. High up, on either, the pale dunes
// (past 9 m on the islands, halfway to the summit on the terrain: palette.ts BANDS).
// The islands' meshes and the sea floor's both shade with this, so where they overlap they look the same.
//
// Everything is a function of the world position alone (the sea floor's mesh slides along under the eye).
// Lit like everything else (sky/light.ts).

import { dot, float, fract, max, mix, vec3 } from 'three/tsl';
import { BANDS, LITTER, ROCK, SAND, SAND_DRY, SAND_DUNE, SAND_LOAM, SAND_SHORE, SEABED_SAND, SEABED_STONE, SEABED_WEED, STRATUM, type Tones } from '../palette';
import type { View } from '../view/view';
import type { Ground } from './ground';
import type { Light } from '../sky/light';
import { createStrewn } from './strewn';
import { cut, type FloatNode, type Vec3Node } from '../tsl';
import { ISLANDS } from '../world/planet-islands';

/** Where each band lies (palette.ts BANDS). */
const { shore: SHORE, beach: BEACH, dry: DRY, loam: LOAM_AT, rubble: RUBBLE, ragged: RAGGED } = BANDS;
/** The ground's cover (0…1) past which sea grass grows on the floor; and litter under the trees. */
const GRASS = 0.65, FALLEN = 0.5;
/** Ground steeper than a cliff's face (ISLANDS.bare, rise over run) by SHEER is bare rock (BARE: the cosine of its
 *  tilt), so a dune's steep scraps stay sand; its strata this many metres apart, the pale band this share of each. */
const SHEER = 2.2, BARE = 1 / Math.hypot(1, ISLANDS.bare * SHEER), STRATA = 2.2, STRATUM_SHARE = 0.35;

export type Sand = (p: Vec3Node, n: Vec3Node, litter: FloatNode | null) => Vec3Node;

/** dune: the height past which the sand is the dunes', metres (BANDS). */
export function createSand(view: View, ground: Ground, light: Light, dune: number = BANDS.dune): Sand {
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
    // inland, earthier sand in patches where the shrubs grow (the cover's growth, ragged by the clumps); and high up,
    // the pale sand the wind has bleached and heaped
    lay(SAND_LOAM, cut(cover.x.add(cover.w.sub(0.5).mul(0.25)), LOAM_AT).mul(cut(level, DRY)));
    lay(SAND_DUNE, cut(level.add(mottle.mul(RAGGED * 6)), dune));
    // a cliff's face, or the bare rock of the tops: rock above the sea, in strata of two tones
    const cliff = cut(float(1).sub(dot(n, view.up(p))), 1 - BARE);
    const tops = cut(cover.y.add(mottle.mul(0.3)), RUBBLE).mul(cut(level, DRY));
    const bare = max(cliff, tops).mul(cut(height, SHORE));
    lay(ROCK, bare);
    lay(STRATUM, bare.mul(cut(fract(level.div(STRATA)), 1 - STRATUM_SHARE)));
    if (litter) lay(LITTER, cut(litter.add(mottle.mul(0.6)), FALLEN).mul(cut(height, BEACH)));
    return light.toon(p, n, lit, shadow);
  };
}
