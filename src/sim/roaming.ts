import { add, along, distance, normalize, type Vec3 } from '../world/sphere.ts';
import { toEdge } from './storm.ts';
import { between, open, rotate, type Ctx } from './captain.ts';
import { deepest } from './helmsman.ts';
import { placeNow } from './placing.ts';
import { inward, late, reach } from './storming.ts';

export const ROAMING = {
  roam: 9,
  arrive: 20,
  near: 60,
  far: 160,
  drift: 600,
  drawn: 0.4,
  home: 50,
} as const;

export function roamGoal(c: Ctx): Vec3 {
  const p = c.own.ship.at,
    f = c.own.ship.heading,
    s = c.sea.storm,
    margin = c.t.margin;
  const keep = s && (late(c) ? s.next : s);
  const home = placeNow(c);
  if (home && distance(p, home) > c.b.roaming.home) return home;
  for (let tries = 0; tries < 8; tries++) {
    let q = home
      ? along(
          home,
          rotate(home, f, between(c.m, -Math.PI, Math.PI)),
          between(c.m, c.b.roaming.arrive, c.b.roaming.home)
        ).p
      : along(
          p,
          rotate(p, f, between(c.m, -Math.PI, Math.PI)),
          between(c.m, c.b.roaming.near, c.b.roaming.far)
        ).p;
    if (!home && s && reach(s) < c.b.roaming.drift)
      q = normalize(add(q, add(s.center, q, -1), c.b.roaming.drawn));
    if (open(c, q) && (!keep || toEdge(q, keep) > margin)) return q;
  }
  if (s && toEdge(p, s) < 2 * margin)
    return inward(c, p, s.center, Math.max(0, reach(s) - 2 * margin));
  return along(p, rotate(p, f, deepest(c)), c.b.roaming.near).p;
}
