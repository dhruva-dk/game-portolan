// The whole career in one immutable value (Phase B section 1): every person and team, the championships and their rules, the
// calendar, the player, mail, the ledger, talks, scouting, the event queue and every random stream's counter. It is
// plain JSON (career/canon.ts Json): a snapshot is its canonical text. Ids are indices: person i is people[i], team i is
// teams[i]. Nothing is ever removed from people (the retired keep their history) or teams.

import type { Colours, PartType, RaceResult, Rules } from '../race.ts';
import type {
  Building,
  Change,
  MailCategory,
  Offer,
  Plan,
  Ship,
  Trade,
  ImprovementShare,
} from '../office.ts';
import type { Streams } from './dice.ts';
import type { Event } from './queue.ts';
import type { Person } from './roles.ts';

/** A ship's two who sail and serve her: the driver (null on the player's own ship: the player sails her) and her mechanic. */
export interface Hands {
  driver: number | null;
  mechanic: number | null;
}

/** Who works for a team, by person id. Every person listed here has a contract with this team, and no other is listed. */
export interface Staff {
  manager: number | null; // null while the post is open (section 7)
  chairman: number;
  ships: readonly Hands[]; // race.ts TEAM of them, by ship
  reserve: number | null;
  designer: number | null;
  scouts: readonly number[]; // one a crow's nest level at most
  pit: readonly number[]; // the pit crew, TUNING.world.pit of them at most
}

/** A building's level, and the works under way to the next (Phase B section 9). */
export interface Works {
  level: number;
  next: { level: number; done: number } | null;
}

/** A part a team owns (Phase B section 8.1). Performance (perf) 0..1000; reliability, risk, condition 0..1. */
export interface Part {
  id: number;
  type: PartType;
  perf: number;
  perfMax: number;
  reliability: number;
  reliabilityMax: number;
  risk: number;
  condition: number;
  components: readonly string[];
  ship: Ship | null;
  forNext: boolean;
  spec: boolean;
  cost: number; // its design's cost, for fines
}

/** A part's numbers as a design projects them, or as built. */
export interface Numbers {
  perf: number;
  perfMax: number;
  reliability: number;
  reliabilityMax: number;
  risk: number;
}

/** A design in hand (Phase B section 8.3): designed by `designed`, built by `built`. `projected` is fixed at its start;
 *  `drawn` by the designer's Accuracy when it is designed. */
export interface Design {
  type: PartType;
  components: readonly string[];
  forNext: boolean;
  started: number;
  designed: number;
  built: number;
  cost: number;
  projected: Numbers;
  drawn: Numbers | null;
}

/** A design's cards before it starts (D18): its type, and each slot's deal (the cards, whether redealt once). */
export interface Draft {
  type: PartType;
  deals: readonly {
    slot: number;
    cards: readonly string[];
    redealt: boolean;
  }[];
}

/** A sponsor's objective in a race (Phase B section 10). */
export type Objective = 'top10' | 'sinkTwo' | 'afloat' | 'mostSea';

/** A sponsor, offered or signed (Phase B section 10): a fixed sum a race (no objectives), or a bonus for the objective
 *  chosen in each race plan from its list; for so many races; of a grade (the landing pad's level it needs). */
export interface Sponsor {
  id: number;
  name: string;
  perRace: number;
  objectives: readonly Objective[];
  bonus: number;
  races: number;
  grade: number;
}

/** A sponsor's offer standing until a day. */
export interface SponsorOffer {
  sponsor: Sponsor;
  expires: number;
}

/** A team (Phase B section 3). */
export interface Team {
  id: number;
  name: string;
  colours: Colours;
  emblem: number;
  colony: number;
  tier: number; // 0 Tier 1, 1 Two, 2 Three
  staff: Staff;
  balance: number;
  budget: number;
  debtFloor: number; // balance below which no spend is accepted (negative)
  reputation: number; // 0..100
  confidence: number; // the chairman's in the manager, 0..100
  target: number; // the chairman's target place, 1 the first
  buildings: Readonly<Record<Building, Works>>;
  parts: readonly Part[];
  design: Design | null;
  draft: Draft | null;
  designs: number; // designs ever started: seeds each design's deals
  improvement: readonly ImprovementShare[];
  improvementDay: number; // the day the improvement's work is reckoned to (closed form, career/improvement.ts)
  lastNew: Readonly<Record<PartType, Ship | null>>; // who got the last new part of each type
  bonds: readonly number[]; // each ship's mechanic and driver, by ship
  suppliers: Readonly<Record<Trade, string | null>>;
  sponsors: readonly (Sponsor | null)[]; // by slot, three
  offers: readonly SponsorOffer[];
  plan: Plan | null;
  player: boolean;
}

export interface Standing {
  team: number;
  points: number;
  wins: number;
  podiums: number;
  sinkings: number;
}

/** An Admiralty proposal (Phase B section 11): voted before `round`, on day `closes`. `votes` by team id; `lobbied`
 *  the sway Coin has added to each side; `decided` true (carried), false (the rule kept), null (open). */
export interface Proposal {
  id: number;
  round: number;
  closes: number;
  change: Change;
  votes: Readonly<Record<string, Side>>;
  lobbied: { for: number; against: number };
  decided: boolean | null;
}
export type Side = 'for' | 'against' | 'abstain';

/** A line of a championship's drivers' table: who sailed (the player too), the team they last sailed for, and their season. */
export interface DriverStanding {
  person: number;
  team: number;
  points: number;
  wins: number;
  podiums: number;
  sinkings: number;
}

export interface Championship {
  id: number; // its tier: 0 the first
  teams: readonly number[]; // race.ts TEAMS of them, by id
  rules: Rules; // this season's
  next: Rules; // next season's, as voted
  standings: readonly Standing[];
  drivers: readonly DriverStanding[]; // everyone who has sailed a race of it this season
  proposals: readonly Proposal[];
}

/** A planet of the calendar: the career keeps only its seed and what its rules read; screens sketch it (epic 4.1). */
export interface Planet {
  seed: number;
  name: string;
  pace: number;
}
export interface Round {
  day: number;
  planet: Planet;
}
export interface Calendar {
  season: number;
  start: number;
  rounds: readonly Round[];
  end: number;
}

/** The race day under way: its round, whether the player's race began, and the three championships' results. */
export interface RaceDay {
  round: number;
  started: boolean;
  results: readonly (RaceResult | null)[];
}

/** A message (Phase B section 12). */
export interface Mail {
  id: number;
  day: number;
  category: MailCategory;
  sender: number | null; // a person, or null for the Admiralty's secretary
  kind: string; // the template (career/mail.ts)
  wording: number;
  slots: Readonly<Record<string, string | number>>;
  links: readonly {
    to: 'person' | 'part' | 'building' | 'screen' | 'team';
    id: string | number;
  }[];
  read: boolean;
  dilemma: {
    id: string;
    options: readonly string[];
    answer: number | null;
  } | null;
}

/** A line of the player's team's ledger (Phase B section 10). */
export interface LedgerLine {
  day: number;
  kind: string;
  what: string;
  amount: number;
  balance: number;
}

/** Talks between a team and a person (Phase B section 5). */
export interface Talk {
  id: number;
  team: number;
  person: number;
  offer: Offer;
  made: number;
  answer: number;
  counter: Offer | null;
  scout: number | null;
}

/** A scout at work (Phase B section 4). */
export interface Scouting {
  team: number;
  scout: number;
  person: number;
  started: number;
  done: number;
}

/** A team's offer of its manager's post to the player (Phase B section 7). */
export interface JobOffer {
  team: number;
  made: number;
  expires: number;
}

/** The player (D35): their person, their team, their manager's reputation, and the posts they are offered. */
export interface Player {
  person: number;
  team: number;
  reputation: number;
  sacked: boolean;
  offers: readonly JobOffer[];
}

export interface CareerState {
  schema: number; // career/migrate.ts SCHEMA
  seed: number; // the world's
  day: number;
  season: number; // 0 the first
  round: number; // the next round of the season to sail, 0..rounds
  streams: Streams;
  player: Player | null; // null until Found
  colonies: readonly string[];
  people: readonly Person[];
  teams: readonly Team[];
  championships: readonly Championship[];
  calendar: Calendar | null;
  race: RaceDay | null;
  mail: readonly Mail[];
  ledger: readonly LedgerLine[];
  talks: readonly Talk[];
  scouting: readonly Scouting[];
  queue: readonly Event[];
  seq: number; // the next event's seq
  ids: {
    part: number;
    mail: number;
    talk: number;
    proposal: number;
    sponsor: number;
  };
  flags: Readonly<Record<string, number>>; // once-a-season markers (e.g. the storm-damage dilemma), by name
}

/** The state before Found: no world yet. Found makes it from the command's seed. */
export function beginning(schema: number): CareerState {
  return {
    schema,
    seed: 0,
    day: 0,
    season: 0,
    round: 0,
    streams: {},
    player: null,
    colonies: [],
    people: [],
    teams: [],
    championships: [],
    calendar: null,
    race: null,
    mail: [],
    ledger: [],
    talks: [],
    scouting: [],
    queue: [],
    seq: 0,
    ids: { part: 0, mail: 0, talk: 0, proposal: 0, sponsor: 0 },
    flags: {},
  };
}

/** A list with some of its items replaced (each by its id, which is its place), the rest shared. */
function replaced<T extends { id: number }>(
  list: readonly T[],
  changed: readonly T[]
): readonly T[] {
  if (changed.length === 0) return list;
  const out = [...list];
  for (const x of changed) out[x.id] = x;
  return out;
}

/** A state with some people replaced (by id), the rest shared. */
export const withPeople = (
  s: CareerState,
  changed: readonly Person[]
): CareerState => ({ ...s, people: replaced(s.people, changed) });
/** A state with one person replaced. */
export const withPerson = (s: CareerState, g: Person): CareerState =>
  withPeople(s, [g]);

/** A state with some teams replaced (by id), the rest shared. */
export const withTeams = (
  s: CareerState,
  changed: readonly Team[]
): CareerState => ({ ...s, teams: replaced(s.teams, changed) });
/** A state with one team replaced. */
export const withTeam = (s: CareerState, c: Team): CareerState =>
  withTeams(s, [c]);

/** A team by id. An id past the teams is a broken state: thrown, and refused by the reducer (career/career.ts apply). */
export function teamOf(s: CareerState, id: number): Team {
  const c = s.teams[id];
  if (!c) throw new Error(`no team ${id}`);
  return c;
}

/** A championship by its tier; as teamOf. */
export function championshipOf(s: CareerState, tier: number): Championship {
  const l = s.championships[tier];
  if (!l) throw new Error(`no tier ${tier}`);
  return l;
}

/** A person by id; as teamOf. */
export function personAt(s: CareerState, id: number): Person {
  const g = s.people[id];
  if (!g) throw new Error(`no person ${id}`);
  return g;
}

/** Every person on a team's staff, by id. */
export function staffOf(c: Team): number[] {
  const { manager, chairman, ships, reserve, designer, scouts, pit } = c.staff;
  const ids = [
    manager,
    chairman,
    ...ships.flatMap((h) => [h.driver, h.mechanic]),
    reserve,
    designer,
    ...scouts,
    ...pit,
  ];
  return ids.filter((id): id is number => id !== null);
}
