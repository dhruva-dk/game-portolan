import { along, apart, distance, toward, type Vec3 } from '../world/sphere.ts';
import { sighted } from './gunner.ts';
import { mate, type Ctx, type Seen } from './captain.ts';
import type { Temper } from './temper.ts';

export const SIGHT = {
  sightMax: 240,
  forget: 4,
  sightLine: 2.5,
  sightStep: 20,
  nearer: 0.5,
} as const;

export interface LookMemory {
  foe: number;
  seen: number;
  last: Vec3;
}

export const lookMemory = (at: Vec3): LookMemory => ({
  foe: -1,
  seen: -Infinity,
  last: at,
});

export function hidden(c: Ctx, a: Vec3, b: Vec3): boolean {
  const d = distance(a, b),
    t = toward(a, b);
  if (!t) return false;
  for (let s = c.b.sight.sightStep; s < d; s += c.b.sight.sightStep)
    if (-c.sea.depth(along(a, t, s).p) > c.b.sight.sightLine) return true;
  return false;
}

export const eye = (t: Temper): number => t.notice * (0.8 + 0.4 * t.lookout);

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
