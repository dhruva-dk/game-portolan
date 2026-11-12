// Foam on the sea, as a share of the pixel it covers: the whitecaps the breaking waves leave (waves.ts keeps them,
// fading, in its displacement textures' w) and the swash at the shore; and the air the breaking works into the water
// under them.
//
// Both are drawn by one lacy pattern (ambientCG Foam002, CC0), its brightness spread evenly over 0…1: a cover c
// (0…1) shows the pattern where it is brighter than 1 − c, so that fresh foam (c near 1) is whole but for the
// pattern's holes and, as it fades, only its brightest strands are left: a whitecap thins into a web and then into
// threads. Since a share c of the pattern is brighter than 1 − c, the foam the eye sees averages c, however the
// cover is filtered; and the edge between shown and not is softened as the pixel's footprint grows over the pattern's
// threads, so far off the lace becomes an even veil of the same cover rather than a flicker.
//
// Fresh foam is laid out along the crest that broke (across the wind: the chart's z), so the pattern is read
// stretched that way; as it ages the wind draws it out into streaks along itself (Monahan's stage B), so old foam
// reads the pattern stretched along the wind instead. A breaking crest runs on downwind and leaves its foam behind it
// on the water, which the breaking cascades' texels (half a metre and four) can't draw finer than a blob; so the
// whitecaps' cover is read a second time a little downwind, by a different distance in each narrow lane along the
// wind (a noise stretched along it), and the two kept: every patch trails streaks of its own foam upwind, longer and
// thinner in some lanes than others. The lanes are read through the mips, so where they are finer than a pixel the
// distance settles to its mean rather than flickering. A third, broad read, also along the wind, thins old foam into
// windrows, as it gathers into lines downwind.
//
// Air: a breaking wave drives a cloud of bubbles a metre or so under the surface that outlasts the foam on it (less
// where the water is shallower than that: none in the swash, which stays clear over the sand), and
// scatters the light back up (optics.ts, as a wake's air does): round and after every whitecap the water shows a
// pale turquoise, and the foam lies in it rather than on blue water.
//
// Swash: each wave's bore runs up the beach and drains back (water.ts), its front a thin line of foam that follows
// the waterline up and down the sand, the water behind it clearing to the sand under it but for a little lace; and at
// its very edge, over the last centimetre of water, the foam thins away to nothing, so the water meets the sand with
// no line drawn between them.

import { NoColorSpace, RepeatWrapping, TextureLoader } from 'three/webgpu';
import { float, max, mix, saturate, smoothstep, texture, vec2 } from 'three/tsl';
import type { Read } from '../view/charts';
import { CASCADES } from './cascades';
import { FOAMING, type Waves } from './waves';

type N = any;

/** The pattern repeats every this many metres along the crests. */
const TILE = 5;
/** How much the crests stretch it: across the wind it repeats TILE / STRETCH. */
const STRETCH = 2.5;
/** Old foam's streaks: the pattern repeats every this many metres along the wind, and across it. */
const STREAKS = [14, 2.5];
/** The windrows: metres along the wind, and across it. */
const LANES = [60, 12];
/** The lanes the whitecaps trail along: metres along the wind, and across it. */
const TRAILS = [24, 3];
/** How far downwind the trailing read looks, at most, metres: about how far a breaking crest runs on while its foam
 * fades (its speed, a few metres a second, times the foam's seconds). */
const TRAIL = 10;
/** The noise that rags the whitecaps' edges: about this many metres across. */
const RAGGED = 6;
/** The swash's front: water thinner than LINE over the sand (metres) is its foam, fading to nothing over the last
 * EDGE at its very edge; behind it, up to FILM deep, it leaves LEFT of that. */
const LINE = 0.08, EDGE = 0.012, FILM = 0.3, LEFT = 0.3;
/**
 * The two reads' mix is mostly dark: its brightness spread evenly over 0…1 is (mix − LEVELS[0]) / LEVELS[1] (its
 * 10th to 90th percentiles measured, 0.077 to 0.414: near enough linear between).
 */
const LEVELS = [0.035, 0.42];
/** A single read's: (read − SINGLE[0]) / SINGLE[1] (its 10th to 90th percentiles measured, 0.008 to 0.486). */
const SINGLE = [0.008, 0.48];
/** Fresh foam shows this much of the pattern: never whole, its darkest holes open. */
const OPEN = 0.8;
/** The pattern is read blurred over this many pixels: foam is soft, its finest bubbles too small to see. */
const BLUR = 3;
/** The veil between the threads: this much of the cover. */
const VEIL = 0.4;
/** At its whitest foam covers this much of the pixel. */
const DENSE = 0.92;
/** The air under a whitecap, at most, as a share of a wake's thickest (optics.ts); the depth its cloud reaches down,
 * metres: in thinner water there is less of it. */
const AIR = 0.7, PLUME = 1;

export function createFoam(waves: Waves) {
  const pattern = new TextureLoader().load(`${import.meta.env.BASE_URL}tex/foam.png`);
  pattern.wrapS = pattern.wrapT = RepeatWrapping;
  pattern.anisotropy = 4;
  pattern.colorSpace = NoColorSpace;

  /**
   * The foam at a point through one chart c, and the air under it: other, any cover (0…1) laid on the whitecaps'
   * (the surf's, the ships'); thickness, the water's over
   * the ground there (metres, ∞ offshore); footprint, the pixel's size on the water (metres).
   */
  return (c: Read, other: N, thickness: N, footprint: N): { foam: N; air: N } => {
    const read = (k: [number, number], blur = BLUR) => {
      const s = vec2(1 / k[0], 1 / k[1]);
      return texture(pattern, c.q.mul(s)).grad(c.dx.mul(s).mul(blur), c.dy.mul(s).mul(blur)).r;
    };
    // The whitecaps' cover, read where a noise of about a crest's size moves it a metre or so (the breaking cascades'
    // texels' bilinear squares broken into ragged edges), and again a lane's distance downwind, thinning as the
    // trail runs out.
    const lane = saturate(read([TRAILS[0], TRAILS[1]], 2).sub(SINGLE[0]).div(SINGLE[1]));
    const ragged = saturate(read([RAGGED, RAGGED], 2).sub(SINGLE[0]).div(SINGLE[1])).sub(0.5).mul(2 * RAGGED / 5);
    const whitecaps = (shift: N) => {
      let sum: N = float(0);
      CASCADES.slice(0, FOAMING).forEach((L, k) => {
        const s = 1 / L;
        sum = sum.add(texture(waves.displacement[k], c.q.add(shift).mul(s)).grad(c.dx.mul(s), c.dy.mul(s)).w);
      });
      return sum;
    };
    const here = whitecaps(vec2(ragged, ragged.negate()));
    const trailed = whitecaps(vec2(lane.mul(TRAIL).add(ragged), ragged));
    const whitecap = saturate(max(here, trailed.mul(float(1).sub(lane.mul(0.5)))));
    const cover = saturate(whitecap.add(other));
    // the swash's front, a line of foam that fades out over the last centimetre or so of water at its very edge, and
    // the thin water behind it, clearing
    const swash = smoothstep(0, EDGE, thickness)
      .mul(max(smoothstep(LINE, LINE * 0.3, thickness), smoothstep(FILM, LINE, thickness).mul(LEFT)));

    const crests = read([TILE / STRETCH, TILE]).mul(0.6).add(read([(2.7 * TILE) / STRETCH, 2.7 * TILE]).mul(0.4));
    const streaks = read([STREAKS[0], STREAKS[1]]).mul(0.6).add(read([2.3 * STREAKS[0], 2.3 * STREAKS[1]]).mul(0.4));
    // fresh foam in the crests' pattern, old in the wind's; the surf's and the swash's are always fresh
    const fresh = max(smoothstep(0.3, 0.9, whitecap), smoothstep(0, 0.3, other.add(swash)));
    const lace = mix(streaks, crests, fresh).sub(LEVELS[0]).div(LEVELS[1]);
    // the windrows thin old foam, not fresh: a fading whitecap lasts longer within one
    const rows = smoothstep(0.15, 0.6, read([LANES[0], LANES[1]]));
    const old = mix(cover, cover.mul(rows.mul(0.7).add(0.5)), smoothstep(0.9, 0.3, cover));
    const all = saturate(max(old, swash));
    // soft as the threads blur together: from a few centimetres of footprint to half a metre
    const soft = mix(float(0.3), float(0.5), smoothstep(0.03, 0.5, footprint));
    const edge = float(1).sub(all.mul(OPEN));
    const threads = smoothstep(edge.sub(soft), edge.add(soft), lace).mul(smoothstep(0, 0.05, all));
    // between the threads, a thin veil of bubbles under the surface; and the cloud of them below, which outlasts it
    return { foam: max(threads, all.mul(VEIL)).mul(DENSE), air: cover.mul(AIR).mul(saturate(thickness.div(PLUME))) };
  };
}
