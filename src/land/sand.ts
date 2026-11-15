// The ground's look, wherever it is: sand in flat bands by height, each of two tones (palette.ts) with a crisp edge
// to the next: the sea floor's pale sand, with rubble and sea grass where the ground's cover says (ground.ts) and
// stones and weed strewn over it (strewn.ts); a paler band along the waterline; the beach; the deeper, drier sand
// higher up; and under the trees, where fronds have fallen, a darker patch. The bands' edges wander with the ground's
// mottling, so none is a contour line. Where the biome has turf, it covers the ground over the beach that is gentle
// enough to hold it. Where the ground is steeper than sand lies, a cliff's bare rock in strata. Every colour is the
// biome's (palette.ts GROUNDS).
// The islands' meshes and the sea floor's both shade with this, so where they overlap they look the same.
//
// Everything is a function of the world position alone (the sea floor's mesh slides along under the eye).
// Lit like everything else (sky/light.ts).

import { dot, float, fract, mix, vec3 } from 'three/tsl';
import type { Grounds, Tones } from '../palette';
import type { View } from '../view/view';
import type { Ground } from './ground';
import type { Light } from '../sky/light';
import { createStrewn } from './strewn';
import { cut, type FloatNode, type Vec3Node } from '../tsl';
import { ISLANDS } from '../world/planet-islands';

/** Where each band begins, metres over the sea: the shore's pale sand, the beach, the dry sand. */
const SHORE = -0.15, BEACH = 0.45, DRY = 2.6;
/** How far up or down the ground's mottling moves a band's edge, metres. */
const RAGGED = 0.5;
/** The ground's cover (0…1) past which rubble lies on the floor, and sea grass; and litter under the trees. */
const RUBBLE = 0.7, GRASS = 0.65, FALLEN = 0.5;
/** Ground steeper than a cliff's face (ISLANDS.bare, rise over run) by SHEER is bare rock (BARE: the cosine of its
 *  tilt), so a dune's steep scraps stay sand; its strata this many metres apart, the pale band this share of each. */
const SHEER = 2.2, BARE = 1 / Math.hypot(1, ISLANDS.bare * SHEER), STRATA = 2.2, STRATUM_SHARE = 0.35;
/** Turf holds on ground whose normal is this near the vertical (the cosine of its tilt, about 40°), and how far its
 *  edge wanders with the mottling. */
const SWARD = 0.77, SWARD_RAGGED = 0.12;

export type Sand = (p: Vec3Node, n: Vec3Node, litter: FloatNode | null) => Vec3Node;

export function createSand(view: View, ground: Ground, light: Light, inks: Grounds): Sand {
  const strewn = createStrewn();

  /**
   * The colour of the ground at world position p, n its normal (world), litter 0…1 how thickly fronds and leaves
   * lie there (null on the sea floor's mesh, where none can).
   */
  return (p, n, litter) => {
    const height = view.altitude(p), cover = ground.cover(p);
    const mottle = cover.z.sub(0.5);
    const level = height.add(mottle.mul(RAGGED));
    let lit: Vec3Node = vec3(...inks.seabed.lit), shadow: Vec3Node = vec3(...inks.seabed.shadow);
    const lay = (t: Tones, share: FloatNode) => {
      lit = mix(lit, vec3(...t.lit), share);
      shadow = mix(shadow, vec3(...t.shadow), share);
    };
    // on the floor: rubble and sea grass in patches, stones and weed over them
    lay(inks.stone, cut(cover.y.add(mottle.mul(0.3)), RUBBLE));
    lay(inks.weed, cut(cover.x.add(cover.w.sub(0.5).mul(0.3)), GRASS));
    const strewed = strewn(p, height, cover);
    lay(inks.stone, strewed.x);
    lay(inks.weed, strewed.y);
    // up the beach
    lay(inks.shore, cut(level, SHORE));
    lay(inks.sand, cut(level, BEACH));
    lay(inks.dry, cut(level, DRY));
    // the turf over it, where the ground is gentle enough to hold it
    const upright = dot(n, view.up(p));
    if (inks.turf) {
      const { tones: t, from, to } = inks.turf, held = cut(upright.add(mottle.mul(SWARD_RAGGED)), SWARD).mul(cut(level, from));
      lay(t, to === Infinity ? held : held.mul(float(1).sub(cut(level, to))));
    }
    // a cliff's face: bare rock above the sea, in strata of two tones
    const bare = cut(float(1).sub(upright), 1 - BARE).mul(cut(height, SHORE));
    lay(inks.rock, bare);
    lay(inks.stratum, bare.mul(cut(fract(level.div(STRATA)), 1 - STRATUM_SHARE)));
    if (litter) lay(inks.litter, cut(litter.add(mottle.mul(0.6)), FALLEN).mul(cut(height, BEACH)));
    return light.toon(p, n, lit, shadow);
  };
}
