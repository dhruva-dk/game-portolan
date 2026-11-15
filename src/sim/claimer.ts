// A bot's water (territory.ts): the loops she sails to claim more of it, her going home to it to get her shield back,
// and her cutting another ship's open trail. The first game's captains' bites (agent-initial src/bots.ts: out, across,
// back), weighed among her other options (bot.ts) by the same utility scoring:
// - claim: from inside her water, a bite: out past her edge along a bearing open and inside the storm, across, and
//   back in a little way inside the edge she left by. Sooner the more she wants water (Temper claim) and the fewer
//   ships about; out, with her trail open, finishing it comes first (only the storm, a fight or a run outrank it), and
//   a ship near her sends her straight home to close it. A cut or a closed loop ends the bite, and she rests a while;
//   cut, she goes back in before she sets out again.
// - home: her shield down from a fight (shot within `fresh` s, or her hull hurt) and her water in reach, she goes back
//   in and circles there, way kept on, while it comes back (handling.ts HOLDING); not with the storm on her water, nor
//   at the start, when no ship has a shield yet.
// - cut: another's open trail near her, at a point she would reach before its ship could be back in her own water
//   (the trail's first point, where she left it), she sails across it.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs, to the bit.

import { apart, distance, along, type Vec3 } from '../world/sphere.ts';
import { ours, type Waters } from './holding.ts';
import { STORM, toEdge } from './storm.ts';
import { ramp, utility } from './utility.ts';
import { BOT, between, fitOf, mates, open, rotate, toward, type Ctx } from './captain.ts';

/** Everything a bot's water is tuned by. Metres and seconds; new, as 0117's captains held none. */
export const CLAIMER = {
  /** A bite reaches `depth` m past her edge and runs `width` m along it, from timid to greedy (the first game's middle
   *  styles' 16–34 and 16–34 units, at 1.5–2.5 m a unit); the edge looked for every `probe` m, out to `edgeMost`; the
   *  way back ends `inside` m in from it. */
  depth: [30, 90] as const, width: [30, 80] as const, probe: 5, edgeMost: 200, inside: 10,
  /** A bite's marks are reached within `arrive` m. A bite done (closed or cut), she rests `rest` s, less the greedier. */
  arrive: 14, rest: [4, 16] as const,
  /** A ship within `danger` m sends her home to close her trail; none within `clear` m, she sets out freely. */
  danger: 110, clear: 160,
  /** How much a bite in hand counts, and a new one at most (by her greed). */
  out: 0.75, setOut: 0.45,
  /** Home: her shield under `low` wants it wholly, over `full` not at all; her water out of reach past `far` m. */
  low: 30, full: 90, far: 260, near: 120, need: 0.7, fresh: [40, 15] as const, hurt: [85, 50] as const,
  /** In her water she circles on a mark this far ahead, turned to her side. */
  round: 22,
  /** Cut: a trail point within `reach` m, looked at every `stride` points, she must reach `lead` s before its ship could
   *  be home; she aims `past` m beyond it, to be sure of crossing. A trail of fewer than `least` points is left be. */
  reach: 130, stride: 3, lead: 2, past: 10, least: 6, cut: 0.6,
} as const;

/** Who holds the sea, as a bot knows it (territory.ts): who holds the water at a point (her id, −1 none) and of what
 *  side (holding.ts Waters), and each ship's open trail. Her side's water is her own. */
export interface Holdings extends Waters {
  trail(id: number): { readonly serial: number; readonly points: readonly Vec3[] };
}

/** Whether the water at p is hers (or her side's). */
const hers = (c: Ctx, p: Vec3) => !!c.sea.holdings && ours(c.sea.holdings, p, c.own);

/** Notes where she last lay in her own water (each step). */
export function sound(c: Ctx): void {
  if (hers(c, c.own.ship.at)) c.m.haven = c.own.ship.at;
}

/** Whether she lies in her own water. */
export const inOwn = (c: Ctx) => hers(c, c.own.ship.at);
/** Whether her trail is open: she is out of her water laying one. */
const outward = (c: Ctx) => !!c.sea.holdings && c.sea.holdings.trail(c.own.id).points.length > 0;
/** The distance to the nearest other ship. */
const nearest = (c: Ctx) => c.others.reduce((d, o) => Math.min(d, distance(c.own.ship.at, o.ship.at)), Infinity);

// ---------------------------------------------------------------- claiming

/** How much she wants to sail a loop now. */
export function claimUrge(c: Ctx): number {
  const { m } = c;
  if (!c.sea.holdings) return 0;
  if (outward(c) && m.bite) return CLAIMER.out;
  if (m.clock < m.rested || (c.sea.storm && c.sea.storm.phase >= STORM.phases.length)) return 0;
  return CLAIMER.setOut * utility(c.t.claim, ramp(nearest(c), CLAIMER.danger, CLAIMER.clear), ramp(distance(c.own.ship.at, m.haven), CLAIMER.far, CLAIMER.near));
}

/** Plans a bite out from her water at p along a bearing that is open and inside the storm, or null if she finds none. */
function plan(c: Ctx, p: Vec3): Vec3[] | null {
  const s = c.sea.storm, greed = c.t.claim, f = c.own.ship.heading;
  const depth = CLAIMER.depth[0] + (CLAIMER.depth[1] - CLAIMER.depth[0]) * greed * between(c.m, 0.6, 1);
  const width = CLAIMER.width[0] + (CLAIMER.width[1] - CLAIMER.width[0]) * greed * between(c.m, 0.6, 1);
  const kept = (q: Vec3) => open(c, q) && (!s || toEdge(q, s) > c.t.margin);
  const start = between(c.m, -Math.PI, Math.PI), flank = c.m.rand & 1 ? 1 : -1;
  for (let k = 0; k < 8; k++) {
    const dir = rotate(p, f, start + (k * Math.PI) / 4);
    let edge = CLAIMER.probe;
    while (edge < CLAIMER.edgeMost && hers(c, along(p, dir, edge).p)) edge += CLAIMER.probe;
    if (edge >= CLAIMER.edgeMost) continue;
    const gate = along(p, dir, edge).p, out = along(p, dir, edge + depth);
    const across = toward(out.p, gate), side = across && rotate(out.p, across, (flank * Math.PI) / 2);
    if (!side) continue;
    const a = out.p, b = along(a, side, width).p, back = toward(b, gate);
    if (!back) continue;
    const home = along(gate, toward(gate, p) ?? dir, CLAIMER.inside).p;
    const turn = along(b, back, distance(b, gate) * 0.5).p;
    if ([a, b, turn].every(kept)) return [a, b, turn, home];
  }
  return null;
}

/** Sails her bite: planned from inside her water, its marks in turn, and home at once with a ship near her. */
export function claimAct(c: Ctx): void {
  const { m } = c, p = c.own.ship.at, home = inOwn(c), out = outward(c);
  // back in with her loop closed, or her trail cut out there: the bite is done
  if (m.bite && ((home && m.leg > 0) || (!home && !out && m.leg > 0))) {
    m.bite = null;
    m.rested = m.clock + CLAIMER.rest[1] - (CLAIMER.rest[1] - CLAIMER.rest[0]) * c.t.claim;
  }
  if (!m.bite) {
    if (!home) {
      m.goal = m.haven;
      return;
    }
    m.bite = plan(c, p);
    m.leg = 0;
    if (!m.bite) {
      m.rested = m.clock + CLAIMER.rest[1];
      m.goal = circle(c);
      return;
    }
  }
  if (out && m.leg < m.bite.length - 1 && nearest(c) < CLAIMER.danger) m.leg = m.bite.length - 1;
  while (m.leg < m.bite.length - 1 && distance(p, m.bite[m.leg]) < CLAIMER.arrive) m.leg++;
  m.goal = m.bite[m.leg];
}

// ---------------------------------------------------------------- home

/** How much she wants to go home to get her shield back: none with the storm on her water. */
export function homeUrge(c: Ctx): number {
  if (!c.sea.holdings || (c.sea.storm && toEdge(c.m.haven, c.sea.storm) < c.t.margin)) return 0;
  const shield = c.own.shield ?? 0, d = inOwn(c) ? 0 : distance(c.own.ship.at, c.m.haven);
  const fought = Math.max(ramp(c.m.clock - c.m.shotT, ...CLAIMER.fresh), ramp(c.own.hull ?? fitOf(c.own).hull, ...CLAIMER.hurt));
  return CLAIMER.need * utility(ramp(shield, CLAIMER.full, CLAIMER.low), fought, ramp(d, CLAIMER.far, CLAIMER.near), ramp(c.foeD, 40, 120));
}

/** Goes home, and circles there while her shield comes back. */
export function homeAct(c: Ctx): void {
  c.m.goal = inOwn(c) ? circle(c) : c.m.haven;
}

/** A mark `round` m ahead and turned to her side, in her own water and open: she keeps way on in it, no sitting target
 *  (the other side, else straight on, if none to her side is). */
export function circle(c: Ctx): Vec3 {
  const p = c.own.ship.at, f = c.own.ship.heading, side = c.m.rand & 1 ? 1 : -1;
  for (const a of [0.6, 1.1, 1.7, -0.6, -1.1, -1.7, 2.4, -2.4]) {
    const q = along(p, rotate(p, f, side * a), CLAIMER.round).p;
    if (hers(c, q) && open(c, q)) return q;
  }
  return along(p, f, CLAIMER.round).p;
}

// ---------------------------------------------------------------- cutting

/** The point of another's open trail she would cut, and how much she wants to; or null. */
function prey(c: Ctx): { at: Vec3; score: number } | null {
  const h = c.sea.holdings;
  if (!h) return null;
  const p = c.own.ship.at;
  let best: { at: Vec3; score: number } | null = null;
  for (const o of c.others) {
    if (mates(c.own, o) || apart(p, o.ship.at, BOT.sightMax + CLAIMER.reach) || distance(p, o.ship.at) > BOT.sightMax + CLAIMER.reach) continue;
    const pts = h.trail(o.id).points;
    if (pts.length < CLAIMER.least) continue;
    const back = distance(o.ship.at, pts[0]) / (fitOf(o).top * 1.1);
    for (let k = 0; k < pts.length - 4; k += CLAIMER.stride) {
      if (apart(p, pts[k], CLAIMER.reach)) continue;
      const d = distance(p, pts[k]);
      if (d > CLAIMER.reach || d / fitOf(c.own).top + CLAIMER.lead > back) continue;
      const score = ramp(d, CLAIMER.reach, 20) * ramp(pts.length, CLAIMER.least, 40);
      if (!best || score > best.score) best = { at: pts[k], score };
    }
  }
  return best;
}

/** How much she wants to cut another's trail. */
export function cutUrge(c: Ctx): number {
  const q = prey(c);
  return q ? CLAIMER.cut * utility(q.score, 0.4 + 0.6 * c.t.aggro) : 0;
}

/** Makes across the trail she would cut. */
export function cutAct(c: Ctx): void {
  const q = prey(c), p = c.own.ship.at;
  if (!q) return;
  const t = toward(p, q.at);
  c.m.goal = t ? along(p, t, distance(p, q.at) + CLAIMER.past).p : q.at;
}
