// The seam's people views: team, profile, offer, market, career and jobs, built by career/views-*.ts
// and drawn by ui/office/. Types only, as office.ts: plain data, every figure with its comparison and its explanation.

import type { Colours } from '../race.ts';
import type { Face, Figure, Line, TopBar } from './career.ts';
import type { Offer, Role, Ship, Status, Want } from './command.ts';

/** Stars as a team sees them: exact (lo = hi) once known, else a range. */
export interface Range {
  lo: number;
  hi: number;
  known: boolean;
}
/** A button's state: open, or shut with the reason said beside it. */
export interface Act {
  ok: boolean;
  why: string;
}

/** A line of the roster: a role's heading, a person (the player, at the head of the drivers), or an open post. */
export interface RosterRow {
  kind: 'head' | 'person' | 'open';
  id: number | null;
  you: boolean;
  title: string; // head: the role; person: the name; open: the post wanting
  face: Face | null;
  post: string;
  age: string;
  stars: Range | null;
  potential: Range | null;
  morale: number | null;
  wage: string;
  ends: string;
  tags: readonly string[];
  find: { role: Role; status: Status } | null; // an open post: the market's filter that finds them
  /** A person of hers: whether their contract may be renewed now, and why not (null: a heading, an open post, her). */
  renew: Act | null;
}
/** A pit crew member: their work in a stop, how often they slip, and how tired they are. */
export interface PitRow {
  id: number;
  face: Face;
  name: string;
  work: Figure;
  slip: Figure;
  fatigue: Figure;
}
/** `team`: the roster, its wages and open posts, the bonds, the pit crew. */
export interface TeamView {
  top: TopBar;
  roster: readonly RosterRow[];
  wages: Figure;
  open: readonly { role: Role; status: Status; label: string }[];
  /**
   * Each ship's bond between its driver and its mechanic: `fill` how far to the
   * strongest (0…100), `marks` where each level is reached (shares of the
   * strongest, 0…1), `level` the one reached (0: none yet).
   */
  bonds: readonly {
    ship: Ship;
    label: string;
    bond: Figure;
    fill: number;
    marks: readonly number[];
    level: number;
  }[];
  pit: readonly PitRow[];
  /** The pit crew as a ship's stop has them (race.ts PitCrew), by ship. */
  stops: readonly { ship: Ship; pace: Figure; slip: Figure }[];
}

/** A stat as the profile draws it: its value, its ceiling, and which way it is heading. */
export interface StatLine {
  label: string;
  value: number;
  ceiling: number | null;
  arrow: -1 | 0 | 1;
  text: string;
}
/** A trait as the profile reads it: what it does, when it holds, and whether it helps her team (1), hinders it (−1)
 *  or both (0). */
export interface TraitLine {
  name: string;
  effect: string;
  lasts: string;
  sense: -1 | 0 | 1;
}
/** A season of a person's history. */
interface HistoryLine {
  season: string;
  team: string;
  tier: string;
  role: string;
  races: number;
  best: string;
  points: number;
  sinkings: number;
}
/** `profile`: any person, of any role, as the player's team sees them. */
export interface ProfileView {
  top: TopBar;
  id: number;
  known: boolean;
  mine: boolean;
  you: boolean;
  face: Face;
  name: string;
  role: Role;
  roleName: string;
  age: number;
  colony: string;
  team: string;
  tier: string;
  post: string;
  stars: Range;
  potential: Range;
  traits: readonly TraitLine[];
  /** A driver's or mechanic's of her own ships: the bond with whom they sail beside, and its share of the strongest. */
  bond: { with: string; figure: Figure; share: number } | null;
  morale: Figure | null;
  marketability: Figure;
  wants: readonly { want: Want; label: string }[] | null; // null: not yet scouted
  stats: readonly StatLine[];
  statsNote: string;
  specifics: readonly { label: string; figure: Figure }[];
  history: readonly HistoryLine[];
  contract: {
    title: string;
    terms: readonly Line[];
    parties: readonly [string, string];
  } | null;
  talk: string | null;
  scout: Act & { scout: number | null; label: string };
  offer: Act;
  renew: Act;
  dismiss: Act & { owed: Figure };
}

/** `offer`: the contract document, the person's side of it, and where the talks stand. */
export interface OfferView {
  top: TopBar;
  id: number;
  name: string;
  face: Face;
  role: Role;
  roleName: string;
  stars: Range;
  team: string;
  draft: Offer; // the offer drawn: as asked of the view, else the counter, the last offer, or the ask
  ask: { wage: number; fee: number; seasons: 1 | 2 | 3 };
  statuses: readonly { id: Status; label: string }[];
  replaces: readonly { id: number | null; label: string }[];
  most: { wage: number; fee: number; bonus: number; breakClause: number };
  cost: { now: Figure; perRace: Figure; left: Figure };
  wants: readonly { want: Want; label: string; value: number; text: string }[];
  patience: { left: number; of: number };
  last: string | null;
  earlier: readonly { day: string; answer: string }[];
  rivals: readonly string[];
  counter: Offer | null;
  state: 'open' | 'countered' | 'waiting' | 'silent' | 'signed';
  stateText: string;
  send: Act;
  accept: Act;
  withdraw: Act;
}

/** The market's filter. `tier`: 0..2, 3 the free agents, null any. `contract`: any, free agents, in their last 60 days. */
export interface ScoutingFilter {
  role: Role;
  tier: number | null;
  contract: 'any' | 'free' | 'closing';
  known: boolean;
  stars: number;
}
/** A person as the market lists them. */
export interface ScoutingRow {
  id: number;
  face: Face;
  name: string;
  age: number;
  stars: Range;
  potential: Range;
  team: string;
  contract: string;
  ask: string;
  talk: string | null;
}
/** A scout at work, or free. */
export interface ScoutRow {
  id: number;
  face: Face;
  name: string;
  stars: number;
  reach: string;
  on: string | null;
  days: Figure | null;
  cancel: Act;
}
/** `market`: the people found by the filter, the shortlist, and the scouts. */
export interface ScoutingView {
  top: TopBar;
  filter: ScoutingFilter;
  roles: readonly { id: Role; label: string }[];
  /** The championships by tier (the filter's 0…2), the first the highest. */
  tiers: readonly string[];
  rows: readonly ScoutingRow[];
  count: string;
  shortlist: readonly ScoutingRow[];
  scouts: readonly ScoutRow[];
  nest: Figure;
}

/** A team's offer of its manager's post. */
export interface JobCard {
  team: number;
  name: string;
  tier: string;
  colours: Colours;
  emblem: number;
  chairman: string;
  chairmanFace: Face;
  target: string;
  budget: Figure;
  standing: string;
  expires: string;
  take: Act;
}
/** `career`: the player as a manager. */
export interface CareerView {
  top: TopBar;
  face: Face;
  name: string;
  team: string;
  age: number;
  reputation: Figure;
  rank: Figure;
  marketability: Figure;
  confidence: Figure;
  record: readonly {
    season: string;
    team: string;
    tier: string;
    role: string;
    races: number;
    points: number;
  }[];
  honours: readonly string[];
  offers: readonly JobCard[];
}
/** `jobs`: the chairman's letter (sacked, or tempted away), and the posts offered. */
export interface JobsView {
  sacked: boolean;
  letter: {
    from: string;
    face: Face | null;
    title: string;
    paragraphs: readonly string[];
  };
  offers: readonly JobCard[];
}

/** What the people screens ask of the desk (office.ts Desk extends it). */
export interface PeopleDesk {
  team(): TeamView;
  /** A person's profile (null: the first in talks, else ship two's driver). */
  profile(person: number | null): ProfileView;
  /** The offer to a person, drawn on `draft` (null: as the talks stand). */
  offer(person: number | null, draft: Offer | null): OfferView;
  market(
    filter: ScoutingFilter | null,
    shortlist: readonly number[]
  ): ScoutingView;
  career(): CareerView;
  jobs(): JobsView;
}
