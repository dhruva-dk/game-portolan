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

import { Fn, If, cos, dFdx, dFdy, dot, float, length, log2, max, mix, mx_worley_noise_vec2, sin, smoothstep, sqrt, texture, vec2, vec3 } from 'three/tsl';
import type { Sky } from '../sky/sky';
import type { Charts } from '../view/charts';
import type { View } from '../view/view';
import { CASCADES, PERIOD, SIZE } from '../world/cascades';
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
/**
 * The painted net (art/target/idea.png's shallows): the edges of a field of cells NET metres across, lines NET_LINE of
 * a cell wide (never under a pixel and a half), as bright as NET_LIGHT more sun; drifting round a circle NET_DRIFT
 * cells wide NET_TURNS times a sea's PERIOD; whole over the floor to NET_DEEP[0] metres of water, gone by NET_DEEP[1];
 * and gone where a cell spans fewer than NET_PIXELS pixels, where it would only be grain.
 */
const NET = 2.4, NET_LINE = 0.1, NET_LIGHT = 1.8, NET_DRIFT = 0.25, NET_TURNS = 8;
const NET_DEEP = [1.5, 7] as const, NET_PIXELS = 6;

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
    const E1 = vec3(1, 0, 0).toVar(), E2 = vec3(0, 0, 1).toVar(), H = vec3(0).toVar(), net = float(0).toVar();
    // the painted net's lines: their width in cells, and how much of it shows by the cell's size on the screen
    const line = max(float(NET_LINE), footprint.mul(1.5 / NET));
    const shown = smoothstep(NET_PIXELS * 0.5, NET_PIXELS, float(NET).div(footprint));
    const turn = waves.time.mul((2 * Math.PI * NET_TURNS) / PERIOD), drift = vec2(cos(turn), sin(turn)).mul(NET_DRIFT);
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
      const cells = mx_worley_noise_vec2(c.q.div(NET).add(drift));
      net.addAssign(float(1).sub(smoothstep(0, line, cells.y.sub(cells.x))).mul(c.w));
    }));
    const f = depth.div(sqrt(float(1).add(depth.div(FOCUS).pow(2)))).mul(1 - 1 / N_WATER);
    const J = float(1).add(f.mul(H.x)).mul(float(1).add(f.mul(H.y))).sub(f.mul(H.z).mul(f.mul(H.z)));
    const painted = net.mul(NET_LIGHT).mul(shown).mul(smoothstep(NET_DEEP[1], NET_DEEP[0], depth));
    return mix(float(1), float(1).div(max(J.abs(), 0.15)).add(painted), smoothstep(0, 0.3, depth));
  })();
}
