import { DRIVER_STATS, type Owner } from '../state.ts';
import { OWNERS } from '../tuning.ts';

export type Temperament = 'cautious' | 'sensible' | 'bold';

export const TEMPERAMENTS: readonly Temperament[] = [
  'cautious',
  'sensible',
  'bold',
];

const OWNERLESS: Temperament = 'sensible';

export function temperamentOf(nerve: number): Temperament {
  if (nerve <= OWNERS.cautious.hi) return 'cautious';
  return nerve <= OWNERS.sensible.hi ? 'sensible' : 'bold';
}

const ownerNerve = (owner: Owner): number =>
  owner.stats[DRIVER_STATS.indexOf('nerve')];

export const ownerTemperament = (owner: Owner | null): Temperament =>
  owner === null ? OWNERLESS : temperamentOf(ownerNerve(owner));
