import { StorageBufferAttribute, Vector4 } from 'three/webgpu';
import {
  If,
  abs,
  atan,
  clamp,
  dot,
  exp,
  float,
  floor,
  int,
  length,
  max,
  min,
  mix,
  select,
  smoothstep,
  storage,
  uniform,
  uniformArray,
  vec2,
  vec4,
} from 'three/tsl';
import type { Sea } from '../snapshot.ts';
import type {
  BoolNode,
  FloatNode,
  IntNode,
  UintNode,
  Vec2Node,
  Vec3Node,
  Vec4Node,
} from '../tsl.ts';
import { gnomonic } from '../view/cube.ts';
import { N } from '../../world/cells.ts';
import { HOLD, SIDE, WORDS, createClaimed } from './claimed.ts';

const TINT = 0.1,
  OWN_TINT = 0.14,
  FAR_TINT = 0.9;
const OWN_LINE = 2;
const LINE_HALF = 1.1,
  OWN_WIDE = 1.5;
const FAINTEST = 0.5;
const INK = 1;

const lineLight = (color: Vec3Node): Vec3Node =>
  color.div(max(max(color.x, color.y), max(color.z, 0.02))).mul(INK);
const CREST = 0.03,
  CREST_GAIN = 1.2;

interface Claim {
  dye: Vec4Node;
  ink: Vec4Node;
  drain: FloatNode;
  far: FloatNode;
}

const stroke = (d: FloatNode, w: number, px: FloatNode): FloatNode => {
  const we = max(px, w);
  return exp(d.mul(d).div(we.mul(we)).negate()).mul(float(w).div(we));
};

export function createClaims(ships: number) {
  const claimed = createClaimed();
  const cellsAttr = new StorageBufferAttribute(claimed.gpuCells, 1),
    revealAttr = new StorageBufferAttribute(claimed.gpuReveal, 1);
  const cellBuf = storage(cellsAttr, 'uint', WORDS).toReadOnly(),
    revBuf = storage(revealAttr, 'float', WORDS).toReadOnly();
  const values = Array.from({ length: ships + 1 }, () => new Vector4());
  const colors = uniformArray<'vec4'>(values, 'vec4');
  const clock = uniform(0);

  const colorOf = (id: FloatNode): Vec4Node => colors.element(int(id));
  const owned = (w: FloatNode) => clamp(w.sub(1).div(OWN_LINE - 1), 0, 1);

  return {
    at(p: Vec3Node, dpx: Vec3Node, dpy: Vec3Node): Claim {
      const { face, top, bottom } = gnomonic(p);
      const d0 = bottom(p),
        g = top(p).div(d0);
      const k = vec2((2 * N) / Math.PI).div(g.mul(g).add(1));
      const jx = top(dpx)
          .sub(g.mul(bottom(dpx)))
          .div(d0)
          .mul(k),
        jy = top(dpy)
          .sub(g.mul(bottom(dpy)))
          .div(d0)
          .mul(k);
      const toScreen = (gc: Vec2Node): FloatNode =>
        length(vec2(dot(gc, jx), dot(gc, jy)));
      const x = atan(g)
        .mul(4 / Math.PI)
        .add(1)
        .mul(N / 2)
        .sub(0.5);
      const c0 = clamp(floor(x.add(0.5)), 0, N - 1);
      const u = x.sub(c0);
      const base: IntNode = face
        .mul(SIDE * SIDE)
        .add(int(c0.y).add(1).mul(SIDE))
        .add(int(c0.x).add(1));
      const settled = clock.sub(HOLD);
      const far = smoothstep(0.6, 2, max(length(jx), length(jy)));
      const tintOf = (w: FloatNode): FloatNode =>
        mix(mix(float(TINT), float(OWN_TINT), owned(w)), float(FAR_TINT), far);

      const dye = vec4(0).toVar(),
        ink = vec4(0).toVar(),
        drain = float(0).toVar();
      const w0 = cellBuf.element(base),
        r0 = revBuf.element(base);
      const own = float(w0.bitAnd(255)),
        flat = w0
          .shiftRight(16)
          .bitAnd(255)
          .equal(255)
          .and(r0.lessThanEqual(settled));
      const c = colorOf(own);
      dye.assign(
        vec4(c.xyz, select(own.greaterThan(0), tintOf(c.w), float(0)))
      );

      If(flat.not(), () => {
        const axis = (t: FloatNode) => [
          {
            w: float(0.5).sub(t).pow(2).mul(0.5),
            d: float(0.5).sub(t).negate(),
          },
          { w: float(0.75).sub(t.mul(t)), d: t.mul(-2) },
          { w: float(0.5).add(t).pow(2).mul(0.5), d: float(0.5).add(t) },
        ];
        const ax = axis(u.x),
          ay = axis(u.y);
        const acc = (first: FloatNode) => ({
          a: first,
          b: float(-1).toVar(),
          c: float(-1).toVar(),
          base: float(0).toVar(),
          gBase: vec2(0).toVar(),
          eA: float(0).toVar(),
          gA: vec2(0).toVar(),
          eB: float(0).toVar(),
          gB: vec2(0).toVar(),
          eC: float(0).toVar(),
          gC: vec2(0).toVar(),
        });
        const prevOwn = float(w0.shiftRight(8).bitAnd(255));
        const now = acc(own),
          before = acc(select(r0.greaterThan(settled), prevOwn, own));
        type Acc = ReturnType<typeof acc>;
        const add = (
          s: Acc,
          id: FloatNode,
          b: FloatNode,
          w: FloatNode,
          dw: Vec2Node
        ) => {
          const k2 = b.mul(2).sub(1),
            rest = float(1).sub(b);
          s.base.addAssign(w.mul(rest));
          s.gBase.addAssign(dw.mul(rest));
          const isA: BoolNode = id.equal(s.a);
          s.b.assign(select(isA.not().and(s.b.lessThan(0)), id, s.b));
          const isB: BoolNode = isA.not().and(id.equal(s.b));
          s.c.assign(
            select(isA.not().and(isB.not()).and(s.c.lessThan(0)), id, s.c)
          );
          const isC: BoolNode = isA.not().and(isB.not()).and(id.equal(s.c));
          s.eA.addAssign(select(isA, w.mul(k2), float(0)));
          s.gA.addAssign(select(isA, dw.mul(k2), vec2(0)));
          s.eB.addAssign(select(isB, w.mul(k2), float(0)));
          s.gB.addAssign(select(isB, dw.mul(k2), vec2(0)));
          s.eC.addAssign(select(isC, w.mul(k2), float(0)));
          s.gC.addAssign(select(isC, dw.mul(k2), vec2(0)));
        };
        const rev = float(0).toVar(),
          gRev = vec2(0).toVar(),
          stirred = float(0).toVar();
        const taps: {
          word: UintNode;
          r: FloatNode;
          w: FloatNode;
          dw: Vec2Node;
        }[] = [];
        for (let j = 0; j < 3; j++) {
          for (let i = 0; i < 3; i++) {
            const idx = base.add((j - 1) * SIDE + (i - 1));
            const word = i === 1 && j === 1 ? w0 : cellBuf.element(idx).toVar(),
              r = i === 1 && j === 1 ? r0 : revBuf.element(idx).toVar();
            const w = ax[i].w.mul(ay[j].w),
              dw = vec2(ax[i].d.mul(ay[j].w), ax[i].w.mul(ay[j].d));
            taps.push({ word, r, w, dw });
            add(
              now,
              float(word.bitAnd(255)),
              float(word.shiftRight(16).bitAnd(255)).div(255),
              w,
              dw
            );
            stirred.assign(
              max(stirred, select(r.greaterThan(settled), float(1), float(0)))
            );
            const m = max(r, settled);
            rev.addAssign(w.mul(m));
            gRev.addAssign(dw.mul(m));
          }
        }
        If(stirred.greaterThan(0), () => {
          for (const { word, r, w, dw } of taps) {
            const moving = r.greaterThan(settled);
            const id = float(word.bitAnd(255)),
              b = float(word.shiftRight(16).bitAnd(255)).div(255);
            const idBefore = select(
              moving,
              float(word.shiftRight(8).bitAnd(255)),
              id
            );
            add(
              before,
              idBefore,
              select(moving, float(word.shiftRight(24)).div(255), b),
              w,
              dw
            );
          }
        }).Else(() => {
          for (const k of [
            'b',
            'c',
            'base',
            'gBase',
            'eA',
            'gA',
            'eB',
            'gB',
            'eC',
            'gC',
          ] as const)
            before[k].assign(now[k]);
        });
        const field = (s: Acc) => {
          const lone = s.b.lessThan(0);
          const aWins = s.eA.greaterThanEqual(s.eB);
          const x = {
            id: select(aWins, s.a, s.b),
            e: select(aWins, s.eA, s.eB),
            g: select(aWins, s.gA, s.gB),
          };
          let y = {
            id: select(aWins, s.b, s.a),
            e: select(aWins, s.eB, s.eA),
            g: select(aWins, s.gB, s.gA),
          };
          const third = s.c.greaterThanEqual(0).and(s.eC.greaterThan(y.e));
          y = {
            id: select(third, s.c, y.id),
            e: select(third, s.eC, y.e),
            g: select(third, s.gC, y.g),
          };
          const o = select(x.id.lessThan(y.id), float(1), float(-1));
          const v = select(
            lone,
            s.base.add(s.eA).mul(2).sub(1),
            x.e.sub(y.e).mul(o)
          );
          const gv = select(
            lone,
            s.gBase.add(s.gA).mul(2),
            x.g.sub(y.g).mul(o)
          );
          return {
            v,
            px: max(toScreen(gv), 1e-6),
            lo: select(lone, s.a, min(x.id, y.id)),
            hi: select(lone, s.a, max(x.id, y.id)),
          };
        };
        const shade = (f: ReturnType<typeof field>) => {
          const t = clamp(f.v.div(f.px).add(0.5), 0, 1);
          const lo = colorOf(f.lo),
            hi = colorOf(f.hi);
          const aLo = select(f.lo.greaterThan(0), float(1), float(0)),
            aHi = select(f.hi.greaterThan(0), float(1), float(0));
          const tint = vec4(
            mix(hi.xyz.mul(aHi), lo.xyz.mul(aLo), t),
            mix(aHi, aLo, t)
          );
          const side = select(f.lo.greaterThan(0), mix(hi, lo, t), hi);
          const d = abs(f.v).div(f.px);
          const strength = mix(aHi.mul(tintOf(hi.w)), aLo.mul(tintOf(lo.w)), t);
          const wide = float(LINE_HALF).mul(
            mix(float(1), float(OWN_WIDE), owned(max(hi.w, lo.w.mul(aLo))))
          );
          const cover = clamp(wide.sub(d).add(0.5), 0, 1)
            .mul(mix(float(1), float(FAINTEST), far))
            .mul(aHi);
          const light = lineLight(side.xyz);
          return {
            tint,
            strength,
            ink: vec4(light.mul(cover), cover),
            color: side.xyz,
            light,
          };
        };
        const fN = field(now),
          fB = field(before),
          sN = shade(fN),
          sB = shade(fB);
        const since = clock.sub(rev),
          pxT = toScreen(gRev);
        const tf = clamp(since.div(max(pxT, 1e-6)).add(0.5), 0, 1);
        const fade = mix(
          float(1),
          smoothstep(0, 0.6, since.negate()),
          float(1).sub(sN.tint.w)
        );
        const tc = mix(sB.tint.mul(fade), sN.tint, tf);
        const strength = mix(sB.strength.mul(fade), sN.strength, tf);
        const color = select(
          tc.w.greaterThan(1e-3),
          tc.xyz.div(max(tc.w, 1e-3)),
          mix(sB.color, sN.color, tf)
        );
        const changing = select(
          length(sN.tint.sub(sB.tint)).greaterThan(1e-3),
          float(1),
          float(0)
        );
        const crest = min(
          stroke(since, CREST, pxT)
            .mul(CREST_GAIN)
            .mul(sN.tint.w)
            .mul(changing),
          1
        );
        drain.assign(
          float(1)
            .sub(sN.tint.w)
            .mul(sB.tint.w)
            .mul(
              select(since.lessThan(0), float(1).sub(fade), exp(since.mul(-3)))
            )
        );
        const lines = mix(sB.ink.mul(fade), sN.ink, tf);
        ink.assign(
          lines.add(
            vec4(sN.light.mul(crest.mul(INK)), crest).mul(float(1).sub(lines.w))
          )
        );
        dye.assign(vec4(color, strength));
      });
      return { dye, ink, drain, far };
    },

    update(sea: Sea | undefined, now: number, own: number | null) {
      claimed.follow(sea);
      const ranges = claimed.work(now);
      for (let f = 0; f < ranges.length; f++) {
        const a = ranges[f][0],
          b = ranges[f][1];
        if (b <= a) continue;
        cellsAttr.addUpdateRange(a, b - a);
        revealAttr.addUpdateRange(a, b - a);
        cellsAttr.needsUpdate = revealAttr.needsUpdate = true;
      }
      if (!sea) return;
      clock.value = now;
      for (let id = 0; id < sea.colors.length && id + 1 < values.length; id++) {
        const c = sea.colors[id];
        values[id + 1].set(c[0], c[1], c[2], id === own ? OWN_LINE : 1);
      }
    },
  };
}
