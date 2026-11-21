// Where a bot roams when nothing better calls (bot.ts weighs it last): a new
// mark every `roam` s or within `arrive` m of the last, `near`–`far` m off a
// random way, drawn in toward the storm's middle as its cap shrinks; or, once
// it is time, to her place for the phase and about it (placing.ts).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { add, along, distance, normalize, type Vec3 } from '../world/sphere.ts';
import { toEdge } from './storm.ts';
import { between, open, rotate, type Ctx } from './captain.ts';
import { deepest } from './helmsman.ts';
import { placeNow } from './placing.ts';
import { inward, late, reach } from './storming.ts';

/**
 * Roaming: a new mark every `roam` s or within `arrive` m, `near`–`far` m off;
 * once the cap is under `drift` m, a mark is drawn `drawn` of the way in toward
 * its centre (a chord's share). Her place for the phase, once it is time, she
 * makes for from further than `home` m, and roams within it of it.
 */
export const ROAMING = {
  roam: 9,
  arrive: 20,
  near: 60,
  far: 160,
  drift: 600,
  drawn: 0.4,
  home: 50,
} as const;

/**
 * A mark to roam to: open water a random way off, drawn in toward the storm's
 * middle once its cap is under `drift` m and kept her margin inside its edge
 * (inside the next cap's while that is late, as the storm's edge closes at up
 * to 8 m/s); failing that, in from the edge if she is near it, or else toward
 * the deepest water round her.
 */
export function roamGoal(c: Ctx): Vec3 {
  const p = c.own.ship.at,
    f = c.own.ship.heading,
    s = c.sea.storm,
    margin = c.t.margin;
  const keep = s && (late(c) ? s.next : s);
  // her place for the phase, once it is time (placing.ts): there, and about it
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
      q = normalize(add(q, add(s.centre, q, -1), c.b.roaming.drawn));
    if (open(c, q) && (!keep || toEdge(q, keep) > margin)) return q;
  }
  if (s && toEdge(p, s) < 2 * margin)
    return inward(c, p, s.centre, Math.max(0, reach(s) - 2 * margin));
  return along(p, rotate(p, f, deepest(c)), c.b.roaming.near).p;
}
