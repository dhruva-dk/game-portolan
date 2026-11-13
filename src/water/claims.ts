// Who holds the sea, drawn in it: the first game's shading in of the water and its line (agent-initial src/territory.ts
// TERRITORY_GLSL), in TSL, read straight from the cells (claimed.ts) with no bake between.
//
// Each holder's share is a smooth field over the sea: the cells round a point read with a quadratic B-spline over the
// 3 × 3 nearest (each cell's smoothed share of its own holder, claimed.ts), the field between the two holders there
// (ordered by number, so both sides of a border agree on its sign) or of a lone holder against everyone. Its gradient is
// worked out with it and carried onto the screen through the cube face's Jacobian, so the border, the field's zero, is
// drawn with exactly a pixel of smoothing however near or far: crisp, no stairs, no crawl. Over a holder's own water,
// or open sea, with nothing changing near it, one read settles it.
//
// Where cells changed hands in the last HOLD s the cells' state before is read too, and the moment the change's front
// reached each: the new holder's colour sweeps in behind a thin bright crest (a flood from the loop closed, a home
// laid), or the old drains away from the edge in, the water churned white behind it.
//
// What the water does with it (water.ts, optics.ts): a sixteenth-century chart's wash along a coast, the water's hue
// turned to the holder's in a band some 10 m inside the border, fading to a breath of it beyond, its brightness and its
// own depth's colour kept; a fine luminous line along every border, with a faint halo, and the crest, glowing in the holder's colour, each
// colour raised to the same brightness; a thin line of broken foam on the border's sea side.
//
// Cost: one read of two words (the cell and its moment) per pixel over settled water; nine of each within a few cells
// of a border or a change, and the cells' state before worked out only where one changed in the last HOLD s. The cells are 2 × 1.6 MB of storage, sent a face's changed range at a time.

import { StorageBufferAttribute, Vector4 } from 'three/webgpu';
import {
  If, abs, atan, clamp, dot, exp, float, floor, int, length, max, min, mix, mx_noise_float, pow, select, smoothstep, storage,
  uniform, uniformArray, vec2, vec3, vec4,
} from 'three/tsl';
import { N } from '../world/cells';
import type { Sea } from '../snapshot';
import { type BoolNode, type FloatNode, type IntNode, type UintNode, type Vec2Node, type Vec3Node, type Vec4Node } from '../tsl';
import { gnomonic } from '../view/cube';
import { HOLD, SIDE, WORDS, createClaimed } from './claimed';

/** How far the water's hue is turned to its holder's (0…1, its brightness kept), as a chart's wash along a coast: in a
 *  band just inside the border (the field's own rise, some 10 m), and over the rest of the water; hers a notch more. */
const BAND = 0.62, INNER = 0.07, OWN_BAND = 0.78, OWN_INNER = 0.11;
/** Seen from afar, the water is turned this far toward its holder's colour. */
const FAR_DYE = 0.6;
/** Her own border's line and crest, this many times as bright as the others'. */
const OWN_LINE = 1.7;
/** The border's line: its width and its halo's, in the field's units (a cell is about 1), and their strengths; the
 *  foam line's width; the crest's width, seconds of the front's sweep. */
const LINE = 0.07, LINE_GAIN = 1.4, HALO = 0.3, HALO_GAIN = 0.04, FOAM = 0.12, CREST = 0.01, CREST_GAIN = 1.6;
/** The glow's brightness, as a share of what the sun and sky give a white surface, once the colour is raised to a
 *  luminance of 1. */
const GLOW = 0.25;

/** What the sea is at a point: its dye (rgb the holder's colour, a how far toward it), the light its lines give off
 *  (radiance per unit of a white surface's), the border's foam and a drained change's churn (0…1). */
export interface Claim { dye: Vec4Node; shine: Vec3Node; foam: FloatNode; drain: FloatNode }

/** A line of width w at distance d, widened to the pixel's footprint px with its energy kept (the first game's). */
const line = (d: FloatNode, w: number, px: FloatNode): FloatNode => {
  const we = max(px, w);
  return exp(d.mul(d).div(we.mul(we)).negate()).mul(float(w).div(we));
};

/** ships: the most there will be. */
export function createClaims(ships: number) {
  const claimed = createClaimed();
  const cellsAttr = new StorageBufferAttribute(claimed.gpuCells, 1), revealAttr = new StorageBufferAttribute(claimed.gpuReveal, 1);
  const cellBuf = storage(cellsAttr, 'uint', WORDS).toReadOnly(), revBuf = storage(revealAttr, 'float', WORDS).toReadOnly();
  const values = Array.from({ length: ships + 1 }, () => new Vector4());
  const colours = uniformArray<'vec4'>(values, 'vec4');
  const clock = uniform(0);

  /** The holder's colour (rgb) and her emphasis (w: 1, hers OWN_LINE). */
  const colourOf = (id: FloatNode): Vec4Node => colours.element(int(id));

  return {
    /** The sea at p (any multiple of a unit vector, its screen derivatives dpx and dpy: taken by the caller where every
     *  pixel takes them). */
    at(p: Vec3Node, dpx: Vec3Node, dpy: Vec3Node): Claim {
      const { face, top, bottom } = gnomonic(p);
      const d0 = bottom(p), g = top(p).div(d0);
      // cells per pixel along the screen's x and y: dx = (2N/π)·dg/(1 + g²) on each axis
      const k = vec2(2 * N / Math.PI).div(g.mul(g).add(1));
      const jx = top(dpx).sub(g.mul(bottom(dpx))).div(d0).mul(k), jy = top(dpy).sub(g.mul(bottom(dpy))).div(d0).mul(k);
      const toScreen = (gc: Vec2Node): FloatNode => length(vec2(dot(gc, jx), dot(gc, jy)));
      const x = atan(g).mul(4 / Math.PI).add(1).mul(N / 2).sub(0.5);
      const c0 = clamp(floor(x.add(0.5)), 0, N - 1);
      const u = x.sub(c0);
      const base: IntNode = face.mul(SIDE * SIDE).add(int(c0.y).add(1).mul(SIDE)).add(int(c0.x).add(1));
      const settled = clock.sub(HOLD);
      // seen from afar (a cell under a pixel or two: the full map's), the water is dyed more, so the holders read
      const far = smoothstep(0.6, 2, max(length(jx), length(jy)));
      const dyed = (d: FloatNode): FloatNode => mix(d, float(FAR_DYE), far);

      const dye = vec4(0).toVar(), shine = vec3(0).toVar(), foam = float(0).toVar(), drain = float(0).toVar();
      const w0 = cellBuf.element(base), r0 = revBuf.element(base);
      const own = float(w0.bitAnd(255)), flat = w0.shiftRight(16).bitAnd(255).equal(255).and(r0.lessThanEqual(settled));
      const c = colourOf(own);
      // her emphasis, 0 for others and 1 for hers
      const hers = (w: FloatNode) => clamp(w.sub(1).div(OWN_LINE - 1), 0, 1);
      const wash = (w: FloatNode, band: FloatNode) => dyed(mix(mix(float(INNER), float(OWN_INNER), hers(w)), mix(float(BAND), float(OWN_BAND), hers(w)), band));
      dye.assign(vec4(c.xyz, select(own.greaterThan(0), wash(c.w, float(0)), float(0))));

      If(flat.not(), () => {
        // the 3 × 3 cells' weights and their gradients, the quadratic B-spline's, per axis
        const axis = (t: FloatNode) => [
          { w: float(0.5).sub(t).pow(2).mul(0.5), d: float(0.5).sub(t).negate() },
          { w: float(0.75).sub(t.mul(t)), d: t.mul(-2) },
          { w: float(0.5).add(t).pow(2).mul(0.5), d: float(0.5).add(t) },
        ];
        const ax = axis(u.x), ay = axis(u.y);
        // up to three holders: the middle cell's, and the first two others met
        const acc = (first: FloatNode) => ({
          a: first, b: float(-1).toVar(), c: float(-1).toVar(), base: float(0).toVar(), gBase: vec2(0).toVar(),
          eA: float(0).toVar(), gA: vec2(0).toVar(), eB: float(0).toVar(), gB: vec2(0).toVar(), eC: float(0).toVar(), gC: vec2(0).toVar(),
        });
        const prevOwn = float(w0.shiftRight(8).bitAnd(255));
        const now = acc(own), before = acc(select(r0.greaterThan(settled), prevOwn, own));
        type Acc = ReturnType<typeof acc>;
        const add = (s: Acc, id: FloatNode, b: FloatNode, w: FloatNode, dw: Vec2Node) => {
          const k2 = b.mul(2).sub(1), rest = float(1).sub(b);
          s.base.addAssign(w.mul(rest));
          s.gBase.addAssign(dw.mul(rest));
          const isA: BoolNode = id.equal(s.a);
          s.b.assign(select(isA.not().and(s.b.lessThan(0)), id, s.b));
          const isB: BoolNode = isA.not().and(id.equal(s.b));
          s.c.assign(select(isA.not().and(isB.not()).and(s.c.lessThan(0)), id, s.c));
          const isC: BoolNode = isA.not().and(isB.not()).and(id.equal(s.c));
          s.eA.addAssign(select(isA, w.mul(k2), float(0)));
          s.gA.addAssign(select(isA, dw.mul(k2), vec2(0)));
          s.eB.addAssign(select(isB, w.mul(k2), float(0)));
          s.gB.addAssign(select(isB, dw.mul(k2), vec2(0)));
          s.eC.addAssign(select(isC, w.mul(k2), float(0)));
          s.gC.addAssign(select(isC, dw.mul(k2), vec2(0)));
        };
        const rev = float(0).toVar(), gRev = vec2(0).toVar(), stirred = float(0).toVar();
        const taps: { word: UintNode; r: FloatNode; w: FloatNode; dw: Vec2Node }[] = [];
        for (let j = 0; j < 3; j++) {
          for (let i = 0; i < 3; i++) {
            const idx = base.add((j - 1) * SIDE + (i - 1));
            const word = i === 1 && j === 1 ? w0 : cellBuf.element(idx).toVar(), r = i === 1 && j === 1 ? r0 : revBuf.element(idx).toVar();
            const w = ax[i].w.mul(ay[j].w), dw = vec2(ax[i].d.mul(ay[j].w), ax[i].w.mul(ay[j].d));
            taps.push({ word, r, w, dw });
            add(now, float(word.bitAnd(255)), float(word.shiftRight(16).bitAnd(255)).div(255), w, dw);
            stirred.assign(max(stirred, select(r.greaterThan(settled), float(1), float(0))));
            const m = max(r, settled);
            rev.addAssign(w.mul(m));
            gRev.addAssign(dw.mul(m));
          }
        }
        // the cells as they were, only where one of them changed in the last HOLD s (settled, they are as they are)
        If(stirred.greaterThan(0), () => {
          for (const { word, r, w, dw } of taps) {
            const moving = r.greaterThan(settled);
            const id = float(word.bitAnd(255)), b = float(word.shiftRight(16).bitAnd(255)).div(255);
            add(before, select(moving, float(word.shiftRight(8).bitAnd(255)), id), select(moving, float(word.shiftRight(24)).div(255), b), w, dw);
          }
        }).Else(() => {
          for (const k of ['b', 'c', 'base', 'gBase', 'eA', 'gA', 'eB', 'gB', 'eC', 'gC'] as const) before[k].assign(now[k]);
        });
        // the field between the two holders, or of a lone holder against everyone; its gradient on the screen
        // (at a meeting of three, the two strongest: the weaker of the first two gives way to the third if it is stronger)
        const field = (s: Acc) => {
          const lone = s.b.lessThan(0);
          const aWins = s.eA.greaterThanEqual(s.eB);
          const x = { id: select(aWins, s.a, s.b), e: select(aWins, s.eA, s.eB), g: select(aWins, s.gA, s.gB) };
          let y = { id: select(aWins, s.b, s.a), e: select(aWins, s.eB, s.eA), g: select(aWins, s.gB, s.gA) };
          const third = s.c.greaterThanEqual(0).and(s.eC.greaterThan(y.e));
          y = { id: select(third, s.c, y.id), e: select(third, s.eC, y.e), g: select(third, s.gC, y.g) };
          const o = select(x.id.lessThan(y.id), float(1), float(-1));
          const v = select(lone, s.base.add(s.eA).mul(2).sub(1), x.e.sub(y.e).mul(o));
          const gv = select(lone, s.gBase.add(s.gA).mul(2), x.g.sub(y.g).mul(o));
          return { v, px: toScreen(gv), lo: select(lone, s.a, min(x.id, y.id)), hi: select(lone, s.a, max(x.id, y.id)) };
        };
        // its colour (premultiplied: a the cover) and the colour of its line, a pixel's smoothing across the border
        const shade = (f: ReturnType<typeof field>) => {
          const t = clamp(f.v.div(max(f.px, 1e-6)).add(0.5), 0, 1);
          const lo = colourOf(f.lo), hi = colourOf(f.hi);
          const aLo = select(f.lo.greaterThan(0), float(1), float(0)), aHi = select(f.hi.greaterThan(0), float(1), float(0));
          const tint = vec4(mix(hi.xyz.mul(aHi), lo.xyz.mul(aLo), t), mix(aHi, aLo, t));
          const edge = select(f.hi.greaterThan(0), vec4(select(f.lo.greaterThan(0), mix(hi, lo, t), hi).xyz, max(hi.w, select(f.lo.greaterThan(0), lo.w, float(0)))), vec4(0));
          return { tint, edge };
        };
        const fN = field(now), fB = field(before), sN = shade(fN), sB = shade(fB);
        // the front: seconds since it passed, and how sharply that changes across the pixel
        const since = clock.sub(rev), pxT = toScreen(gRev);
        const tf = clamp(since.div(max(pxT, 1e-6)).add(0.5), 0, 1);
        // water going back to open sea fades out ahead of the front drawing back
        const fade = mix(float(1), smoothstep(0, 0.6, since.negate()), float(1).sub(sN.tint.w));
        const ec = select(sN.edge.w.equal(0), sB.edge, select(sB.edge.w.equal(0), sN.edge, mix(sB.edge, sN.edge, tf)));
        const tc = mix(sB.tint.mul(fade), sN.tint, tf);
        const colour = select(tc.w.greaterThan(1e-3), tc.xyz.div(tc.w), ec.xyz);
        // the luminous line on the border with its halo, over a line of foam on the sea side
        const aN = abs(fN.v), aB = abs(fB.v);
        const lineN = line(aN, LINE, fN.px).mul(LINE_GAIN).add(line(aN, HALO, fN.px).mul(HALO_GAIN).mul(sN.tint.w));
        const lineB = line(aB, LINE, fB.px).mul(LINE_GAIN).add(line(aB, HALO, fB.px).mul(HALO_GAIN).mul(sB.tint.w)).mul(fade);
        const n = mx_noise_float(p.mul(0.55).add(vec3(clock.mul(0.5), 0, clock.mul(0.2)))).mul(0.5).add(0.5);
        const edge = mix(lineB, lineN, tf).mul(select(ec.w.greaterThan(0), float(1), float(0))).mul(float(0.8).add(n.mul(0.4)));
        // the wash: strongest at the border, softly gone some four cells in (12 m), where the field has risen to its full
        const band = pow(clamp(float(1).sub(mix(aB, aN, tf)), 0, 1), 1.1);
        const strength = wash(ec.w, band);
        const white = mix(line(aB, FOAM, fB.px).mul(fade), line(aN, FOAM, fN.px), tf).mul(float(1).sub(tc.w.mul(0.75)));
        foam.assign(white.mul(float(1).sub(far)).mul(smoothstep(0.2, 0.75, n).mul(0.65).add(0.35)));
        // the flood's crest, running over the water; the drained water churned behind the front drawing back
        const changing = select(length(sN.tint.sub(sB.tint)).greaterThan(1e-3), float(1), float(0));
        const crest = line(since, CREST, pxT).mul(CREST_GAIN).mul(sN.tint.w).mul(changing);
        drain.assign(float(1).sub(sN.tint.w).mul(sB.tint.w).mul(select(since.lessThan(0), float(1).sub(fade), exp(since.mul(-3)))));
        dye.assign(vec4(colour, tc.w.mul(strength)));
        // each colour raised to a luminance of 1, so every holder's line glows alike
        const lum = max(dot(ec.xyz, vec3(0.2126, 0.7152, 0.0722)), 0.02);
        shine.assign(ec.xyz.div(lum).mul(edge.add(crest)).mul(max(ec.w, 1)).mul(GLOW));
      });
      return { dye, shine, foam, drain };
    },

    /** Each frame: who holds the sea (none outside a match), and whose ship is hers (her water stands out). */
    update(sea: Sea | undefined, own: number | null) {
      // a new match's sea (or none), or one whose changes were missed, is sent whole
      if (claimed.follow(sea)) {
        for (const a of [cellsAttr, revealAttr]) {
          a.clearUpdateRanges();
          a.needsUpdate = true;
        }
      }
      if (!sea) return;
      for (const [a, b] of claimed.work(sea.clock)) {
        if (b <= a) continue;
        cellsAttr.addUpdateRange(a, b - a);
        revealAttr.addUpdateRange(a, b - a);
        cellsAttr.needsUpdate = revealAttr.needsUpdate = true;
      }
      clock.value = sea.clock;
      sea.colours.forEach((c, id) => {
        if (id + 1 < values.length) values[id + 1].set(c[0], c[1], c[2], id === own ? OWN_LINE : 1);
      });
    },
  };
}
