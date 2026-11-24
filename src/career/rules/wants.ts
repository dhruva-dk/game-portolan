import { pick, uniform } from '../draw.ts';
import type { Person } from '../state.ts';
import { WANTS } from '../tuning.ts';

export type Wants = Pick<Person, 'wants' | 'preferred' | 'wageFactor'>;

export function wantsOf(money: number, standing: number): Person['wants'] {
  return { money, standing, security: 1 - money - standing };
}

export function drawnWants(seed: string, id: number): Wants {
  const money = uniform(
    WANTS.money.lo,
    WANTS.money.hi,
    seed,
    'person',
    id,
    'money'
  );
  const standing = uniform(
    WANTS.leastStanding,
    WANTS.standingAndMoney - money,
    seed,
    'person',
    id,
    'standing'
  );
  const { lo, hi } = WANTS.wageFactor;
  return {
    wants: wantsOf(money, standing),
    preferred: pick(WANTS.preferred, seed, 'person', id, 'preferred'),
    wageFactor: uniform(lo, hi, seed, 'person', id, 'wageFactor'),
  };
}
