import {
  add,
  cross,
  distance,
  dot,
  length,
  scale,
  toward,
  transport,
  type Vec3,
} from '../world/sphere.ts';
import { inHand } from './battle.ts';
import { gap } from './contact.ts';
import { ring, rushing } from './gunner.ts';
import {
  inSight,
  velocity,
  type Ctx,
  type Intent,
  type Seen,
} from './captain.ts';

export interface TacticMemory {
  recoil: number;
}

export const tacticMemory = (): TacticMemory => ({ recoil: 0 });

export const RAMMING = {
  lead: 8,
  commit: 25,
  abeam: 0.5,
  offMin: 15,
  offMax: 50,
  recoil: 3,
} as const;

export type Pace = 'ram' | 'turn' | 'gently';

export interface Mark {
  at: Vec3 | null;
  aim: Vec3 | null;
  distance: number;
  pace: Pace;
}

function ramCourse(c: Ctx, foe: Seen): Vec3 {
  const p = c.own.ship.at,
    d = c.foeD,
    t = toward(p, foe.ship.at);
  if (!t) return c.own.ship.heading;
  const r = scale(t, d),
    v = transport(velocity(foe), foe.ship.at, p),
    s = c.own.crew.values.topSpeed;
  const a = dot(v, v) - s * s,
    b = 2 * dot(r, v),
    disc = b * b - 4 * a * d * d;
  let tau = d / s;
  if (disc >= 0 && Math.abs(a) > 1e-9) {
    const roots = [
      (-b - Math.sqrt(disc)) / (2 * a),
      (-b + Math.sqrt(disc)) / (2 * a),
    ].filter((x) => x > 0);
    if (roots.length) tau = Math.min(...roots);
  }
  let aim = add(r, v, Math.min(tau, c.b.ramming.lead));
  const reach = length(aim);
  if (reach > c.b.ramming.commit) {
    const h = transport(foe.ship.heading, foe.ship.at, p),
      port = cross(p, h),
      back = scale(aim, -1 / reach);
    const aside = Math.min(
      c.b.ramming.offMax,
      Math.max(c.b.ramming.offMin, reach / 2)
    );
    if (Math.abs(dot(back, h)) > c.b.ramming.abeam)
      aim = add(aim, port, Math.sign(dot(back, port) || 1) * aside);
  }
  return aim;
}

export function mark(c: Ctx, intent: Intent, dt: number): Mark {
  const { m, own } = c,
    ship = own.ship;
  const foe = intent.foe >= 0 && inSight(c) ? c.foe : null;
  if (foe && gap(ship, foe.ship) < 1) m.recoil = c.b.ramming.recoil;
  m.recoil = Math.max(0, m.recoil - dt);
  if (foe && m.recoil > 0) {
    const at = toward(ship.at, foe.ship.at);
    return {
      at: null,
      aim: at && scale(at, -1),
      distance: c.foeD,
      pace: 'ram',
    };
  }
  const held = own.crew ? inHand(own.crew) : null;
  const ringed = foe && held ? ring(c, foe, held.kind, dt) : null;
  if (ringed)
    return {
      at: ringed,
      aim: toward(ship.at, ringed),
      distance: distance(ship.at, ringed),
      pace: held && rushing(c, held.kind) ? 'ram' : 'turn',
    };
  if (foe)
    return {
      at: foe.ship.at,
      aim: ramCourse(c, foe),
      distance: c.foeD,
      pace: 'ram',
    };
  return {
    at: intent.goal,
    aim: toward(ship.at, intent.goal),
    distance: distance(ship.at, intent.goal),
    pace: intent.arrive === 'gently' ? 'gently' : 'turn',
  };
}
