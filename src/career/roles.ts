// Every gull and their role's stats (Phase B section 2, D15, D37). A stat is 0 to 20 at one decimal; u = stat / 20.
// What each stat does is in career/service.ts (bosun, flight), career/staff.ts (captain, shipwright, scout) and the
// sections that read the manager's and the elder's (rivals, elders).
//
// The player is a gull too (D35): a manager whose stats are all 0 and never read, since the player's own choices
// stand for them (D8).

import type { Job, PartType, Stat, Style } from '../race.ts';
import type { Personality, Role, Status, Want } from '../office.ts';

/** Each role's stats, in the order a screen lists them. */
export const ROLE_STATS = {
  captain: [
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
  bosun: [
    'repairs',
    'mending',
    'handling',
    'concentration',
    'leadership',
    'reliability',
    'perf',
    'chemistry',
  ],
  shipwright: [
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
  flight: ['speed', 'strength', 'precision', 'teamwork', 'nerve', 'stamina'],
  manager: [
    'negotiation',
    'talentEye',
    'development',
    'finance',
    'tactics',
    'politics',
  ],
  elder: ['patience', 'ambition', 'generosity', 'meddling'],
} as const satisfies Record<Role, readonly string[]>;

export const ROLES = Object.keys(ROLE_STATS) as readonly Role[];

export type StatOf<R extends Role> = (typeof ROLE_STATS)[R][number];
export type StatsOf<R extends Role> = Readonly<Record<StatOf<R>, number>>;

// the seam's names hold: a captain's stats are race.ts Stat, a shipwright's six are its PartType
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const captainStatsAreTheSeams: Same<StatOf<'captain'>, Stat> = true;
const shipwrightTypesAreTheSeams: Same<
  Exclude<StatOf<'shipwright'>, 'innovation' | 'speed' | 'accuracy'>,
  PartType
> = true;
export const SEAM_NAMES_HOLD =
  captainStatsAreTheSeams && shipwrightTypesAreTheSeams;

/** A gull's contract (Phase B section 5). Wage, fee and bonuses in Coin; `ends` the season at whose end it runs out
 *  (null for an elder, and for the player, who are their crew's for as long as they stay). */
export interface Contract {
  crew: number;
  status: Status;
  wage: number;
  fee: number;
  ends: number | null;
  podium: number;
  sinking: number;
  breakClause: number | null;
  signed: number; // the day
}

/** What a crew knows of a gull once scouted (Phase B section 4): the day, their stars at the last season's end (a
 *  screen's arrow is stars now against these), the scout whose report it was (null: their own staff), and whether
 *  that report's Persuasion has been spent on an offer. */
export interface Known {
  day: number;
  last: number;
  by: number | null;
  used: boolean;
}

/** A season of a gull's history: their crew and what they did (races sailed, or worked, for every role). */
export interface SeasonLine {
  season: number;
  crew: number | null;
  league: number | null;
  role: Role;
  races: number;
  best: number | null; // best finish, a captain's
  points: number;
  sinkings: number;
}

/** What every gull has, whatever their role. */
export interface GullCore {
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
  known: Readonly<Record<string, Known>>; // by crew id
  history: readonly SeasonLine[];
  style: Style | null; // a captain's
  personality: Personality | null; // a manager's
  reputation: number; // a manager's, 0..100
  fatigue: number; // a flight gull's, 0..100, as it stood on fatigueDay
  fatigueDay: number;
  job: Job | null; // a flight gull's job
  components: readonly string[]; // a shipwright's known components (career/components.ts)
  unfit: number; // races still to miss injured
  grudge: number | null; // the crew that last sank her (Grudge-holder)
  patience: number; // in talks (Phase B section 5)
  silentUntil: number; // the day talks open again after patience ran out
  silenced: boolean; // the contract's last days passed with no renewal: morale paid once
  retired: number | null; // the day
  player: boolean;
}

export type GullOf<R extends Role> = GullCore & {
  role: R;
  stats: StatsOf<R>;
  ceiling: StatsOf<R>;
};
/** A gull: their role's stats now and at their projected peak (ceiling, from which their potential is read). */
export type Gull = { [R in Role]: GullOf<R> }[Role];

/** A stat's u (stat / 20), clamped to 0..1. */
export const unit = (stat: number): number =>
  Math.min(1, Math.max(0, stat / 20));

/** A stat kept to 0..20 at one decimal. */
export const stat = (x: number): number =>
  Math.round(Math.min(20, Math.max(0, x)) * 10) / 10;

/** A gull from what every gull has and a role's stats by name. The caller (the generator, growth) gives exactly the
 *  role's stat names (ROLE_STATS), which the tests hold it to. */
export function gullOf(
  core: GullCore,
  role: Role,
  stats: Readonly<Record<string, number>>,
  ceiling: Readonly<Record<string, number>>
): Gull {
  const made: unknown = { ...core, role, stats, ceiling };
  return made as Gull;
}

/** A gull with new stats by name (the same names). */
export const withStats = (
  g: Gull,
  stats: Readonly<Record<string, number>>
): Gull => gullOf(g, g.role, stats, g.ceiling);
