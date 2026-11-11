// Foam on the sea, as a share of the pixel it covers: the whitecaps the breaking waves leave (waves.ts keeps them,
// fading, in its displacement textures' w) and the swash at the shore.
//
// Both are drawn by one lacy pattern (ambientCG Foam002, CC0), its brightness spread evenly over 0…1: a cover c
// (0…1) shows the pattern where it is brighter than 1 − c, so that fresh foam (c near 1) is whole but for the
// pattern's holes and, as it fades, only its brightest strands are left: a whitecap thins into a web and then into
// threads. Since a share c of the pattern is brighter than 1 − c, the foam the eye sees averages c, however the
// cover is filtered; and the
// edge between shown and not is softened as the pixel's footprint grows over the pattern's threads, so far off the
// lace becomes an even veil of the same cover rather than a flicker.
//
// The pattern is stretched along the crests (across the wind: the chart's z), as the foam of a breaking crest is
// laid out along it, and read at two scales so it doesn't repeat; a third, broad read, stretched along the wind,
// thins it into lanes, as old foam is gathered into streaks downwind.
//
// Swash: where the water over the sand is thinner than SWASH, it runs up the beach and back aerated, a white line
// that follows the waterline as each wave lifts it.

import { NoColorSpace, RepeatWrapping, TextureLoader } from 'three/webgpu';
import { float, max, mix, saturate, smoothstep, texture, vec2 } from 'three/tsl';
import type { Read } from '../view/charts';

type N = any;

/** The pattern repeats every this many metres along the crests. */
const TILE = 5;
/** How much the crests stretch it: across the wind it repeats TILE / STRETCH. */
const STRETCH = 2.5;
/** The lanes: metres along the wind, and across it. */
const LANES = [60, 12];
/** Water thinner than this over the sand runs as swash, metres. */
const SWASH = 0.4;
/**
 * The two reads' mix is mostly dark: its brightness spread evenly over 0…1 is (mix − LEVELS[0]) / LEVELS[1] (its
 * 10th to 90th percentiles measured, 0.077 to 0.414: near enough linear between).
 */
const LEVELS = [0.035, 0.42];
/** Fresh foam shows this much of the pattern: never whole, its darkest holes open. */
const OPEN = 0.8;
/** The pattern is read blurred over this many pixels: foam is soft, its finest bubbles too small to see. */
const BLUR = 3;
/** The veil between the threads: this much of the cover. */
const VEIL = 0.4;
/** At its whitest foam covers this much of the pixel. */
const DENSE = 0.92;

export function createFoam() {
  const pattern = new TextureLoader().load(`${import.meta.env.BASE_URL}tex/foam.png`);
  pattern.wrapS = pattern.wrapT = RepeatWrapping;
  pattern.anisotropy = 4;
  pattern.colorSpace = NoColorSpace;

  /**
   * The foam at a point through one chart c: cover, the whitecaps' (0…1, filtered over the pixel); thickness, the
   * water's over the ground there (metres, ∞ offshore); footprint, the pixel's size on the water (metres).
   */
  return (c: Read, cover: N, thickness: N, footprint: N): N => {
    const read = (k: [number, number]) => {
      const s = vec2(1 / k[0], 1 / k[1]);
      return texture(pattern, c.q.mul(s)).grad(c.dx.mul(s).mul(BLUR), c.dy.mul(s).mul(BLUR)).r;
    };
    const mixed = read([TILE / STRETCH, TILE]).mul(0.6).add(read([(2.7 * TILE) / STRETCH, 2.7 * TILE]).mul(0.4));
    const lace = mixed.sub(LEVELS[0]).div(LEVELS[1]);
    // the lanes thin old foam, not fresh: a fading whitecap lasts longer within one
    const lanes = smoothstep(0.15, 0.6, read([LANES[0], LANES[1]]));
    const old = mix(cover, cover.mul(lanes.mul(0.7).add(0.5)), smoothstep(0.9, 0.3, cover));
    const swash = smoothstep(SWASH, 0, thickness).mul(smoothstep(-0.05, 0.02, thickness));
    const all = saturate(max(old, swash));
    // soft as the threads blur together: from a few centimetres of footprint to half a metre
    const soft = mix(float(0.3), float(0.5), smoothstep(0.03, 0.5, footprint));
    const edge = float(1).sub(all.mul(OPEN));
    const threads = smoothstep(edge.sub(soft), edge.add(soft), lace).mul(smoothstep(0, 0.05, all));
    // between the threads, a thin veil of bubbles under the surface
    return max(threads, all.mul(VEIL)).mul(DENSE);
  };
}
