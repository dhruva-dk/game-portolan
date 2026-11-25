import { clamp } from '../../world/scalar.ts';
import { pick, uniform, whole } from '../draw.ts';
import { personName } from '../names.ts';
import {
  DRIVER_STATS,
  STATS,
  type Owner,
  type Person,
  type Role,
} from '../state.ts';
import {
  AGEING,
  HEADCOUNT,
  OWNERS,
  PERSON,
  POLICY,
  STARS,
  STAT_SPAN,
  WANTS,
} from '../tuning.ts';

export type Span = { lo: number; hi: number };

export function shape(u: readonly number[]): number[] {
  const mean = u.reduce((sum, x) => sum + x, 0) / u.length;
  const centered = u.map((x) => x - mean);
  const largest = Math.max(...centered.map(Math.abs));
  return largest === 0
    ? centered.map(() => 0)
    : centered.map((x) => x / largest);
}

export const peakStat = (level: number, spikiness: number, z: number): number =>
  clamp(
    Math.round(level + PERSON.reach * spikiness * z),
    STAT_SPAN.least,
    STAT_SPAN.most
  );

export function drawnPeak(
  seed: string,
  id: number,
  count: number,
  level: Span
): number[] {
  const overall = uniform(level.lo, level.hi, seed, 'person', id, 'level');
  const { lo, hi } = PERSON.spikiness;
  const spikiness = uniform(lo, hi, seed, 'person', id, 'spikiness');
  const u = Array.from({ length: count }, (_, i) =>
    uniform(PERSON.shape.lo, PERSON.shape.hi, seed, 'person', id, 'shape', i)
  );
  return shape(u).map((z) => peakStat(overall, spikiness, z));
}

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

export type Origin = { level: Span; age: Span };

const PORTRAIT_SEEDS = 2 ** 31;

const portraitOf = (seed: string, id: number): number =>
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

export const generateOwner = (seed: string, id: number): Owner => ({
  id,
  name: personName(seed, id),
  portrait: portraitOf(seed, id),
  stats: drawnPeak(seed, id, DRIVER_STATS.length, OWNERS.level),
});

export const ownerNerve = (owner: Owner | null): number =>
  owner === null
    ? POLICY.ownerlessNerve
    : owner.stats[DRIVER_STATS.indexOf('nerve')];

export function stars(stats: readonly number[]): number {
  const mean = stats.reduce((sum, stat) => sum + stat, 0) / stats.length;
  return Math.floor((mean / STARS.perStar) * STARS.steps) / STARS.steps;
}
