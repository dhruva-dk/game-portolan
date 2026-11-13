// Who holds the sea, drawn in it: the first game's shading in of the water and its line (agent-initial src/territory.ts
// TERRITORY_GLSL), in TSL, read straight from the cells (claimed.ts) with no bake between.
//
// Each holder's share is a smooth field over the sea: the cells round a point read with a quadratic B-spline over the
// 3 × 3 nearest (each cell's smoothed share of its own holder, claimed.ts), the field between the two holders there
// (ordered by number, so both sides of a border agree on its sign) or of a lone holder against everyone. Its gradient is
// worked out with it and carried onto the screen through the cube face's Jacobian, so the distance to the border, the
// field's zero, is known in pixels and in metres however near or far: the line is drawn from it, crisp, no stairs, no
// crawl. Over a holder's own water, or open sea, with nothing changing near it, one read settles it.
//
// Where cells changed hands in the last HOLD s the cells' state before is read too, and the moment the change's front
// reached each: the new holder's tint floods in behind a bright line running over the water (a loop closed, a home
// laid), or the old drains away from the edge in, the water churned white behind it.
//
// What the water does with it (water.ts, optics.ts): a flat tint over all the holder's water, the water's own hue given
// up for hers at its own brightness (so scarlet stays scarlet over turquoise shallows and deep blue alike, and the
// waves, foam, glitter and depth still show through), hers stronger; and a hard, thin line along every border in the
// holder's colour, drawn over the water like ink and glowing a little round it: so wide in metres near, never under a
// pixel or so far off, its edges smoothed over exactly a pixel. Where two holders meet, each side of the line is its
// own holder's. Hers is wider and brighter.
//
// Cost: one read of two words (the cell and its moment) per pixel over settled water; nine of each within a few cells
// of a border or a change, and the cells' state before worked out only where one changed in the last HOLD s. The
// cells are 2 × 1.6 MB of storage, sent a face's changed range at a time.

import { StorageBufferAttribute, Vector4 } from 'three/webgpu';
import {
  If, abs, atan, clamp, dot, exp, float, floor, int, length, max, min, mix, select, smoothstep, storage, uniform, uniformArray,
  vec2, vec3, vec4,
} from 'three/tsl';
import { N } from '../world/cells';
import { R } from '../world/sphere';
import type { Sea } from '../snapshot';
import { type BoolNode, type FloatNode, type IntNode, type UintNode, type Vec2Node, type Vec3Node, type Vec4Node } from '../tsl';
import { gnomonic } from '../view/cube';
import { HOLD, SIDE, WORDS, createClaimed } from './claimed';

/** Metres a cell is across, about (the cube's cells are of near equal angle: a quarter of a great circle in N). */
const CELL = ((Math.PI / 2) * R) / N;
/** The tint: how far the water's colour is given up for its holder's (0…1), the others' and hers; seen from afar (a
 *  cell under a pixel or two: the full map's), more, so the holders read from space. */
const TINT = 0.6, OWN_TINT = 0.75, FAR_TINT = 0.9;
/** Her own border's line and glow, this many times as bright as the others' (the emphasis each colour's w carries). */
const OWN_LINE = 1.7;
/** The line's half width, m (hers OWN_WIDE times it), and the least, in pixels, it is drawn at far off: there its
 *  light falls with the width it should have, to no less than FAINTEST of it. */
const HALF = 0.22, OWN_WIDE = 1.4, THINNEST = 0.6, FAINTEST = 0.45;
/** The glow round the line: its reach, m (and the least, pixels), and how far it tints the water there. */
const GLOW_REACH = 1.6, GLOW_PX = 2, GLOW_TINT = 0.55;
/** The line's light and its glow's, as a share of what the sun and sky give a white surface, once the colour is raised
 *  to a luminance of 1. */
const INK = 0.7, GLOW = 0.12;
/** The flood's front: its width, seconds of its sweep, and its light. */
const CREST = 0.03, CREST_GAIN = 1.2;
/** Luminance's weights (linear Rec. 709). */
const LUMA = vec3(0.2126, 0.7152, 0.0722);

/** What the sea is at a point: its tint (rgb the holder's colour, a how far the water gives up its own for it), the
 *  line over it (rgb its light per unit of a white surface's, premultiplied; a its cover), a drained change's churn
 *  (0…1) and how far off it is seen (0…1: 1 a cell under a pixel or two). */
export interface Claim { dye: Vec4Node; ink: Vec4Node; drain: FloatNode; far: FloatNode }

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
  /** Her emphasis, 0 for others and 1 for hers, from a colour's w. */
  const hers = (w: FloatNode) => clamp(w.sub(1).div(OWN_LINE - 1), 0, 1);

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
      // seen from afar the water is tinted more, so the holders read
      const far = smoothstep(0.6, 2, max(length(jx), length(jy)));
      const tintOf = (w: FloatNode): FloatNode => mix(mix(float(TINT), float(OWN_TINT), hers(w)), float(FAR_TINT), far);

      const dye = vec4(0).toVar(), ink = vec4(0).toVar(), drain = float(0).toVar();
      const w0 = cellBuf.element(base), r0 = revBuf.element(base);
      const own = float(w0.bitAnd(255)), flat = w0.shiftRight(16).bitAnd(255).equal(255).and(r0.lessThanEqual(settled));
      const c = colourOf(own);
      dye.assign(vec4(c.xyz, select(own.greaterThan(0), tintOf(c.w), float(0))));

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
        // the field between the two holders, or of a lone holder against everyone: its value, its change a pixel
        // across the screen and a cell across the sea (at a meeting of three, the two strongest: the weaker of the
        // first two gives way to the third if it is stronger)
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
          return { v, px: max(toScreen(gv), 1e-6), cell: max(length(gv), 1e-6), lo: select(lone, s.a, min(x.id, y.id)), hi: select(lone, s.a, max(x.id, y.id)) };
        };
        // its tint (premultiplied: a the cover, across the border over a pixel) and how strong; its line, drawn over
        // the water (rgb its light, premultiplied, a its cover), and the glow round it (how far it tints the water there)
        const shade = (f: ReturnType<typeof field>) => {
          const t = clamp(f.v.div(f.px).add(0.5), 0, 1);
          const lo = colourOf(f.lo), hi = colourOf(f.hi);
          const aLo = select(f.lo.greaterThan(0), float(1), float(0)), aHi = select(f.hi.greaterThan(0), float(1), float(0));
          const tint = vec4(mix(hi.xyz.mul(aHi), lo.xyz.mul(aLo), t), mix(aHi, aLo, t));
          const strength = mix(aHi.mul(tintOf(hi.w)), aLo.mul(tintOf(lo.w)), t);
          // the line's colour each side its own holder's (on open sea's side, the holder's)
          const side = select(f.lo.greaterThan(0), mix(hi, lo, t), hi);
          // distance to the border in pixels, and metres a pixel across it
          const d = abs(f.v).div(f.px), mpp = f.px.div(f.cell).mul(CELL);
          const wide = float(HALF).mul(mix(float(1), float(OWN_WIDE), hers(max(hi.w, lo.w.mul(aLo))))).div(mpp);
          const cover = clamp(max(wide, THINNEST).sub(d).add(0.5), 0, 1).mul(max(min(wide.div(THINNEST), 1), FAINTEST)).mul(aHi);
          const reach = float(GLOW_REACH).div(mpp);
          const glow = exp(d.div(max(reach, GLOW_PX)).pow(2).negate()).mul(min(reach.div(GLOW_PX), 1)).mul(aHi);
          const light = side.xyz.div(max(dot(side.xyz, LUMA), 0.02)).mul(max(side.w, 1));
          return { tint, strength, ink: vec4(light.mul(cover.mul(INK).add(glow.mul(GLOW))), cover), glow: glow.mul(GLOW_TINT), colour: side.xyz, light };
        };
        const fN = field(now), fB = field(before), sN = shade(fN), sB = shade(fB);
        // the front: seconds since it passed, and how sharply that changes across the pixel
        const since = clock.sub(rev), pxT = toScreen(gRev);
        const tf = clamp(since.div(max(pxT, 1e-6)).add(0.5), 0, 1);
        // water going back to open sea fades out ahead of the front drawing back
        const fade = mix(float(1), smoothstep(0, 0.6, since.negate()), float(1).sub(sN.tint.w));
        const tc = mix(sB.tint.mul(fade), sN.tint, tf);
        const strength = mix(sB.strength.mul(fade), sN.strength, tf), glow = mix(sB.glow.mul(fade), sN.glow, tf);
        const colour = select(tc.w.greaterThan(1e-3), tc.xyz.div(max(tc.w, 1e-3)), mix(sB.colour, sN.colour, tf));
        // the flood's front running over the water as a line; the drained water churned behind the front drawing back
        const changing = select(length(sN.tint.sub(sB.tint)).greaterThan(1e-3), float(1), float(0));
        const crest = min(line(since, CREST, pxT).mul(CREST_GAIN).mul(sN.tint.w).mul(changing), 1);
        drain.assign(float(1).sub(sN.tint.w).mul(sB.tint.w).mul(select(since.lessThan(0), float(1).sub(fade), exp(since.mul(-3)))));
        const lines = mix(sB.ink.mul(fade), sN.ink, tf);
        ink.assign(lines.add(vec4(sN.light.mul(crest.mul(INK)), crest).mul(float(1).sub(lines.w))));
        dye.assign(vec4(colour, max(strength, glow)));
      });
      return { dye, ink, drain, far };
    },

    /** Each frame: who holds the sea (none outside a match) at the world's clock `now` (s), and whose ship is hers (her
     *  water stands out). */
    update(sea: Sea | undefined, now: number, own: number | null) {
      // (a new match's sea, or none, or one whose changes were missed, is sent whole once it is taken)
      claimed.follow(sea);
      for (const [a, b] of claimed.work(now)) {
        if (b <= a) continue;
        cellsAttr.addUpdateRange(a, b - a);
        revealAttr.addUpdateRange(a, b - a);
        cellsAttr.needsUpdate = revealAttr.needsUpdate = true;
      }
      if (!sea) return;
      clock.value = now;
      sea.colours.forEach((c, id) => {
        if (id + 1 < values.length) values[id + 1].set(c[0], c[1], c[2], id === own ? OWN_LINE : 1);
      });
    },
  };
}
