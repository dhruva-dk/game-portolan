// Caustics: how much the waves above focus the sunlight reaching a point under the water.
//
// A bit of the surface refracts its light down onto the floor a depth D below, moving it sideways by
// D·(1 − 1/n)·∇h; the patch it lights is the surface's own area times the determinant J of I + D·(1 − 1/n)·H (H, the
// height's second derivatives; D eased to at most FOCUS), so the light there is 1/|J| as bright. Under a crest, which
// bulges like a lens, J < 1: the bright net on the floor. H is the two smaller cascades' curvature (waves.ts), read
// where the light came in (toward the sun), through each of the sea's charts and turned into the first chart's axes,
// summed with the chart's weight (H is linear in the height, which sums so).
//
// Band-limited: 1/|J| is sharp-edged, so the net of a wave shorter than a few pixels breaks into a grain of single
// bright pixels, not a net. And deeper down, the short waves' nets are past their focus and blurred by the sun's
// disc and the skylight round it into an even light. So each cascade's curvature is read already averaged (its
// mipmaps) over the wider of: PIXELS of the floor's footprint on the screen, and BLUR per metre of depth. Only the
// waves longer than about twice that width shape the net; the shorter average away, and far off, where the floor's
// footprint is wide, the net fades into an even light of itself.

import { Fn, If, dFdx, dFdy, dot, float, length, log2, max, mix, smoothstep, sqrt, texture, vec2, vec3 } from 'three/tsl';
import type { Sky } from '../sky/sky';
import type { Charts } from '../view/charts';
import type { View } from '../view/view';
import { CASCADES, SIZE } from '../world/cascades';
import { N_WATER } from './optics';
import { CURVED, type Waves } from './waves';
import type { FloatNode, Vec3Node } from '../tsl';

/** Caustics focus as if the floor were no deeper than about this, metres. */
const FOCUS = 2.5;
/** The net is drawn no finer than this many of the floor's pixels across: its lines a pixel or two wide at the least. */
const PIXELS = 4;
/** How far the net blurs per metre of depth: the sun's disc (0.7 cm/m in water), its aureole and the swaying of the
 * short waves' foci (about 3°). */
const BLUR = 0.05;

/** shallows(p): how much of the long (k < 2) and short waves the depth at p lets through. */
export function createCaustics(view: View, sky: Sky, waves: Waves, charts: Charts, shallows: (p: Vec3Node) => { long: FloatNode; short: FloatNode }) {
  return (p: Vec3Node): FloatNode => Fn(() => {
    const up = view.up(p);
    const depth = max(view.altitude(p).negate(), 0);
    const { long, short } = shallows(p);
    const l = sky.sun(p), ly = dot(l, up), flat = l.sub(up.mul(ly));
    const bent = sqrt(float(1).sub(ly.mul(ly))).div(N_WATER);
    const across = flat.div(max(length(flat), 1e-4)).mul(depth.mul(bent).div(sqrt(float(1).sub(bent.mul(bent)))));
    // the width each cascade is averaged over, metres (worked out before the charts' branches: derivatives)
    const footprint = max(length(dFdx(p)), length(dFdy(p)));
    const width = max(footprint.mul(PIXELS), depth.mul(BLUR));
    const E1 = vec3(1, 0, 0).toVar(), E2 = vec3(0, 0, 1).toVar(), H = vec3(0).toVar();
    // only under water: the dry ground is spared the charts and their reads
    If(depth.greaterThan(0), () => charts.each(p, (c, slot) => {
      if (slot === 0) {
        E1.assign(c.e1);
        E2.assign(c.e2);
      }
      const entry = c.q.add(vec2(dot(across, c.e1), dot(across, c.e2)));
      let h: Vec3Node = vec3(0);
      CURVED.forEach((k, i) => {
        const L = CASCADES[k];
        const lod = log2(max(width.div(L / SIZE), 1));
        h = h.add(texture(waves.curvature[i], entry.div(L)).level(lod).xyz.mul(k < 2 ? long : short));
      });
      // (hxx, hzz, hxz) on this chart's axes, onto the first's
      const a = dot(c.e1, E1), b = dot(c.e2, E1), e = dot(c.e1, E2), d = dot(c.e2, E2);
      H.addAssign(vec3(
        h.x.mul(a.mul(a)).add(h.y.mul(b.mul(b))).add(h.z.mul(a.mul(b).mul(2))),
        h.x.mul(e.mul(e)).add(h.y.mul(d.mul(d))).add(h.z.mul(e.mul(d).mul(2))),
        h.x.mul(a.mul(e)).add(h.y.mul(b.mul(d))).add(h.z.mul(a.mul(d).add(b.mul(e)))),
      ).mul(c.w));
    }));
    const f = depth.div(sqrt(float(1).add(depth.div(FOCUS).pow(2)))).mul(1 - 1 / N_WATER);
    const J = float(1).add(f.mul(H.x)).mul(float(1).add(f.mul(H.y))).sub(f.mul(H.z).mul(f.mul(H.z)));
    return mix(float(1), float(1).div(max(J.abs(), 0.15)), smoothstep(0, 0.3, depth));
  })();
}
