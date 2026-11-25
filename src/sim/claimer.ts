import { distance, along, toward, type Vec3 } from '../world/sphere.ts';
import { clearAt } from './route.ts';
import { toEdge } from './storm.ts';
import { ramp, utility } from './utility.ts';
import { between, mate, open, rotate, type Ctx } from './captain.ts';

export const CLAIMER = {
  depth: [30, 90] as const,
  probe: 5,
  edgeMost: 200,
  inside: 10,
  room: 3,
  arrive: 14,
  rest: [4, 16] as const,
  danger: 110,
  clear: 160,
  out: 0.75,
  setOut: 0.45,
  round: 22,
  past: 10,
} as const;

export interface Holdings {
  ownerAt(p: Vec3): number;
  teamAt(p: Vec3): number;
}

export interface ClaimMemory {
  bite: Vec3[] | null;
  leg: number;
  rested: number;
}

export const claimMemory = (): ClaimMemory => ({
  bite: null,
  leg: 0,
  rested: 0,
});

const nearest = (c: Ctx) =>
  c.others.reduce(
    (d, o) =>
      mate(c, o) ? d : Math.min(d, distance(c.own.ship.at, o.ship.at)),
    Infinity
  );

export function claimUrge(c: Ctx): number {
  const { m } = c;
  if (!c.sea.holdings || !c.t.tricks.loops) return 0;
  if (m.bite) return c.b.claimer.out;
  if (m.clock < m.rested || c.sea.storm?.final) return 0;
  const safe = ramp(nearest(c), c.b.claimer.danger, c.b.claimer.clear);
  return c.b.claimer.setOut * utility(c.t.claim, safe);
}

function plan(c: Ctx, p: Vec3): Vec3[] | null {
  const h = c.sea.holdings!,
    s = c.sea.storm,
    greed = c.t.claim,
    f = c.own.ship.heading;
  const depth =
    c.b.claimer.depth[0] +
    (c.b.claimer.depth[1] - c.b.claimer.depth[0]) *
      greed *
      between(c.m, 0.6, 1);
  const width = c.t.loop;
  const ch = c.sea.chart,
    kept = (q: Vec3) =>
      open(c, q) &&
      (!ch || clearAt(ch, q) >= c.b.claimer.room) &&
      (!s || toEdge(q, s) > c.t.margin);
  const start = between(c.m, -Math.PI, Math.PI),
    flank = c.m.rand & 1 ? 1 : -1;
  for (let k = 0; k < 8; k++) {
    const dir = rotate(p, f, start + (k * Math.PI) / 4);
    let edge = c.b.claimer.probe;
    while (
      edge < c.b.claimer.edgeMost &&
      h.ownerAt(along(p, dir, edge).p) === c.own.id
    )
      edge += c.b.claimer.probe;
    if (edge >= c.b.claimer.edgeMost) continue;
    const gate = along(p, dir, edge).p,
      out = along(p, dir, edge + depth);
    const across = toward(out.p, gate),
      side = across && rotate(out.p, across, (flank * Math.PI) / 2);
    if (!side) continue;
    const a = out.p,
      b = along(a, side, width).p,
      back = toward(b, gate);
    if (!back) continue;
    const home = along(gate, toward(gate, p) ?? dir, c.b.claimer.inside).p;
    const turn = along(b, back, distance(b, gate) * 0.5).p;
    if ([a, b, turn].every(kept)) return [a, b, turn, home];
  }
  return null;
}

export function claimAct(c: Ctx): Vec3 {
  const { m } = c,
    p = c.own.ship.at;
  if (
    m.bite &&
    m.leg === m.bite.length - 1 &&
    distance(p, m.bite[m.leg]) < c.b.claimer.arrive
  ) {
    m.bite = null;
    m.rested =
      m.clock +
      c.b.claimer.rest[1] -
      (c.b.claimer.rest[1] - c.b.claimer.rest[0]) * c.t.claim;
  }
  if (!m.bite) {
    m.bite = plan(c, p);
    m.leg = 0;
    if (!m.bite) {
      m.rested = m.clock + c.b.claimer.rest[1];
      return circle(c);
    }
  }
  while (
    m.leg < m.bite.length - 1 &&
    distance(p, m.bite[m.leg]) < c.b.claimer.arrive
  )
    m.leg++;
  return m.bite[m.leg];
}

function circle(c: Ctx): Vec3 {
  const p = c.own.ship.at,
    f = c.own.ship.heading,
    side = c.m.rand & 1 ? 1 : -1,
    h = c.sea.holdings!;
  for (const a of [0.6, 1.1, 1.7, -0.6, -1.1, -1.7, 2.4, -2.4, Math.PI]) {
    const way = rotate(p, f, side * a),
      q = along(p, way, c.b.claimer.round).p;
    if (
      h.ownerAt(q) === c.own.id &&
      h.ownerAt(along(p, way, c.b.claimer.round + c.b.claimer.past).p) ===
        c.own.id &&
      open(c, q)
    )
      return q;
  }
  return along(p, f, c.b.claimer.round).p;
}
