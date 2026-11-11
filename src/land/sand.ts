// The ground's look, wherever it is: coral sand all over, wet and darker near and below the waterline, mottled, with
// rubble and sea grass where the ground's cover says (ground.ts), and on the islands fallen fronds and leaves.
// The islands' meshes and the sea floor's both shade with this, so where they overlap they look the same.
//
// Everything is a function of the world position alone (the sea floor's mesh slides along under the eye): the
// textures are laid on the world's three axes and blended by which way up faces there (sharply, so nearly
// everywhere one of them shows alone; any three axes do, so the world's serve), the cover read from the ground.
//
// Lit like everything else (light.ts).

import { NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader } from 'three/webgpu';
import { abs, float, mix, normalize, smoothstep, texture, vec3 } from 'three/tsl';
import type { View } from '../view/view';
import type { Ground } from './ground';
import type { Light } from './light';

type N = any;

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
/** The litter texture (ambientCG Ground053) repeats every this many metres; its mean colour, linear (measured), and
 * the dry fronds' and leaves' mean albedo it is scaled to. */
const LITTER_TILE = 3;
const LITTER_MEAN = [0.173, 0.106, 0.065];
const LITTER_ALBEDO = [0.22, 0.18, 0.12];
/** How sharply the three projections hand over to each other. */
const SHARP = 8;

export type Sand = (p: N, n: N, litter: N | null) => N;

export function createSand(view: View, ground: Ground, light: Light): Sand {
  const loader = new TextureLoader();
  const load = (file: string, srgb: boolean) => {
    const t = loader.load(`${import.meta.env.BASE_URL}tex/${file}`);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    return t;
  };
  const sand = load('sand.jpg', true), sandNormal = load('sand-normal.jpg', false), leaves = load('litter.jpg', true);

  /**
   * The colour of the ground at world position p, n its normal (world), litter 0…1 how thickly fronds and leaves
   * lie there (null where none can).
   */
  return (p, n, litter) => {
    const up = view.up(p), height = view.altitude(p);
    let w: N = abs(up).pow(SHARP);
    w = w.div(w.x.add(w.y).add(w.z));
    // each axis's projection of a texture, blended
    const tri = (t: N, tile: number, shift = 0): N => {
      const q = p.div(tile).add(shift);
      return texture(t, q.zy).mul(w.x).add(texture(t, q.xz).mul(w.y)).add(texture(t, q.xy).mul(w.z));
    };
    // two scales of the texture, so it doesn't visibly repeat
    const grain = tri(sand, SAND_TILE).rgb.mul(0.65).add(tri(sand, SAND_TILE * 3.7, 0.37).rgb.mul(0.35));
    let albedo: N = grain.div(vec3(...SAND_MEAN)).mul(vec3(...SAND_ALBEDO));
    const cover: N = ground.cover(p);
    // mottled: damper hollows and drier, paler rises
    albedo = albedo.mul(cover.z.sub(0.5).mul(0.3).add(1));
    albedo = albedo.mul(mix(float(1), float(WET), smoothstep(0.4, 0.05, height)));
    // rubble, mottled by the sand's pattern and its own
    const coral = smoothstep(0.2, 0.7, cover.y.add(grain.r.sub(SAND_MEAN[0]).mul(2)));
    albedo = mix(albedo, vec3(...CORAL).mul(grain.div(vec3(...SAND_MEAN))).mul(cover.z.mul(0.6).add(0.7)), coral);
    // sea grass, its edges broken by the sand's own pattern
    const grass = smoothstep(0.35, 0.65, cover.x.add(grain.g.sub(SAND_MEAN[1]).mul(1.5)));
    albedo = mix(albedo, vec3(...GRASS).mul(grain.g.div(SAND_MEAN[1])), grass);

    let bare: N = float(1);
    if (litter) {
      // litter on the dry sand, its edges broken by its own pattern
      const strewn: N = tri(leaves, LITTER_TILE).rgb;
      const lying = smoothstep(0.35, 0.65, litter.add(cover.z.sub(0.5).mul(0.5)).add(strewn.r.sub(LITTER_MEAN[0]).mul(3)))
        .mul(smoothstep(0.3, 1, height));
      albedo = mix(albedo, strewn.div(vec3(...LITTER_MEAN)).mul(vec3(...LITTER_ALBEDO)), lying);
      bare = float(1).sub(lying);
    }

    // the ripples' normal map, each projection's tilting the surface along its own two axes; none under the litter
    // nor the grass
    const b = (q: N): N => texture(sandNormal, q).xy.mul(2).sub(1);
    const q = p.div(SAND_TILE), bx = b(q.zy), by = b(q.xz), bz = b(q.xy);
    const tilt = vec3(0, bx.y, bx.x).mul(w.x).add(vec3(by.x, 0, by.y).mul(w.y)).add(vec3(bz.x, bz.y, 0).mul(w.z));
    const shown = normalize(n.add(tilt.mul(bare.mul(float(1).sub(grass)).mul(1.2))));

    return albedo.mul(light(p, shown));
  };
}
