import { R, along, distance, toward, type Vec3 } from '../world/sphere.ts';
import { downTo, fieldAt } from './route.ts';
import { toEdge, type Cap, type Storm } from './storm.ts';
import { ramp } from './utility.ts';
import { open, rotate, type Ctx } from './captain.ts';

export const STORMING = {
  ease: [0.55, 0.3] as const,
  inNext: 0.5,
  nearEdge: 0.4,
  inward: 0.6,
  shore: 136,
  ring: 6.8,
  deeper: 0.5,
  ahead: 40,
  most: 40,
} as const;

export const reach = (cap: Cap) => cap.radius * R;

export const late = (c: Ctx) =>
  !!c.sea.storm &&
  (c.sea.storm.closing || c.sea.storm.secondsToNext < c.t.setOff);

export function stormUrge(c: Ctx): number {
  const s = c.sea.storm;
  if (!s) return 0;
  const p = c.own.ship.at,
    margin = c.t.margin;
  const pressed =
    late(c) && inNext(c, s.next) < margin * c.b.storming.inNext && !s.final;
  return Math.max(
    ramp(
      toEdge(p, s),
      margin * c.b.storming.ease[0],
      margin * c.b.storming.ease[1]
    ),
    pressed ? 1 : 0
  );
}

function openNear(c: Ctx, q: Vec3): Vec3 {
  if (open(c, q)) return q;
  const t = toward(q, c.own.ship.at) ?? c.own.ship.heading;
  for (
    let d = c.b.storming.ring;
    d <= c.b.storming.shore;
    d += c.b.storming.ring
  ) {
    for (let k = 0; k < 16; k++) {
      const p = along(q, rotate(q, t, (k * Math.PI) / 8), d).p;
      if (open(c, p)) return p;
    }
  }
  return q;
}

export function inward(c: Ctx, p: Vec3, center: Vec3, r: number): Vec3 {
  if (distance(p, center) <= r) return p;
  const t = toward(center, p);
  return openNear(c, t ? along(center, t, r * c.b.storming.inward).p : center);
}

function calmOf(c: Ctx, cap: Cap) {
  const k = c.sea.calm,
    ch = c.sea.chart;
  return k &&
    ch &&
    k.cap.radius === cap.radius &&
    k.cap.center[0] === cap.center[0] &&
    k.cap.center[1] === cap.center[1] &&
    k.cap.center[2] === cap.center[2]
    ? { ch, field: k.field, gap: reach(cap) - k.heart }
    : null;
}

function inNext(c: Ctx, next: Cap): number {
  const p = c.own.ship.at,
    edge = toEdge(p, next),
    k = calmOf(c, next);
  return k ? Math.min(edge, k.gap - fieldAt(k.ch, k.field, p)) : edge;
}

function downCalm(c: Ctx, s: Storm): Vec3 | null {
  const k = calmOf(c, s.next);
  if (!k) return null;
  const st = c.b.storming,
    deep = st.deeper * Math.min(1, s.secondsToShut / st.ahead),
    until = Math.max(0, k.gap - c.t.margin) * (1 - deep),
    p = c.own.ship.at;
  if (fieldAt(k.ch, k.field, p) <= until) return p;
  return downTo(k.ch, k.field, p, until, st.most);
}

export function stormGoal(c: Ctx): Vec3 {
  const s = c.sea.storm,
    margin = c.t.margin,
    p = c.own.ship.at;
  if (!s) return p;
  const cap: Cap =
    toEdge(p, s) < margin * c.b.storming.nearEdge || !late(c) ? s : s.next;
  return (
    (cap === s.next && downCalm(c, s)) ||
    inward(c, p, cap.center, Math.max(0, reach(cap) - margin))
  );
}

export const keptInside = (c: Ctx, q: Vec3): Vec3 => {
  const s = c.sea.storm;
  return s && toEdge(q, s) < c.t.margin
    ? inward(c, q, s.center, Math.max(0, reach(s) - c.t.margin))
    : q;
};
