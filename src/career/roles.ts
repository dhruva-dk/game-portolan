// Every person and their role's stats (Phase B section 2, D15, D37). A stat is 0 to 20 at one decimal; u = stat / 20.
// What each stat does is in career/pit.ts (mechanic, pit), career/staff.ts (driver, designer, scout) and the
// sections that read the manager's and the chairman's (rivals, chairmen).
//
// The player is a person too (D35): a manager whose stats are all 0 and never read, since the player's own choices
// stand for them (D8).

import type { PartType, Stat, Persona } from '../race.ts';
import type { Personality, Role, Status, Want } from '../office/command.ts';

/** Each role's stats, in the order a screen lists them. */
export const ROLE_STATS = {
  driver: [
    'gunnery',
    'helm',
    'seamanship',
    'nerve',
    'consistency',
    'stormcraft',
    'stamina',
    'feedback',
    'lookout',
  ],
  mechanic: [
    'repairs',
    'mending',
    'handling',
    'concentration',
    'leadership',
    'reliability',
    'perf',
    'chemistry',
  ],
  designer: [
    'sails',
    'rigging',
    'rudder',
    'hull',
    'keel',
    'mounts',
    'innovation',
    'speed',
    'accuracy',
  ],
  scout: ['judgement', 'insight', 'reach', 'speed', 'persuasion'],
  pit: ['speed', 'strength', 'precision', 'teamwork', 'nerve', 'stamina'],
  manager: [
    'negotiation',
    'talentEye',
    'development',
    'finance',
    'tactics',
    'politics',
  ],
  chairman: ['patience', 'ambition', 'generosity', 'meddling'],
} as const satisfies Record<Role, readonly string[]>;

export const ROLES: readonly Role[] = [
  'driver',
  'mechanic',
  'designer',
  'scout',
  'pit',
  'manager',
  'chairman',
];

export type StatOf<R extends Role> = (typeof ROLE_STATS)[R][number];
export type StatsOf<R extends Role> = Readonly<Record<StatOf<R>, number>>;

// the seam's names hold: a driver's stats are race.ts Stat, a designer's six are its PartType
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const driverStatsAreTheSeams: Same<StatOf<'driver'>, Stat> = true;
const designerTypesAreTheSeams: Same<
  Exclude<StatOf<'designer'>, 'innovation' | 'speed' | 'accuracy'>,
  PartType
> = true;
export const SEAM_NAMES_HOLD =
  driverStatsAreTheSeams && designerTypesAreTheSeams;

/** A person's contract (Phase B section 5). Wage, fee and bonuses in money; `ends` the season at whose end it runs out
 *  (null for an chairman, and for the player, who are their team's for as long as they stay). */
export interface Contract {
  team: number;
  status: Status;
  wage: number;
  fee: number;
  ends: number | null;
  podium: number;
  sinking: number;
  breakClause: number | null;
  signed: number; // the day
}

/** What a team knows of a person once scouted (Phase B section 4): the day, their stars at the last season's end (a
 *  screen's arrow is stars now against these), the scout whose report it was (null: their own staff), and whether
 *  that report's Persuasion has been spent on an offer. */
export interface Known {
  day: number;
  last: number;
  by: number | null;
  used: boolean;
}

/** A season of a person's history: their team and what they did (races sailed, or worked, for every role). */
export interface SeasonLine {
  season: number;
  team: number | null;
  tier: number | null;
  role: Role;
  races: number;
  best: number | null; // best finish, a driver's
  points: number;
  sinkings: number;
}

/** What every person has, whatever their role. */
export interface PersonCore {
  id: number;
  seed: number; // their headshot and every seeded spread of theirs
  given: string;
  family: string;
  colony: number; // index into the state's colonies
  born: number; // the day
  improvability: number; // 0..1
  peak: number; // peak age in years
  traits: readonly string[]; // career/traits.ts ids, at most three
  morale: number; // 0..100
  marketability: number; // 0..100
  wants: readonly Want[]; // three, first most
  contract: Contract | null;
  known: Readonly<Record<string, Known>>; // by team id
  history: readonly SeasonLine[];
  persona: Persona | null; // a driver's
  personality: Personality | null; // a manager's
  reputation: number; // a manager's, 0..100
  fatigue: number; // a pit crew member's, 0..100, as it stood on fatigueDay
  fatigueDay: number;
  components: readonly string[]; // a designer's known components (career/components.ts)
  unfit: number; // races still to miss injured
  grudge: number | null; // the team that last sank her (Grudge-holder)
  patience: number; // in talks (Phase B section 5)
  silentUntil: number; // the day talks open again after patience ran out
  silenced: boolean; // the contract's last days passed with no renewal: morale paid once
  retired: number | null; // the day
  player: boolean;
}

export type PersonOf<R extends Role> = PersonCore & {
  role: R;
  stats: StatsOf<R>;
  ceiling: StatsOf<R>;
};
/** A person: their role's stats now and at their projected peak (ceiling, from which their potential is read). */
export type Person = { [R in Role]: PersonOf<R> }[Role];

/** A stat's u (stat / 20), clamped to 0..1. */
export const unit = (stat: number): number =>
  Math.min(1, Math.max(0, stat / 20));

/** A stat kept to 0..20 at one decimal. */
export const stat = (x: number): number =>
  Math.round(Math.min(20, Math.max(0, x)) * 10) / 10;

/** A person from what every person has and a role's stats by name. The caller (the generator, growth) gives exactly the
 *  role's stat names (ROLE_STATS), which the tests hold it to. */
export function personOf(
  core: PersonCore,
  role: Role,
  stats: Readonly<Record<string, number>>,
  ceiling: Readonly<Record<string, number>>
): Person {
  const made: unknown = { ...core, role, stats, ceiling };
  return made as Person;
}

/** A person with new stats by name (the same names). */
export const withStats = (
  g: Person,
  stats: Readonly<Record<string, number>>
): Person => personOf(g, g.role, stats, g.ceiling);

/** A role's stats, each put through `f` (the same names). */
export function mapped<S extends Readonly<Record<string, number>>>(
  stats: S,
  f: (value: number, name: string) => number
): S {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(stats)) out[k] = f(v, k);
  return out as S;
}

/** Whether a person is of a role: told to the types. */
export const hasRole = <R extends Role>(
  g: Person,
  role: R
): g is Extract<Person, { role: R }> => g.role === role;

/**
 * A person as one of a role. A staff's seat names its role (career/seats.ts),
 * so the one seated there is of it: anyone else is a broken state, thrown
 * here and refused by the reducer (career/career.ts apply).
 */
export function inRole<R extends Role>(
  g: Person | undefined,
  role: R
): Extract<Person, { role: R }> {
  if (!g || !hasRole(g, role)) throw new Error(`no ${role} there`);
  return g;
}
