// A bot's storm option (bot.ts weighs it first): how urgently she must get
// inside the cap, where she makes for to be in it, and how a mark any other
// option gives her is kept her temperament's margin inside its edge. Close to
// its edge or outside it, or with the next cap closing or nearly due and her
// not well inside it, she makes for the water her margin inside the cap she
// must be in; running she runs no nearer the edge than that (keptInside).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { R, along, distance, toward, type Vec3 } from '../world/sphere.ts';
import { downTo, fieldAt } from './route.ts';
import { toEdge, type Cap, type Storm } from './storm.ts';
import { ramp } from './utility.ts';
import { open, rotate, type Ctx } from './captain.ts';

/**
 * The storm, by her temperament's margin (Temper): the next cap is `late` when
 * it is closing or due to within this many s; getting inside is urgent from
 * `ease[0]` of her margin in from the edge, wholly by `ease[1]`; late, she is
 * well inside the next cap `inNext` of her margin in. Within `nearEdge` of her
 * margin of the edge she makes for the cap she is in, else for the next. Making
 * in, she makes for open water `inward` of the way out from the centre to her
 * edge less her margin, found within `shore` m of it in rings `ring` m apart (20
 * of them).
 */
export const STORMING = {
  late: 25,
  ease: [0.55, 0.3] as const,
  inNext: 0.5,
  nearEdge: 0.4,
  inward: 0.6,
  shore: 136,
  ring: 6.8,
  /**
   * With the chart's way into the next cap's heart (Sea calm), how far in she
   * is is reckoned by water: the way's cost short of the heart's edge, from the
   * cap's edge. Making in, she makes down that way to where it costs her
   * margin in from the edge, and deeper by up to `deeper` of what lies past
   * that, the more of `ahead` s are left before the cap has closed (a close
   * not yet begun counted as `closing` s); `most` cells looked down it at a
   * think.
   */
  deeper: 0.5,
  ahead: 40,
  closing: 20,
  most: 40,
} as const;

/** Metres the cap reaches along the surface from its centre. */
export const reach = (cap: Cap) => cap.radius * R;

/** Whether the next cap is closing, or will start to within STORMING.late s. */
export const late = (c: Ctx) =>
  !!c.sea.storm &&
  (c.sea.storm.closing || c.sea.storm.secondsToNext < c.b.storming.late);

/**
 * How urgently she must get inside: from nothing `ease[0]` of her margin in
 * from the edge to wholly at `ease[1]` of it (and outside); and wholly while
 * the next cap is late and she isn't `inNext` of her margin inside it, until
 * the last has closed.
 */
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

/**
 * Open water at q, or the nearest to it in rings `ring` m apart out to `shore`
 * m, 16 ways round each; q itself if there is none.
 */
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

/**
 * Where she makes for to be within `r` m of `centre`: where she is, if she is;
 * else open water `inward` of the way out from the centre toward her.
 */
export function inward(c: Ctx, p: Vec3, centre: Vec3, r: number): Vec3 {
  if (distance(p, centre) <= r) return p;
  const t = toward(centre, p);
  return openNear(c, t ? along(centre, t, r * c.b.storming.inward).p : centre);
}

/**
 * The chart's way into this cap's heart (Sea calm), if she has it: the next
 * cap's, once found; null for any other cap, or with no chart.
 */
function calmOf(c: Ctx, cap: Cap) {
  const k = c.sea.calm,
    ch = c.sea.chart;
  return k &&
    ch &&
    k.cap.radius === cap.radius &&
    k.cap.centre[0] === cap.centre[0] &&
    k.cap.centre[1] === cap.centre[1] &&
    k.cap.centre[2] === cap.centre[2]
    ? { ch, field: k.field, gap: reach(cap) - k.heart }
    : null;
}

/**
 * How far inside the next cap she is, m: by the chart's way into its heart
 * when she has it (the way's cost short of the heart's edge from the cap's
 * edge, so water in a bay far round by sea from the heart is reckoned outside,
 * however near the heart it lies), and as the crow flies otherwise, or if
 * that is less.
 */
function inNext(c: Ctx, next: Cap): number {
  const p = c.own.ship.at,
    edge = toEdge(p, next),
    k = calmOf(c, next);
  return k ? Math.min(edge, k.gap - fieldAt(k.ch, k.field, p)) : edge;
}

/**
 * Where she makes for to be inside the next cap, by the chart's way into its
 * heart: where the way costs her margin in from the cap's edge, deeper the
 * more time is left before it has closed; where she is, if she is in that
 * far. Null with no way (none found yet, or none reaching her).
 */
function downCalm(c: Ctx, s: Storm): Vec3 | null {
  const k = calmOf(c, s.next);
  if (!k) return null;
  const st = c.b.storming,
    left = s.secondsToNext + (s.closing ? 0 : st.closing),
    deep = st.deeper * Math.min(1, left / st.ahead),
    until = Math.max(0, k.gap - c.t.margin) * (1 - deep),
    p = c.own.ship.at;
  if (fieldAt(k.ch, k.field, p) <= until) return p;
  return downTo(k.ch, k.field, p, until, st.most);
}

/**
 * The cap she makes for in the storm: the one she is in, while it isn't late or
 * she is near its edge; else the next, down the chart's way into its heart
 * when she has it. (Where she is, with no storm: its urge is nothing then, so
 * it is never chosen.)
 */
export function stormGoal(c: Ctx): Vec3 {
  const s = c.sea.storm,
    margin = c.t.margin,
    p = c.own.ship.at;
  if (!s) return p;
  const cap: Cap =
    toEdge(p, s) < margin * c.b.storming.nearEdge || !late(c) ? s : s.next;
  return (
    (cap === s.next && downCalm(c, s)) ||
    inward(c, p, cap.centre, Math.max(0, reach(cap) - margin))
  );
}

/**
 * Pulls a mark she would make for that lies nearer the edge than her margin in
 * to that margin inside it.
 */
export const keptInside = (c: Ctx, q: Vec3): Vec3 => {
  const s = c.sea.storm;
  return s && toEdge(q, s) < c.t.margin
    ? inward(c, q, s.centre, Math.max(0, reach(s) - c.t.margin))
    : q;
};
