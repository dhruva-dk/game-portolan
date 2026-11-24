import { whole } from '../draw.ts';
import { personName } from '../names.ts';
import { STATS, type Person, type Role } from '../state.ts';
import { AGEING, HEADCOUNT, PERSON } from '../tuning.ts';
import { currentStats } from './ageing.ts';
import { drawnPeak, type Span } from './peak.ts';
import { drawnWants } from './wants.ts';

export type Origin = { level: Span; age: Span };

const PORTRAIT_SEEDS = 2 ** 31;

export const portraitOf = (seed: string, id: number): number =>
  whole(0, PORTRAIT_SEEDS - 1, seed, 'person', id, 'portrait');

export function generatePerson(
  seed: string,
  id: number,
  role: Role,
  origin: Origin
): Person {
  const peak = drawnPeak(seed, id, STATS[role].length, origin.level);
  const peakAge = whole(
    PERSON.peakAge.lo,
    PERSON.peakAge.hi,
    seed,
    'person',
    id,
    'peakAge'
  );
  const retireAge = whole(
    PERSON.retireAge.lo,
    PERSON.retireAge.hi,
    seed,
    'person',
    id,
    'retireAge'
  );
  const drawnAge = whole(
    origin.age.lo,
    origin.age.hi,
    seed,
    'person',
    id,
    'age'
  );
  const age =
    drawnAge >= retireAge ? retireAge - HEADCOUNT.belowRetirement : drawnAge;
  return {
    id,
    role,
    name: personName(seed, id),
    portrait: portraitOf(seed, id),
    age,
    peakAge,
    retireAge,
    peak,
    stats: currentStats(peak, age, peakAge),
    ...drawnWants(seed, id),
    contract: null,
  };
}

export const rookie = (seed: string, id: number, role: Role): Person =>
  generatePerson(seed, id, role, {
    level: AGEING.rookieLevel,
    age: AGEING.rookieAge,
  });
