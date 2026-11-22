// A bot's lookout (BOTS.md 1.1): which ship she has her eye on. Every think she
// notes the nearest ship she can see within her notice (land between hides
// one), a ship that just rammed her seen as nearer; a foe out of sight is
// followed to where she was last seen, and let go after `forget` seconds. What
// she sees, the captain (bot.ts) weighs. A ship of her own team (captain.ts
// mate) is never the one.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { along, apart, distance, toward, type Vec3 } from '../world/sphere.ts';
import { sighted } from './gunner.ts';
import { mate, type Ctx, type Seen } from './captain.ts';
import type { Temper } from './temper.ts';

/**
 * How she sees: the farthest she looks for a ship, m; seconds she follows one
 * out of sight; ground higher than `sightLine` m hides one, looked for every
 * `sightStep` m along the way; a ship that rammed her within her grudge
 * (fighting.ts MIND) is seen as `nearer` as far.
 */
export const SIGHT = {
  sightMax: 240,
  forget: 4,
  sightLine: 2.5,
  sightStep: 20,
  nearer: 0.5,
} as const;

/**
 * What her lookout carries: the ship she has her eye on (an id, or -1), when
 * she last saw her (her clock, s), and where.
 */
export interface LookMemory {
  foe: number;
  seen: number;
  last: Vec3;
}

/** A lookout who has seen nothing yet, at `at`. */
export const lookMemory = (at: Vec3): LookMemory => ({
  foe: -1,
  seen: -Infinity,
  last: at,
});

/** Whether land stands between a and b, high enough to hide a ship. */
export function hidden(c: Ctx, a: Vec3, b: Vec3): boolean {
  const d = distance(a, b),
    t = toward(a, b);
  if (!t) return false;
  for (let s = c.b.sight.sightStep; s < d; s += c.b.sight.sightStep)
    if (-c.sea.depth(along(a, t, s).p) > c.b.sight.sightLine) return true;
  return false;
}

/** How far off she notices a ship, m: her temper's notice, by her skill. */
export const eye = (t: Temper): number => t.notice * (0.8 + 0.4 * t.lookout);

/**
 * Notes the nearest ship she can see; a foe out of sight is followed to where
 * she was last seen, then let go. A ship newly in her eye is told to her gunner
 * (she holds her fire her reaction's time).
 */
export function perceive(c: Ctx): void {
  const { m, own } = c;
  let best: Seen | null = null,
    bd = eye(c.t);
  for (const o of c.others) {
    if (mate(c, o)) continue;
    if (apart(own.ship.at, o.ship.at, c.b.sight.sightMax)) continue;
    const d = distance(own.ship.at, o.ship.at);
    if (d > c.b.sight.sightMax) continue;
    const score =
      o.id === m.hitBy && m.clock - m.hitT < c.b.mind.grudge
        ? d * c.b.sight.nearer
        : d;
    if (score >= bd || hidden(c, own.ship.at, o.ship.at)) continue;
    [bd, best] = [score, o];
  }
  if (best && best.id !== m.foe) sighted(m, m.clock, c.t.lookout);
  if (best) [m.foe, m.seen, m.last] = [best.id, m.clock, best.ship.at];
  else if (
    m.foe >= 0 &&
    (m.clock - m.seen > c.b.sight.forget ||
      !c.others.some((o) => o.id === m.foe))
  )
    m.foe = -1;
}
