import { distance, scale, toward, type Vec3 } from '../world/sphere.ts';
import { gap } from './contact.ts';
import { ring, rushing } from './gunner.ts';
import { inSight, type Ctx, type Intent } from './captain.ts';

export interface TacticMemory {
  recoil: number;
}

export const tacticMemory = (): TacticMemory => ({ recoil: 0 });

export const RAMMING = { recoil: 3 } as const;

export type Pace = 'ram' | 'turn' | 'gently';

export interface Mark {
  at: Vec3 | null;
  aim: Vec3 | null;
  distance: number;
  pace: Pace;
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
  const kind = own.crew.gun.kind;
  if (foe) {
    const ringed = ring(c, foe, kind, dt);
    return {
      at: ringed,
      aim: toward(ship.at, ringed),
      distance: distance(ship.at, ringed),
      pace: rushing(c, kind) ? 'ram' : 'turn',
    };
  }
  return {
    at: intent.goal,
    aim: toward(ship.at, intent.goal),
    distance: distance(ship.at, intent.goal),
    pace: intent.arrive === 'gently' ? 'gently' : 'turn',
  };
}
