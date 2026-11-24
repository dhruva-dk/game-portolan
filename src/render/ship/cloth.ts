import { Vector4, type StorageBufferNode } from 'three/webgpu';
import {
  Fn,
  If,
  Return,
  abs,
  cos,
  cross,
  dot,
  float,
  instanceIndex,
  int,
  length,
  max,
  normalize,
  select,
  sin,
  uniform,
  uniformArray,
  vec3,
  vec4,
  instancedArray,
} from 'three/tsl';
import type { Compute } from '../gpu.ts';
import type { Vec3 } from '../../world/sphere.ts';
import { BERTHS } from './berths.ts';
import { cutCanvas } from './canvas.ts';
import { CLOTH } from './kit.ts';
import {
  maxInt,
  minInt,
  type FloatNode,
  type IntNode,
  type Vec3Node,
} from '../tsl.ts';

const SUBSTEPS = 8,
  LONGEST = 1 / 20;
const PRESS_SAIL = 1.1,
  PRESS_FLAG = 3.2;
const DRAG_SAIL = 0.02,
  DRAG_FLAG = 0.22;
const EDDY = 0.06,
  LUFF_SAIL = 0.45,
  LUFF_FLAG = 0.7,
  EDDY_WAVES = [2.6, 1.5];
const STENCIL: readonly (readonly [number, number, number, boolean])[] = [
  [1, 0, 1e-8, true],
  [-1, 0, 1e-8, true],
  [0, 1, 1e-8, true],
  [0, -1, 1e-8, true],
  [1, 1, 2e-6, true],
  [-1, -1, 2e-6, true],
  [1, -1, 2e-6, true],
  [-1, 1, 2e-6, true],
  [2, 0, 1e-4, false],
  [-2, 0, 1e-4, false],
  [0, 2, 1e-4, false],
  [0, -2, 1e-4, false],
];
const BUCKLE = 400;
const OMEGA = 1.5;
const DAMPING = 1.2,
  FASTEST = 40;
const CLEAR = 0.06;
const PARAMS = 5;

export const breath = (clock: FloatNode, phase: FloatNode): FloatNode =>
  float(1)
    .add(sin(clock.mul(0.83).add(phase)).mul(0.12))
    .add(sin(clock.mul(2.1).add(phase.mul(2.3))).mul(0.07));

export const braced = (v: Vec3Node, angle: FloatNode): Vec3Node => {
  const c = cos(angle),
    s = sin(angle);
  return vec3(
    v.x.mul(c).add(v.z.mul(s)),
    v.y,
    v.x.negate().mul(s).add(v.z.mul(c))
  );
};
export const bracedAbout = (
  p: Vec3Node,
  angle: FloatNode,
  pivot: FloatNode | number
): Vec3Node => braced(p.sub(vec3(0, 0, pivot)), angle).add(vec3(0, 0, pivot));

export interface Felt {
  brace: number;
  phase: number;
  wind: Vec3;
  weight: Vec3;
  spin: Vec3;
  spinning: Vec3;
}

export type Cloth = ReturnType<typeof createCloth>;

export function createCloth() {
  const canvas = cutCanvas(),
    n = canvas.count,
    total = BERTHS * n;
  const X = instancedArray(total, 'vec4'),
    Vel = instancedArray(total, 'vec4'),
    P = instancedArray(total, 'vec4');
  const Nrm = instancedArray(total, 'vec4');
  const [tRest, tGrid, tCell, tMast] = [
    canvas.rest,
    canvas.grid,
    canvas.cell,
    canvas.mast,
  ].map((a) => instancedArray(a, 'vec4').toReadOnly());
  const values = Array.from({ length: BERTHS * PARAMS }, () => new Vector4());
  const params = uniformArray<'vec4'>(values, 'vec4');
  const h = uniform(1 / 240);
  const clock = uniform(0);
  const grids = uniformArray<'vec4'>(
    canvas.grids.map((g) => new Vector4(g.first, g.columns, g.rows, g.kind)),
    'vec4'
  );

  const where = () => {
    const id = int(instanceIndex);
    const slot = id.div(n);
    const t = id.sub(slot.mul(n));
    return {
      id,
      slot,
      t,
      base: slot.mul(n),
      p0: params.element(slot.mul(PARAMS)),
    };
  };
  const at = (
    B: StorageBufferNode<'vec4'>,
    base: IntNode,
    g0: IntNode,
    row: IntNode,
    i: IntNode,
    j: IntNode
  ): Vec3Node => B.element(base.add(g0).add(i).add(j.mul(row))).xyz;

  const predict = Fn(() => {
    const { id, slot, t, base, p0 } = where();
    If(p0.x.lessThan(0.5), () => {
      Return();
    });
    const rest = tRest.element(t);
    If(p0.y.greaterThan(0.5), () => {
      X.element(id).assign(vec4(rest.xyz, 1));
      Vel.element(id).assign(vec4(0));
      P.element(id).assign(vec4(rest.xyz, 1));
      Return();
    });
    If(rest.w.lessThan(0.5), () => {
      P.element(id).assign(vec4(rest.xyz, 1));
      Return();
    });
    const g = tGrid.element(t),
      c = tCell.element(t),
      m = tMast.element(t);
    const g0 = int(g.x),
      nu = int(g.y),
      nv = int(g.z),
      row = nu.add(1),
      kind = g.w;
    const i = int(c.x),
      j = int(c.y);
    const x = X.element(id).xyz,
      v = Vel.element(id).xyz;
    const tu = at(X, base, g0, row, minInt(i.add(1), nu), j).sub(
      at(X, base, g0, row, maxInt(i.sub(1), 0), j)
    );
    const tv = at(X, base, g0, row, i, minInt(j.add(1), nv)).sub(
      at(X, base, g0, row, i, maxInt(j.sub(1), 0))
    );
    const nn = cross(tu, tv);
    const normal = nn.div(max(length(nn), 1e-6));
    const p1 = params.element(slot.mul(PARAMS).add(1)),
      p2 = params.element(slot.mul(PARAMS).add(2));
    const spin = params.element(slot.mul(PARAMS).add(3)).xyz,
      spinning = params.element(slot.mul(PARAMS).add(4)).xyz;
    const square = kind.lessThan(CLOTH.lateen - 0.5);
    const angle = select(square, p0.z, float(0));
    const r = bracedAbout(x, angle, m.z);
    const swing = cross(spinning, r).add(cross(spin, cross(spin, r)));
    const weight = braced(p2.xyz.sub(swing), angle.negate());
    const wind = braced(
      p1.xyz.mul(breath(clock, p0.w)).sub(cross(spin, r)),
      angle.negate()
    );
    const flag = kind.greaterThan(CLOTH.pennant - 0.5),
      speed = length(wind),
      down = wind.div(max(speed, 1e-3));
    const along = length(wind.sub(normal.mul(dot(wind, normal))));
    const eddy = speed
      .mul(EDDY)
      .add(along.mul(select(flag, float(LUFF_FLAG), float(LUFF_SAIL))));
    const [k1, k2] = EDDY_WAVES.map((l) => (2 * Math.PI) / l),
      s = dot(x, down),
      ph = p0.w;
    const swirl = normal.mul(
      eddy.mul(
        sin(
          s
            .mul(k1)
            .add(x.y.mul(0.9))
            .sub(clock.mul(speed).mul(k1 * 0.7))
            .add(ph)
        ).add(
          sin(
            s
              .mul(k2)
              .sub(x.y.mul(1.4))
              .sub(clock.mul(speed).mul(k2 * 0.8))
              .add(ph.mul(1.7))
          ).mul(0.5)
        )
      )
    );
    const air = wind.add(swirl).sub(v);
    const through = dot(air, normal);
    const push = normal
      .mul(
        through
          .mul(abs(through))
          .mul(select(flag, float(PRESS_FLAG), float(PRESS_SAIL)))
      )
      .add(
        air
          .mul(length(air))
          .mul(select(flag, float(DRAG_FLAG), float(DRAG_SAIL)))
      );
    const v1 = v.add(push.add(weight).mul(h)).mul(float(1).sub(h.mul(DAMPING)));
    const fast = length(v1);
    const v2 = select(
      fast.greaterThan(FASTEST),
      v1.mul(float(FASTEST).div(fast)),
      v1
    );
    P.element(id).assign(vec4(x.add(v2.mul(h)), 1));
  })().compute(total, [64]);

  const solve = Fn(() => {
    const { id, t, base, p0 } = where();
    If(p0.x.lessThan(0.5).or(p0.y.greaterThan(0.5)), () => {
      Return();
    });
    const rest = tRest.element(t);
    const p = P.element(id).xyz.toVar();
    const before = X.element(id).xyz;
    If(rest.w.lessThan(0.5), () => {
      Vel.element(id).assign(vec4(p.sub(before).div(h), 0));
      X.element(id).assign(vec4(p, 1));
      Return();
    });
    const g = tGrid.element(t),
      c = tCell.element(t),
      m = tMast.element(t);
    const g0 = int(g.x),
      nu = int(g.y),
      nv = int(g.z),
      row = nu.add(1);
    const i = int(c.x),
      j = int(c.y);
    const sum = vec3(0).toVar(),
      count = float(0).toVar();
    const h2 = h.mul(h);
    for (const [di, dj, alpha, counts] of STENCIL) {
      const ii = i.add(di),
        jj = j.add(dj);
      If(
        ii
          .greaterThanEqual(0)
          .and(ii.lessThanEqual(nu))
          .and(jj.greaterThanEqual(0))
          .and(jj.lessThanEqual(nv)),
        () => {
          const tq = g0.add(ii).add(jj.mul(row));
          const q = P.element(base.add(tq)).xyz;
          const restLength = length(tRest.element(tq).xyz.sub(rest.xyz));
          const dv = p.sub(q);
          const len = max(length(dv), 1e-6);
          const C = len.sub(restLength);
          const compliance = select(
            C.lessThan(0),
            float(alpha * (counts ? BUCKLE : 1)),
            float(alpha)
          ).div(h2);
          const dl = C.negate().div(
            float(1).add(tRest.element(tq).w).add(compliance)
          );
          sum.addAssign(dv.div(len).mul(dl));
          if (counts) count.addAssign(1);
        }
      );
    }
    const x = p.add(sum.mul(float(OMEGA).div(max(count, 1)))).toVar();
    const pin = int(c.z);
    If(pin.greaterThanEqual(0), () => {
      const anchor = P.element(base.add(pin)).xyz;
      const off = x.sub(anchor),
        far = length(off),
        most = c.w.mul(1.01);
      If(far.greaterThan(most), () => {
        x.assign(anchor.add(off.mul(most.div(far))));
      });
    });
    If(m.y.greaterThan(0), () => {
      const square = g.w.lessThan(CLOTH.lateen - 0.5);
      const mast = bracedAbout(
        vec3(0, 0, m.x),
        select(square, p0.z.negate(), float(0)),
        m.z
      );
      const dx = x.x.sub(mast.x),
        dz = x.z.sub(mast.z),
        d = max(dx.mul(dx).add(dz.mul(dz)).sqrt(), 1e-5),
        keep = m.y.add(CLEAR);
      If(d.lessThan(keep), () => {
        x.assign(
          vec3(
            mast.x.add(dx.mul(keep.div(d))),
            x.y,
            mast.z.add(dz.mul(keep.div(d)))
          )
        );
      });
    });
    Vel.element(id).assign(vec4(x.sub(before).div(h), 0));
    X.element(id).assign(vec4(x, 1));
  })().compute(total, [64]);

  const normals = Fn(() => {
    const { id, t, base, p0 } = where();
    If(p0.x.lessThan(0.5), () => {
      Return();
    });
    const g = tGrid.element(t),
      c = tCell.element(t),
      m = tMast.element(t);
    const g0 = int(g.x),
      nu = int(g.y),
      nv = int(g.z),
      row = nu.add(1),
      kind = g.w;
    const i = int(c.x),
      j = int(c.y);
    const ju = select(
      kind
        .greaterThan(CLOTH.lateen - 0.5)
        .and(kind.lessThan(CLOTH.lateen + 0.5))
        .and(j.equal(nv)),
      nv.sub(1),
      j
    );
    const iv = select(
      kind.greaterThan(CLOTH.pennant - 0.5).and(i.equal(nu)),
      nu.sub(1),
      i
    );
    const du = at(X, base, g0, row, minInt(i.add(1), nu), ju).sub(
      at(X, base, g0, row, maxInt(i.sub(1), 0), ju)
    );
    const dv = at(X, base, g0, row, iv, minInt(j.add(1), nv)).sub(
      at(X, base, g0, row, iv, maxInt(j.sub(1), 0))
    );
    Nrm.element(id).assign(vec4(normalize(cross(dv, du)).mul(m.w), 0));
  })().compute(total, [64]);

  const steps = [
    ...Array.from({ length: SUBSTEPS }, () => [predict, solve]).flat(),
    normals,
  ];
  const due: Compute[] = [steps],
    idle: Compute[] = [];
  let live = false;
  const put = (k: number, v: Vec3) => values[k].set(v[0], v[1], v[2], 0);

  return {
    count: n,
    positions: X.value,
    normals: Nrm.value,
    grids,
    clock,
    set(k: number, felt: Felt | null, fresh = false) {
      const o = k * PARAMS;
      if (!felt) {
        values[o].set(0, 0, 0, 0);
        return;
      }
      values[o].set(1, fresh ? 1 : 0, felt.brace, felt.phase);
      put(o + 1, felt.wind);
      put(o + 2, felt.weight);
      put(o + 3, felt.spin);
      put(o + 4, felt.spinning);
      live = true;
    },
    update(dt: number): Compute[] {
      clock.value += dt;
      if (!live || dt <= 0) return idle;
      h.value = Math.min(dt, LONGEST) / SUBSTEPS;
      live = false;
      return due;
    },
  };
}
