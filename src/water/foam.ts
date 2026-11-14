// Foam on the sea, as a share of the pixel it covers: the whitecaps the breaking waves leave (waves.ts keeps them,
// fading, in its displacement textures' w), the ships' and the surf's (water.ts), and the swash at the shore; and the
// air the breaking works into the water under them.
//
// Foam is a flat shape: wholly there or not, with a crisp edge. Its outline is scalloped, as a painter draws surf: the
// cover (0…1) is cut where it passes a field of rounded lobes laid on the water (two crossed rows of arcs, each bent
// by the other so no row runs straight), so where the cover is full the foam is whole, where it thins the lobes part
// into separate rounds, and where there is none there is none. The lobes ride the sea's own charts, so they move with
// the swell. Far off, where a lobe is under a pixel, the field settles to its mean and the edge widens to the pixel:
// an even veil of the same cover, not a flicker.
//
// Air: a breaking wave drives a cloud of bubbles a metre or so under the surface that outlasts the foam on it (less
// where the water is shallower than that: none in the swash, which stays clear over the sand), and scatters the light
// back up (optics.ts, as a wake's air does): round and after every whitecap the water shows a pale turquoise, and
// the foam lies in it rather than on blue water.
//
// Swash: each wave's bore runs up the beach and drains back (water.ts); the water thinner than LINE over the sand is
// foam, a thick band that follows the waterline up and down the sand, and over the last centimetre at its very edge
// it thins away to nothing, so the water meets the sand with no line drawn between them.

import { abs, float, max, mix, saturate, sin, smoothstep, texture } from 'three/tsl';
import type { Read } from '../view/charts';
import { CASCADES } from '../world/cascades';
import { FOAMING, type Waves } from './waves';
import type { FloatNode } from '../tsl';

/** A lobe of the scallops is about this many metres across; each row of them is bent this far (radians) by the other. */
const LOBE = 1.6, BENT = 0.9;
/** How far the lobes move the foam's edge, as a share of the cover: the edge is where cover + SCALLOP·(field − ½)
 *  passes ½, so full cover is whole whatever the field, and none is none. */
const SCALLOP = 0.8;
/** Half the edge's width (of the cover) seen close, and how it widens with the pixel's footprint over a lobe. */
const CRISP = 0.03;
/** The swash's band: water thinner than LINE over the sand (metres) is its foam, fading to nothing over the last
 * EDGE at its very edge. */
const LINE = 0.3, EDGE = 0.012;
/** The air under a whitecap, at most, as a share of a wake's thickest (optics.ts); the depth its cloud reaches down,
 * metres: in thinner water there is less of it. */
const AIR = 0.7, PLUME = 1;

export function createFoam(waves: Waves) {
  /**
   * The foam at a point through one chart c, and the air under it: other, any cover (0…1) laid on the whitecaps'
   * (the surf's, the ships'); thickness, the water's over the ground there (metres, ∞ offshore); footprint, the
   * pixel's size on the water (metres).
   */
  return (c: Read, other: FloatNode, thickness: FloatNode, footprint: FloatNode): { foam: FloatNode; air: FloatNode } => {
    let whitecap: FloatNode = float(0);
    CASCADES.slice(0, FOAMING).forEach((L, k) => {
      whitecap = whitecap.add(texture(waves.displacement[k], c.q.div(L)).grad(c.dx.div(L), c.dy.div(L)).w);
    });
    const cover = saturate(whitecap.add(other));
    const swash = smoothstep(0, EDGE, thickness).mul(smoothstep(LINE, LINE * 0.3, thickness));
    const all = saturate(max(cover, swash));
    // the lobes: two rows of arcs crossing, each bent by the other; 0 in the cusps between them … 1 at their middles
    const u = c.q.mul(Math.PI / LOBE);
    const field = abs(sin(u.x.add(sin(u.y.mul(0.7)).mul(BENT)))).mul(abs(sin(u.y.mul(0.8).add(sin(u.x.mul(0.6)).mul(BENT)))));
    // far off the lobes are finer than the pixel: their mean, and an edge as wide as the pixel makes it
    const fine = smoothstep(LOBE * 0.25, LOBE * 1.5, footprint);
    const cutAt = all.add(mix(field, float(0.4), fine).sub(0.5).mul(SCALLOP)).sub(0.5);
    const w = mix(float(CRISP), float(0.5), fine);
    const foam = smoothstep(w.negate(), w, cutAt).mul(smoothstep(0, 0.05, all));
    return { foam, air: cover.mul(AIR).mul(saturate(thickness.div(PLUME))) };
  };
}
