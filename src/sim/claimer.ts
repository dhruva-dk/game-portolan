// A bot's water (territory.ts): the loops she sails to claim more of it. She
// paints her water wherever she sails; a loop closed fills in what it fences
// off. Her claims are bites (out, across, back), weighed among her other
// options (bot.ts) by the same utility scoring:
// - claim: a bite out past the edge of her water along a bearing open and
//   inside the storm, across, and back in a little way inside the edge she
//   left by. Sooner the more she wants water (Temper claim) and the fewer ships
//   about; a bite begun, finishing it comes first (only the storm, a fight or a
//   run outrank it). Back at its last mark the bite is done, and she rests a
//   while.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { distance, along, toward, type Vec3 } from '../world/sphere.ts';
import { STORM, toEdge } from './storm.ts';
import { ramp, utility } from './utility.ts';
import { between, open, rotate, type Ctx } from './captain.ts';

/** Everything a bot's water is tuned by. Metres and seconds. */
const CLAIMER = {
  /**
   * A bite reaches `depth` m past her edge and runs `width` m along it, from
   * timid to greedy (some 16–34 units out and 16–34 along, at 1.5–2.5 m a
   * unit); the edge looked for every `probe` m, out to `edgeMost`; the way back
   * ends `inside` m in from it.
   */
  depth: [30, 90] as const,
  width: [30, 80] as const,
  probe: 5,
  edgeMost: 200,
  inside: 10,
  /**
   * A bite's marks are reached within `arrive` m. A bite done, she rests `rest`
   * s, less the greedier.
   */
  arrive: 14,
  rest: [4, 16] as const,
  /**
   * A ship within `danger` m keeps her from setting out; none within `clear`
   * m, she sets out freely.
   */
  danger: 110,
  clear: 160,
  /** How much a bite in hand counts, and a new one at most (by her greed). */
  out: 0.75,
  setOut: 0.45,
  /**
   * With no bite to sail, she circles on a mark `round` m ahead, turned to her
   * side, her water `past` m beyond it.
   */
  round: 22,
  past: 10,
} as const;

/**
 * Who holds the sea, as a bot knows it (territory.ts): who holds the water at a
 * point (her id, −1 none).
 */
export interface Holdings {
  ownerAt(p: Vec3): number;
}

/**
 * What her claimer carries: the bite she sails (its marks), the one she makes
 * for, and when she may set out on the next.
 */
export interface ClaimMemory {
  bite: Vec3[] | null;
  leg: number;
  rested: number;
}

/** A claimer's memory as she puts to sea. */
export const claimMemory = (): ClaimMemory => ({
  bite: null,
  leg: 0,
  rested: 0,
});

/** The distance to the nearest other ship. */
const nearest = (c: Ctx) =>
  c.others.reduce(
    (d, o) => Math.min(d, distance(c.own.ship.at, o.ship.at)),
    Infinity
  );

/** How much she wants to sail a loop now. */
export function claimUrge(c: Ctx): number {
  const { m } = c;
  if (!c.sea.holdings) return 0;
  if (m.bite) return CLAIMER.out;
  if (
    m.clock < m.rested ||
    (c.sea.storm && c.sea.storm.phase >= STORM.phases.length)
  )
    return 0;
  const safe = ramp(nearest(c), CLAIMER.danger, CLAIMER.clear);
  return CLAIMER.setOut * utility(c.t.claim, safe);
}

/**
 * Plans a bite out from her water at p along a bearing that is open and inside
 * the storm, or null if she finds none.
 */
function plan(c: Ctx, p: Vec3): Vec3[] | null {
  const h = c.sea.holdings!,
    s = c.sea.storm,
    greed = c.t.claim,
    f = c.own.ship.heading;
  const depth =
    CLAIMER.depth[0] +
    (CLAIMER.depth[1] - CLAIMER.depth[0]) * greed * between(c.m, 0.6, 1);
  const width =
    CLAIMER.width[0] +
    (CLAIMER.width[1] - CLAIMER.width[0]) * greed * between(c.m, 0.6, 1);
  const kept = (q: Vec3) => open(c, q) && (!s || toEdge(q, s) > c.t.margin);
  const start = between(c.m, -Math.PI, Math.PI),
    flank = c.m.rand & 1 ? 1 : -1;
  for (let k = 0; k < 8; k++) {
    const dir = rotate(p, f, start + (k * Math.PI) / 4);
    let edge = CLAIMER.probe;
    while (
      edge < CLAIMER.edgeMost &&
      h.ownerAt(along(p, dir, edge).p) === c.own.id
    )
      edge += CLAIMER.probe;
    if (edge >= CLAIMER.edgeMost) continue;
    const gate = along(p, dir, edge).p,
      out = along(p, dir, edge + depth);
    const across = toward(out.p, gate),
      side = across && rotate(out.p, across, (flank * Math.PI) / 2);
    if (!side) continue;
    const a = out.p,
      b = along(a, side, width).p,
      back = toward(b, gate);
    if (!back) continue;
    const home = along(gate, toward(gate, p) ?? dir, CLAIMER.inside).p;
    const turn = along(b, back, distance(b, gate) * 0.5).p;
    if ([a, b, turn].every(kept)) return [a, b, turn, home];
  }
  return null;
}

/**
 * Sails her bite: planned where she is, its marks in turn. Her goal: the mark
 * she makes for, or one to circle on in her water if she has no bite.
 */
export function claimAct(c: Ctx): Vec3 {
  const { m } = c,
    p = c.own.ship.at;
  // back at its last mark: the bite is done
  if (
    m.bite &&
    m.leg === m.bite.length - 1 &&
    distance(p, m.bite[m.leg]) < CLAIMER.arrive
  ) {
    m.bite = null;
    m.rested =
      m.clock +
      CLAIMER.rest[1] -
      (CLAIMER.rest[1] - CLAIMER.rest[0]) * c.t.claim;
  }
  if (!m.bite) {
    m.bite = plan(c, p);
    m.leg = 0;
    if (!m.bite) {
      m.rested = m.clock + CLAIMER.rest[1];
      return circle(c);
    }
  }
  while (
    m.leg < m.bite.length - 1 &&
    distance(p, m.bite[m.leg]) < CLAIMER.arrive
  )
    m.leg++;
  return m.bite[m.leg];
}

/**
 * A mark `round` m ahead and turned to her side, in her own water and open: she
 * keeps way on in it, no sitting target (the other side, else about astern, at
 * her water's edge heading out, else straight on, if none to her side is).
 */
function circle(c: Ctx): Vec3 {
  const p = c.own.ship.at,
    f = c.own.ship.heading,
    side = c.m.rand & 1 ? 1 : -1,
    h = c.sea.holdings!;
  for (const a of [0.6, 1.1, 1.7, -0.6, -1.1, -1.7, 2.4, -2.4, Math.PI]) {
    const way = rotate(p, f, side * a),
      q = along(p, way, CLAIMER.round).p;
    // and her water past it, room for the way she carries on by it
    if (
      h.ownerAt(q) === c.own.id &&
      h.ownerAt(along(p, way, CLAIMER.round + CLAIMER.past).p) === c.own.id &&
      open(c, q)
    )
      return q;
  }
  return along(p, f, CLAIMER.round).p;
}
