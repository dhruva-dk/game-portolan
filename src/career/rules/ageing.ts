import { clamp } from '../../world/scalar.ts';
import type { Person } from '../state.ts';
import { AGEING, STAT_SPAN } from '../tuning.ts';

export function form(age: number, peakAge: number): number {
  if (age < peakAge)
    return Math.max(
      AGEING.young.floor,
      1 - AGEING.young.perYear * (peakAge - age)
    );
  if (age <= peakAge + AGEING.prime) return 1;
  return Math.max(
    AGEING.old.floor,
    1 - AGEING.old.perYear * (age - peakAge - AGEING.prime)
  );
}

export const currentStats = (
  peak: readonly number[],
  age: number,
  peakAge: number
): number[] =>
  peak.map((stat) =>
    clamp(
      Math.round(stat * form(age, peakAge)),
      STAT_SPAN.least,
      STAT_SPAN.most
    )
  );

export function aged(person: Person): Person {
  const age = person.age + AGEING.perStop;
  return {
    ...person,
    age,
    stats: currentStats(person.peak, age, person.peakAge),
  };
}

export const retires = (person: Person): boolean =>
  person.age >= person.retireAge;
