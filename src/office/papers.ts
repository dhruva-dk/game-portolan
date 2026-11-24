// The seam's papers: the mail, the calendar, the finances, the sponsors, the
// headquarters and the ship, as the office draws them (built by
// career/papers.ts), and the people views (people.ts) with the liveries' dyes
// as the page shows them. Types only.

import type { PartType } from '../race.ts';
import type { Building, ImprovementShare, Ship } from './command.ts';
import type { Act } from './people.ts';

/** A people view with each dye's two colours as the page shows them, by the dye's number. */
export interface Dyed<V> {
  view: V;
  dyes: readonly (readonly [string, string])[];
}

/** A letter as the list has it. */
export interface Letter {
  id: number;
  date: string;
  subject: string;
  from: string;
  about: string;
  unread: boolean;
  sealed: boolean;
}
/** `mail`: the letters, newest first, and the one open: its words, and a dilemma's answers (the one given, if any). */
export interface MailPaper {
  letters: readonly Letter[];
  open:
    | (Letter & {
        body: string;
        options: readonly string[];
        answer: number | null;
      })
    | null;
}

/**
 * `calendar`: the season's races, the one chosen (by index: the next unless
 * another was asked for), each with how many days off it is (0 or less:
 * today or sailed), the storm's pace on its planet (× the rules' own), and
 * whether the Admiralty's vote closes on it; and the season's other days, as
 * the career has them scheduled.
 */
export interface CalendarPaper {
  championship: string;
  season: number;
  chosen: number;
  races: readonly {
    round: number;
    name: string;
    date: string;
    when: 'sailed' | 'today' | 'ahead';
    days: number;
    storm: number;
    vote: boolean;
  }[];
  dates: readonly { date: string; what: string }[];
}

/** A sum under its name. */
interface Sum {
  label: string;
  amount: number;
}
/**
 * `finances`: the balance and the chairman's floor under it (below it nothing
 * that spends is accepted); what a race brings and costs; where the season
 * will end on what is committed (the races left, the prize at her place now);
 * this season's money by what it was for, what came in first; the balance day
 * by day since the season began (the chart's line, to `today`, projected on to
 * `end`); and the ledger, newest first.
 */
export interface FinancesPaper {
  balance: number;
  floor: number;
  race: readonly Sum[];
  net: number;
  projection: { races: number; place: number; prize: number; end: number };
  season: readonly Sum[];
  chart: {
    from: string;
    to: string;
    start: number;
    today: number;
    end: number;
    points: readonly { day: number; balance: number }[];
  };
  ledger: readonly {
    date: string;
    what: string;
    amount: number;
    balance: number;
  }[];
}

/** A sponsor: its grade, the races it has left, a fixed sum a race or a bonus for the objective chosen in each race's
 *  plan (each objective what meeting it pays), and what it is reckoned worth a race. */
export interface Backer {
  id: number;
  name: string;
  grade: number;
  races: number;
  perRace: number;
  objectives: readonly { label: string; pays: number }[];
  worth: number;
}
/**
 * `sponsors`: the three slots; the offers standing, each with the days it
 * stands and whether it may be signed into each slot (`into`, by slot: an
 * empty one, or over the sponsor there); the market: her team's
 * marketability (0…100, what offers are sized by), the highest grade the
 * landing pad receives, the days to the next offers (null: none to come), and
 * what the slots are worth a race together.
 */
export interface SponsorsPaper {
  slots: readonly (Backer | null)[];
  offers: readonly (Backer & { days: number; into: readonly Act[] })[];
  marketability: number;
  grade: number;
  grades: number;
  next: number | null;
  worth: number;
}

/** A bar of a chart against the championship: three shares (0…1), hers, the best and the average. */
export interface Measure {
  name: string;
  value: number;
  best: number;
  average: number;
}

/**
 * `hq`: how built up it is against the championship (overall, then by what
 * the buildings are for), how many of each part's components her designer
 * knows, and the buildings, each at its level, with what it is for and what
 * the next level would cost.
 */
export interface HqPaper {
  stats: readonly Measure[];
  knowledge: readonly { part: string; known: number; of: number }[];
  buildings: readonly {
    id: Building;
    name: string;
    about: string;
    level: number;
    top: number;
    upkeep: number;
    cost: number;
    days: number;
    under: { done: number; days: number } | null;
    build: Act;
  }[];
}

/** A part: what it is, how good and how sound, how worn, and the ship it is on (null: a spare). */
export interface PartLine {
  id: number;
  type: PartType;
  name: string;
  perf: number;
  perfMax: number;
  reliability: number;
  condition: number;
  ship: Ship | null;
  spec: boolean; // a standard part: never improved
}
/** A slot of the design on the drawing board: its cards once dealt, the one picked, and whether it may be dealt again. */
interface Slot {
  cards: readonly { id: string; name: string; effect: string }[];
  picked: string | null;
  deal: Act;
}
/**
 * `ship`: the ships' stats against the championship (overall, then each type
 * of part: shares of the most any team has), who supplies each trade, how the
 * improvement's work is shared (0: idle), each ship's parts, the spares, the
 * design in hand, and the design on the drawing board (its type, its slots,
 * what it would be and cost).
 */
export interface ShipPaper {
  stats: readonly Measure[];
  suppliers: readonly { trade: string; name: string | null }[];
  improving: {
    perf: number;
    reliability: number;
    shares: readonly ImprovementShare[]; // each part's share of the work, as the team split it
  };
  ships: readonly { name: string; driver: string }[];
  types: readonly { id: PartType; label: string }[];
  parts: readonly PartLine[];
  design: { name: string; done: number; days: number } | null;
  draft: {
    type: PartType;
    slots: readonly Slot[];
    perf: number;
    perfMax: number;
    reliability: number;
    cost: number;
    days: number;
    start: Act;
  };
}
