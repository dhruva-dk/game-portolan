// The ground's look, wherever it is: coral sand all over, rippled, wet and darker near and below the waterline (with
// a sheen where it is wet above it), mottled, with rubble and sea grass where the ground's cover says (ground.ts),
// stones and weed strewn over the floor (strewn.ts), and on the islands fallen fronds and leaves.
// The islands' meshes and the sea floor's both shade with this, so where they overlap they look the same.
//
// Everything is a function of the world position alone (the sea floor's mesh slides along under the eye): the
// textures are laid on the world's three axes and blended by which way up faces there (sharply, so nearly
// everywhere one of them shows alone; any three axes do, so the world's serve), the cover read from the ground.
//
// Lit like everything else (light.ts).

import { NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader } from 'three/webgpu';
import { If, abs, cameraPosition, float, mix, mx_noise_float, normalize, reflect, smoothstep, texture, vec2, vec3 } from 'three/tsl';
import type { View } from '../view/view';
import type { Ground } from './ground';
import type { Light } from './light';
import { createStrewn } from './strewn';

type N = any;

/** The sand texture (ambientCG Ground055S) repeats every this many metres; its ripples are laid again this many
 * times larger (twice, crossing), the wind's broader ripples that show from afar. */
const SAND_TILE = 4, BROAD = 4.3;
/** Its mean colour, linear (measured), and the coral sand's mean albedo it is scaled to: a warm beige. */
const SAND_MEAN = [0.345, 0.315, 0.221];
const SAND_ALBEDO = [0.21, 0.18, 0.125];
/** Wet sand reflects less: water fills the gaps between the grains. It is damp to this height, metres,
 * and glistens below SWASH, where the waves wash up. */
const WET = 0.65, DAMP = 0.6, SWASH = 0.3;
/** The wet sand's sheen: the water film's reflectance face on, and the share of the sand it films. */
const FILM = 0.02, FILMED = 0.5;
/** Sea grass's albedo, and the most it covers the sand: thin, with the sand between its blades. */
const GRASS = [0.1, 0.11, 0.055], GRASS_COVER = 0.7;
/** The grass grows in clumps about this many metres across. */
const CLUMP = 2.2;
/** Coral and rubble's: browns and olives, darker than the sand. */
const CORAL = [0.15, 0.115, 0.08];
/** The litter texture (ambientCG Ground053) repeats every this many metres; its mean colour, linear (measured), and
 * the dry fronds' and leaves' mean albedo it is scaled to. */
const LITTER_TILE = 3;
const LITTER_MEAN = [0.173, 0.106, 0.065];
const LITTER_ALBEDO = [0.2, 0.16, 0.11];
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
  const strewn = createStrewn();

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
    // the damp band ends raggedly, higher on the hollows
    const wet = smoothstep(DAMP, DAMP - 0.25, height.add(cover.z.sub(0.5).mul(0.4)));
    albedo = albedo.mul(mix(float(1), float(WET), wet));
    // rubble, mottled by the sand's pattern and its own
    const coral = smoothstep(0.25, 0.8, cover.y.add(grain.r.sub(SAND_MEAN[0]).mul(2))).mul(0.85);
    albedo = mix(albedo, vec3(...CORAL).mul(grain.div(vec3(...SAND_MEAN))).mul(cover.z.mul(0.6).add(0.7)), coral);
    // sea grass in soft-edged clumps, thin enough to show the sand between
    const lumpy: N = mx_noise_float(p.div(CLUMP));
    const clumps = smoothstep(-0.3, 0.45, lumpy.add(grain.g.sub(SAND_MEAN[1]).mul(2)));
    const grass = smoothstep(0.1, 0.8, cover.x).mul(clumps).mul(GRASS_COVER);
    albedo = mix(albedo, vec3(...GRASS).mul(grain.g.div(SAND_MEAN[1])), grass);
    // stones and weed on the floor
    const stones = strewn(p, height, cover);
    albedo = mix(albedo, stones.rgb, stones.a);

    let bare: N = float(1);
    if (litter) {
      // litter on the dry sand, thinning out raggedly at its edges
      const fallen: N = tri(leaves, LITTER_TILE).rgb;
      const lying = smoothstep(0.15, 0.85, litter.add(cover.z.sub(0.5).mul(0.6)).add(fallen.r.sub(LITTER_MEAN[0]).mul(2)))
        .mul(smoothstep(0.3, 1, height)).mul(0.85);
      albedo = mix(albedo, fallen.div(vec3(...LITTER_MEAN)).mul(vec3(...LITTER_ALBEDO)), lying);
      bare = float(1).sub(lying);
    }

    // the ripples' normal map, each projection's tilting the surface along its own two axes, the map turned by `turn`
    // radians on each (and its tilt turned back); none under the litter, the grass nor the stones
    const ripples = (tile: number, warp: N, turn: number): N => {
      const c = Math.cos(turn), s = Math.sin(turn);
      const b = (q: N): N => {
        const t: N = texture(sandNormal, vec2(q.x.mul(c).sub(q.y.mul(s)), q.x.mul(s).add(q.y.mul(c)))).xy.mul(2).sub(1);
        return vec2(t.x.mul(c).add(t.y.mul(s)), t.y.mul(c).sub(t.x.mul(s)));
      };
      const q = p.div(tile).add(warp), bx = b(q.zy), by = b(q.xz), bz = b(q.xy);
      return vec3(0, bx.y, bx.x).mul(w.x).add(vec3(by.x, 0, by.y).mul(w.y)).add(vec3(bz.x, bz.y, 0).mul(w.z));
    };
    // the broad ones two sets crossing, bent about by the grass's lumpy noise: dimpled, their crests wandering
    const broad = ripples(SAND_TILE * BROAD, lumpy.mul(0.12), 0).add(ripples(SAND_TILE * BROAD * 0.8, lumpy.mul(-0.1), 1.2));
    const tilt = ripples(SAND_TILE, float(0), 0).mul(1.2).add(broad.mul(0.4));
    const shown = normalize(n.add(tilt.mul(bare.mul(float(1).sub(grass)).mul(float(1).sub(stones.a)))));

    // where the waves wash up, the wet sand's film mirrors the sky, more as the view grazes it
    const sheen = smoothstep(SWASH, 0.05, height).mul(smoothstep(-0.02, 0.06, height)).mul(FILMED);
    const mirrored = vec3(0).toVar();
    If(sheen.greaterThan(0), () => {
      const eye = normalize(p.sub(cameraPosition));
      const fresnel = float(FILM).add(float(1 - FILM).mul(float(1).add(eye.dot(shown)).clamp(0, 1).pow(5)));
      mirrored.assign(light(p, reflect(eye, shown)).mul(fresnel).mul(sheen));
    });

    return albedo.mul(light(p, shown)).add(mirrored);
  };
}
