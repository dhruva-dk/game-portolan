import {
  Break,
  If,
  acos,
  atan,
  clamp,
  cos,
  dot,
  exp,
  float,
  length,
  max,
  min,
  mix,
  normalize,
  select,
  sin,
  smoothstep,
  texture3D,
  vec3,
} from 'three/tsl';
import type { Storage3DTexture } from 'three/webgpu';
import { CLOUD } from '../sim/storm.ts';
import { R } from '../world/sphere.ts';
import {
  henyeyGreenstein,
  loop,
  type FloatNode,
  type Vec3Node,
} from '../tsl.ts';

export const BASE = CLOUD.base;
const ROLL = 9,
  ROLL_WIDTH = 26,
  BASE_BILLOW = 5;
const SHELF = -12,
  LEAN = 0.8,
  FACE = 34;
const BAY = 40,
  WAVES = [140, 61] as const;
const CROWN = 260,
  CROWN_BILLOW = 60;
export const TOP = CROWN + CROWN_BILLOW + 10;
const CLOUD_TILE = 210,
  CHURN = [0.6, 0.35, 0.2] as const;
const FINE = 0.29,
  SLOPE = 5;
const RAIN_TILE = 90,
  RAIN_LONG = 520,
  RAIN_LEAN = 0.25,
  FALL = 11,
  RAIN_RAMP = 10;
const RAIN_THIN = 1 / 300,
  RAIN_HEAVY = 1 / 45;
const STEP = 5,
  GROW = 0.035,
  STEPS = 28;
const SOFT = 1,
  SOFT_FAR = 0.004;
const DARK = 0.45,
  BRIGHT = 2.6,
  RAIN_LIGHT = 0.95;
const CALM = 0.3;
const SKY = 0.6,
  SKY_UP = 0.45,
  SKY_LEAST = 0.3;
const HOLLOWS = { per: 0.3, mean: 0.9, least: 0.7, most: 1.2 } as const;
const SUNLIT = 0.55,
  LINING = 0.15,
  LINING_G = 0.6;

interface CapNodes {
  center: Vec3Node;
  radius: FloatNode;
  whole: FloatNode;
  clock: FloatNode;
  across: [Vec3Node, Vec3Node];
  size: FloatNode;
}

export interface FieldLight {
  air: Vec3Node;
  sun: Vec3Node;
  toward: Vec3Node;
  glow(q: Vec3Node): Vec3Node;
}

interface Marched {
  light: Vec3Node;
  T: FloatNode;
  reached: FloatNode;
  atMark: FloatNode;
}

export function createStormField(cap: CapNodes, shape: Storage3DTexture) {
  const edge = (u: Vec3Node): FloatNode =>
    acos(clamp(dot(u, cap.center), -1, 1))
      .sub(cap.radius)
      .mul(R)
      .sub(cap.whole.mul(1e4));
  const OUTERMOST = SHELF - FACE - BAY * 0.6;
  const churn = vec3(...CHURN).mul(cap.clock);

  const billows = (q: Vec3Node): FloatNode => {
    const n = texture3D(shape, q.add(churn).div(CLOUD_TILE)).level(float(0));
    const f = texture3D(shape, q.sub(churn).div(CLOUD_TILE * FINE)).level(
      float(0)
    );
    return n.r.mul(0.55).add(n.b.mul(0.15)).add(f.r.mul(0.3)).sub(0.4).mul(2.8);
  };

  const cloudAt = (q: Vec3Node, up: Vec3Node, h: FloatNode, e: FloatNode) => {
    const lift = billows(q);
    const roll = e.mul((2 * Math.PI) / ROLL_WIDTH).add(lift.mul(2));
    const base = float(BASE).add(sin(roll).mul(ROLL));
    const reach = mix(0.45, 1, smoothstep(BASE, CROWN * 0.7, h));
    const along = atan(dot(up, cap.across[0]), dot(up, cap.across[1])).mul(
      cap.size
    );
    const bay = sin(along.div(WAVES[0]))
      .mul(0.6)
      .add(sin(along.div(WAVES[1]).add(1.3)).mul(0.4))
      .add(0.4)
      .mul(BAY);
    const front = float(SHELF)
      .add(max(h.sub(base), 0).mul(LEAN))
      .add(bay.mul(mix(0.4, 1, smoothstep(BASE, BASE + 50, h))));
    const face = e.sub(front).add(lift.mul(FACE).mul(reach));
    const top = float(CROWN).add(lift.mul(CROWN_BILLOW)).sub(h);
    const under = h.sub(base).add(lift.mul(BASE_BILLOW)).mul(1.5);
    const rolling = cos(roll).mul((ROLL * 2 * Math.PI) / ROLL_WIDTH);
    return {
      lift,
      reach,
      face,
      top,
      under,
      rolling,
      inside: min(min(face, top), under),
    };
  };

  const shade = (q: Vec3Node, d: Vec3Node, lit: FieldLight): Vec3Node => {
    const up = normalize(q),
      h = length(q).sub(R);
    const c = cloudAt(q, up, h, edge(up));
    const out = normalize(up.mul(dot(up, cap.center)).sub(cap.center));
    const onTop = c.top.lessThan(min(c.face, c.under)),
      onBase = c.under.lessThan(c.face);
    const flat = select(
      onTop,
      up,
      select(
        onBase,
        normalize(up.negate().add(out.mul(c.rolling))),
        normalize(up.mul(LEAN).sub(out))
      )
    );
    const slope = vec3(
      billows(q.add(vec3(SLOPE, 0, 0))),
      billows(q.add(vec3(0, SLOPE, 0))),
      billows(q.add(vec3(0, 0, SLOPE)))
    )
      .sub(c.lift)
      .div(SLOPE);
    const amplitude = select(
      onTop,
      float(CROWN_BILLOW),
      select(onBase, float(BASE_BILLOW), c.reach.mul(FACE))
    );
    const normal = normalize(flat.sub(slope.mul(amplitude)));
    const high = smoothstep(BASE, CROWN, h);
    const hollows = clamp(
      c.lift.mul(HOLLOWS.per).add(HOLLOWS.mean),
      HOLLOWS.least,
      HOLLOWS.most
    );
    const sky = max(dot(normal, up).mul(SKY_UP).add(SKY), SKY_LEAST).mul(
      hollows
    );
    const calm = clamp(dot(normal, out.negate()), 0, 1).mul(CALM);
    const air = lit.air.mul(mix(DARK, BRIGHT, high).mul(sky).add(calm));
    const sun = lit.sun.mul(
      clamp(dot(normal, lit.toward), 0, 1)
        .mul(high)
        .mul(SUNLIT / Math.PI)
    );
    const edgeOn = float(1).sub(clamp(dot(normal, d.negate()), 0, 1));
    const lining = lit.sun
      .mul(
        henyeyGreenstein(dot(d, lit.toward), LINING_G).mul(LINING * 4 * Math.PI)
      )
      .mul(high)
      .mul(edgeOn);
    return air.add(sun).add(lining).add(lit.glow(q));
  };

  const march = (
    o: Vec3Node,
    d: Vec3Node,
    from: FloatNode,
    to: FloatNode,
    jitter: FloatNode,
    mark: FloatNode,
    lit: FieldLight
  ): Marched => {
    const L = vec3(0).toVar(),
      T = float(1).toVar(),
      atMark = float(1).toVar();
    const t = from.add(jitter.mul(STEP)).toVar();
    const hit = float(0).toVar(),
      where = o.toVar(),
      miss = float(1e4).toVar();
    const before = float(-1e4).toVar(),
      last = float(0).toVar();
    loop('storm', STEPS, () => {
      If(
        t.greaterThanEqual(to).or(T.lessThan(0.02)).or(hit.greaterThan(0)),
        () => {
          Break();
        }
      );
      const q = o.add(d.mul(t)).toVar();
      const r = length(q),
        up = q.div(r).toVar(),
        h = r.sub(R).toVar();
      const e = edge(up).toVar();
      const inStep = float(STEP).add(t.mul(GROW));
      const least = max(t.mul(SOFT_FAR), 0.6);
      const frontOut = float(OUTERMOST).add(
        max(h.sub(BASE + ROLL), 0).mul(LEAN)
      );
      const cloudOff = max(
        max(
          frontOut.sub(e).mul(1 / Math.hypot(1, LEAN)),
          h.sub(CROWN + CROWN_BILLOW)
        ),
        float(BASE - ROLL - 4).sub(h)
      );
      const rainOff = max(float(-RAIN_RAMP * 0.5).sub(e), h.sub(BASE + ROLL));
      const step = max(min(cloudOff, rainOff), least).toVar();
      const inside = float(-1e4).toVar();
      If(step.lessThan(inStep), () => {
        If(cloudOff.lessThan(inStep), () => {
          inside.assign(cloudAt(q, up, h, e).inside);
          If(inside.greaterThan(0), () => {
            const back = select(
              before.greaterThan(-1e3),
              last.mul(inside.div(inside.sub(before))),
              float(0)
            );
            where.assign(q.sub(d.mul(back)));
            hit.assign(1);
          }).Else(() => {
            const near = inside.negate().div(max(t.mul(SOFT_FAR), SOFT));
            If(near.lessThan(miss), () => {
              miss.assign(near);
              where.assign(q);
            });
          });
        });
        If(hit.equal(0), () => {
          const rho = float(0).toVar(),
            shaft = float(0).toVar(),
            streak = float(0).toVar();
          If(rainOff.lessThan(inStep), () => {
            const across = up
              .mul(R / RAIN_TILE)
              .add(
                vec3(
                  h.mul(RAIN_LEAN / RAIN_TILE),
                  h.add(cap.clock.mul(FALL)).div(RAIN_LONG),
                  0
                )
              );
            const n = texture3D(shape, across).level(float(0));
            shaft.assign(smoothstep(0.3, 0.7, n.r));
            streak.assign(smoothstep(0.35, 0.85, n.a));
            const ramp = smoothstep(0, RAIN_RAMP, e.add(n.g.sub(0.5).mul(8)));
            const underBase = smoothstep(BASE + ROLL, BASE - ROLL, h);
            rho.assign(
              mix(RAIN_THIN, RAIN_HEAVY, shaft)
                .mul(streak.mul(0.8).add(0.6))
                .mul(ramp)
                .mul(underBase)
            );
          });
          step.assign(
            select(
              rho.greaterThan(1e-6),
              inStep,
              max(min(inside.negate().mul(0.6), rainOff.add(inStep)), least)
            )
          );
          If(rho.greaterThan(1e-6), () => {
            const S = lit.air
              .mul(RAIN_LIGHT)
              .mul(mix(1.25, 0.55, shaft))
              .mul(streak.mul(0.35).add(0.85))
              .mul(mix(1.15, 0.6, smoothstep(0, BASE, h)))
              .add(lit.glow(q));
            const stepT = exp(rho.mul(step).negate());
            L.addAssign(S.mul(T.mul(float(1).sub(stepT))));
            T.mulAssign(stepT);
          });
        });
      });
      If(t.lessThan(mark), () => {
        atMark.assign(T);
      });
      before.assign(inside);
      last.assign(step);
      t.addAssign(step);
    });
    const cover = select(
      hit.greaterThan(0),
      float(1),
      float(1).sub(smoothstep(0, 1, miss))
    ).toVar();
    If(cover.greaterThan(0), () => {
      L.addAssign(shade(where, d, lit).mul(T.mul(cover)));
      T.mulAssign(float(1).sub(cover));
    });
    const reached = min(t, to).toVar();
    const end = o.add(d.mul(reached)),
      up = normalize(end),
      h = length(end).sub(R);
    const solid = smoothstep(
      -FACE,
      FACE * 0.3,
      edge(up).sub(float(SHELF).add(max(h.sub(BASE), 0).mul(LEAN)))
    )
      .mul(smoothstep(BASE - ROLL, BASE + ROLL, h))
      .mul(
        smoothstep(CROWN + CROWN_BILLOW * 0.5, CROWN - CROWN_BILLOW * 0.5, h)
      )
      .mul(select(t.lessThan(to), float(1), float(0)));
    const body = lit.air.mul(
      mix(DARK, BRIGHT, smoothstep(BASE, CROWN, h)).mul(0.6)
    );
    return {
      light: L.add(body.mul(T.mul(solid))),
      T: T.mul(float(1).sub(solid)),
      reached,
      atMark,
    };
  };

  return { edge, march, OUTERMOST };
}
