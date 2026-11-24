import { distance, toward, type Vec3 } from '../world/sphere.ts';
import { course, downField, type Route } from './route.ts';
import { toEdge } from './storm.ts';
import type { Ctx } from './captain.ts';
import type { Mark, Pace } from './tactician.ts';

export interface PilotMemory {
  route: Route | null;
}

export const pilotMemory = (): PilotMemory => ({ route: null });

export const lose = (m: PilotMemory) => {
  m.route = null;
};

export interface Way {
  want: Vec3 | null;
  distance: number;
  pace: Pace;
  foe: number;
}

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
  const ch = c.sea.chart,
    r = ch && course(ch, at, mark.at, m.route, dt);
  m.route = r ? r.route : null;
  const calm = c.sea.calm,
    by =
      ch && r?.route && !r.route.found && calm && toEdge(mark.at, calm.cap) > 0
        ? downField(ch, calm.field, at)
        : null,
    to = by ?? r?.to;
  if (to) [way.want, way.distance] = [toward(at, to), distance(at, to)];
  return way;
}
