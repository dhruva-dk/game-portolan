import { stars } from '../rules/person.ts';
import {
  DRIVER_STATS,
  LINES,
  type Person,
  type Range,
  type Role,
} from '../state.ts';
import { STAND_IN, UNCLE } from '../tuning.ts';

export type StatId =
  | 'gunnery'
  | 'helm'
  | 'nerve'
  | 'territory'
  | 'stormcraft'
  | 'lookout'
  | 'sails'
  | 'rigging'
  | 'rudder'
  | 'hull'
  | 'keel'
  | 'mounts'
  | 'gun'
  | 'shield'
  | 'healSpeed'
  | 'healAmount'
  | 'thrift'
  | 'upkeep';

export const STAT_IDS: Readonly<Record<Role, readonly StatId[]>> = {
  driver: DRIVER_STATS,
  designer: LINES,
  mechanic: ['shield', 'healSpeed', 'healAmount', 'thrift', 'upkeep'],
};

export type Span = Range;

export type StatView = { stat: StatId; value: Span };

export type CardView = {
  who: 'person' | 'uncle';
  person: number | null;
  name: string;
  portrait: number | null;
  role: Role | 'owner';
  age: number | null;
  stars: Span;
  stats: StatView[];
  wage: Span | null;
  racesLeft: number | null;
};

const exact = (value: number): Span => ({ lo: value, hi: value });

const statsOf = (role: Role, values: readonly number[]): StatView[] =>
  STAT_IDS[role].map((stat, i) => ({ stat, value: exact(values[i]) }));

export function exactCard(person: Person): CardView {
  return {
    who: 'person',
    person: person.id,
    name: person.name,
    portrait: person.portrait,
    role: person.role,
    age: person.age,
    stars: exact(stars(person.stats)),
    stats: statsOf(person.role, person.stats),
    wage: person.contract === null ? null : exact(person.contract.wage),
    racesLeft: person.contract?.racesLeft ?? null,
  };
}

export function uncleCard(): CardView {
  const values = DRIVER_STATS.map((stat) => STAND_IN[stat]);
  return {
    who: 'uncle',
    person: null,
    name: UNCLE.name,
    portrait: null,
    role: 'driver',
    age: null,
    stars: exact(stars(values)),
    stats: statsOf('driver', values),
    wage: null,
    racesLeft: null,
  };
}
