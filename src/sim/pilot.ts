// A bot's pilot, every step: the way to what she makes for (tactician.ts
// Mark), by a route round land (route.ts) when the water to it isn't clear and
// she has a chart; straight for it otherwise. What she steers along is handed
// on as a Way (helmsman.ts). Her route is hers alone to keep: found, followed,
// and let go when her helm finds itself lost.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs, to the bit.

import { distance, toward, type Vec3 } from '../world/sphere.ts';
import { course } from './route.ts';
import type { Ctx } from './captain.ts';
import type { Mark, Pace } from './tactician.ts';

/**
 * What her helm steers along this step: a tangent at her place (null: none),
 * metres to where it leads, her pace, and the ship she means to strike (-1:
 * none), whose ram coming at her she doesn't answer.
 */
export interface Way {
  want: Vec3 | null;
  distance: number;
  pace: Pace;
  foe: number;
}

/**
 * The way to `mark` this step of dt seconds; `foe` the ship she means to
 * strike. Updates her route.
 */
export function navigate(c: Ctx, mark: Mark, foe: number, dt: number): Way {
  const { m } = c,
    at = c.own.ship.at;
  const way: Way = {
    want: mark.aim,
    distance: mark.distance,
    pace: mark.pace,
    foe,
  };
  if (!mark.at) return way;
  const r = c.sea.chart && course(c.sea.chart, at, mark.at, m.route, dt);
  m.route = r ? r.route : null;
  if (r && r.to)
    [way.want, way.distance] = [toward(at, r.to), distance(at, r.to)];
  return way;
}
