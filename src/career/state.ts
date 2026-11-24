import type { GunKind } from '../sim/kinds.ts';
import type { DriverStats } from '../sim/setup.ts';
import type { Livery } from '../world/livery.ts';

export const VERSION = 1;

export type Line =
  | 'sails'
  | 'rigging'
  | 'rudder'
  | 'hull'
  | 'keel'
  | 'mounts'
  | 'gun';
export type Role = 'driver' | 'designer' | 'mechanic';
export type Levels = Record<Line, number>;
export type Focus = { line: Line } | { gun: GunKind } | null;
export type Terms = {
  wage: number;
  seasons: 1 | 2 | 3;
  fee: number;
  clause: number;
};

export type Contract = {
  team: number;
  wage: number;
  clause: number;
  racesLeft: number;
};

export type Person = {
  id: number;
  role: Role;
  name: string;
  portrait: number;
  age: number;
  peakAge: number;
  retireAge: number;
  peak: number[];
  stats: number[];
  wants: { money: number; standing: number; security: number };
  preferred: 1 | 2 | 3;
  wageFactor: number;
  contract: Contract | null;
};

export type Owner = {
  id: number;
  name: string;
  portrait: number;
  stats: number[];
};

export type Deal = { candidates: number[]; locked: number | null };
export type Talk = {
  person: number;
  attempts: number;
  answer: 'signed' | 'refused' | 'countered' | null;
  counter: Terms | null;
};
export type Objective = 'top10' | 'sinkTwo' | 'sea' | 'bothAfloat';
export type Sponsor = {
  sponsor: number;
  fee: number;
  bonus: number;
  objective: Objective;
  racesLeft: number;
};
export type Ship = { fitted: Levels; gun: GunKind };

export type Team = {
  name: string;
  livery: Livery;
  emblem: number;
  taste: GunKind[];
  owner: Owner | null;
  balance: number;
  design: Levels;
  unlocked: GunKind[];
  unlockProgress: Record<GunKind, number>;
  focus: Focus;
  ships: [Ship, Ship];
  seats: Record<Role, number | null>;
  scoutSeat: Role;
  approached: Record<Role, number | null>;
  deals: Record<Role, Deal | null>;
  talks: Talk[];
  sponsors: [Sponsor | null, Sponsor | null, Sponsor | null];
  offers: Sponsor[];
};

export type Range = { lo: number; hi: number };
export type Knowledge = { reports: number[]; lines: Record<Line, Range>[][] };

export type Change<T> = { before: T; after: T };

export type ShipReport = {
  place: number;
  sinkings: number;
  sunk: boolean;
  sunkBy: number | null;
};

export type SponsorRow = {
  sponsor: number;
  objective: Objective;
  met: boolean;
  amount: number;
};

export type MoneyRows = {
  place: number;
  sinkings: number;
  sea: number;
  sponsors: SponsorRow[];
  wages: number;
  paid: number[];
  interest: number;
};

export type Workshop = {
  focus: { line: Line } | { gun: GunKind };
  before: number;
  after: number;
};

export type RaceReport = {
  season: number;
  race: number;
  planet: string;
  ships: [ShipReport, ShipReport];
  driver: number | null;
  shotsFired: number;
  shotsLanded: number;
  sea: number;
  podium: number[];
  points: number;
  money: MoneyRows;
  balance: Change<number>;
  standing: Change<number>;
  workshop: Workshop | null;
  repossessed: boolean;
};

export type SeasonCard = {
  name: string;
  role: Role;
  portrait: number;
  age: Change<number>;
  stats: Change<number[]>;
  racesLeft: number;
  retired: boolean;
};

export type TableRow = { team: number; points: number };

export type OffseasonReport = {
  table: TableRow[];
  prize: number;
  seats: Record<Role, SeasonCard | null>;
  design: Change<Levels>;
  fitted: [Change<Levels>, Change<Levels>];
};

export type NewsKind =
  | 'yourFinish'
  | 'yourSeason'
  | 'raceWon'
  | 'hired'
  | 'poached'
  | 'retired'
  | 'rookie'
  | 'repossessed'
  | 'streak'
  | 'title'
  | 'sponsorSigned'
  | 'unlocked'
  | 'lineLead';

export type NewsEvent = {
  kind: NewsKind;
  team?: number;
  team2?: number;
  person?: string;
  personId?: number;
  sponsor?: string;
  line?: Line;
  gun?: GunKind;
  place?: number;
  n?: number;
  age?: number;
  planet?: string;
};

export type Phase = 'lobby' | 'racing' | 'offseason';

export type CareerState = {
  version: number;
  seed: string;
  season: number;
  race: number;
  phase: Phase;
  unread: boolean;
  teams: Team[];
  people: Person[];
  nextPersonId: number;
  points: number[];
  bestPlace: number[];
  previousStanding: number[];
  lastStanding: number[];
  winStreak: { team: number; n: number } | null;
  lineLeaders: Record<Line, number | null>;
  knowledge: Knowledge;
  lastRace: RaceReport | null;
  lastOffseason: OffseasonReport | null;
  pendingEvents: NewsEvent[];
  news: NewsEvent[];
  seen: string[];
};

export const LINES: readonly Line[] = [
  'sails',
  'rigging',
  'rudder',
  'hull',
  'keel',
  'mounts',
  'gun',
];

export const ROLES: readonly Role[] = ['driver', 'designer', 'mechanic'];

export const perLine = <T>(f: (line: Line) => T): Record<Line, T> => ({
  sails: f('sails'),
  rigging: f('rigging'),
  rudder: f('rudder'),
  hull: f('hull'),
  keel: f('keel'),
  mounts: f('mounts'),
  gun: f('gun'),
});

export const perRole = <T>(f: (role: Role) => T): Record<Role, T> => ({
  driver: f('driver'),
  designer: f('designer'),
  mechanic: f('mechanic'),
});

export const DRIVER_STATS = [
  'gunnery',
  'helm',
  'nerve',
  'territory',
  'stormcraft',
  'lookout',
] satisfies readonly (keyof DriverStats)[];

export const MECHANIC_STATS = [
  'shield',
  'healSpeed',
  'healAmount',
  'thrift',
  'upkeep',
];

export const STATS: Record<Role, readonly string[]> = {
  driver: DRIVER_STATS,
  designer: LINES,
  mechanic: MECHANIC_STATS,
};

export const PHASES: readonly Phase[] = ['lobby', 'racing', 'offseason'];

export const OBJECTIVES: readonly Objective[] = [
  'top10',
  'sinkTwo',
  'sea',
  'bothAfloat',
];

export const NEWS_KINDS: readonly NewsKind[] = [
  'yourFinish',
  'yourSeason',
  'raceWon',
  'hired',
  'poached',
  'retired',
  'rookie',
  'repossessed',
  'streak',
  'title',
  'sponsorSigned',
  'unlocked',
  'lineLead',
];

export const BUBBLES: readonly string[] = [
  'steer',
  'fire',
  'gust',
  'heal',
  'home',
  'storm',
  'sunk',
  'team',
  'ship',
  'sponsors',
  'opponents',
];
