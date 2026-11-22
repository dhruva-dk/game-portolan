// The seam's papers: the mail, the calendar, the finances, the sponsors, the
// headquarters and the ship, as the office draws them (built by
// career/papers.ts), and the people views (people.ts) with the liveries' dyes
// as the page shows them. Types only.

import type { PartType } from '../race.ts';
import type { Building, Ship } from './command.ts';
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

/** `calendar`: the season's races. */
export interface CalendarPaper {
  championship: string;
  races: readonly {
    round: number;
    name: string;
    date: string;
    when: 'sailed' | 'today' | 'ahead';
  }[];
}

/** A sum under its name. */
interface Sum {
  label: string;
  amount: number;
}
/** `finances`: the balance, what a race brings and costs, and the ledger, newest first. */
export interface FinancesPaper {
  balance: number;
  race: readonly Sum[];
  net: number;
  ledger: readonly {
    date: string;
    what: string;
    amount: number;
    balance: number;
  }[];
}

/** A sponsor: what it pays and for what, for how many races, and its standing. */
export interface Backer {
  id: number;
  name: string;
  pays: string;
  amount: number;
  races: number;
  grade: number;
}
/** `sponsors`: the three slots, and the offers standing (each with the days it stands and whether it may be signed). */
export interface SponsorsPaper {
  slots: readonly (Backer | null)[];
  offers: readonly (Backer & { days: number; sign: Act })[];
}

/** `hq`: the buildings, each at its level, with what the next would cost. */
export interface HqPaper {
  buildings: readonly {
    id: Building;
    name: string;
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
}
/** A slot of the design on the drawing board: its cards once dealt, the one picked, and whether it may be dealt again. */
interface Slot {
  cards: readonly { id: string; name: string; effect: string }[];
  picked: string | null;
  deal: Act;
}
/**
 * `ship`: each ship's parts, the spares, the design in hand, and the design
 * on the drawing board (its type, its slots, what it would be and cost).
 */
export interface ShipPaper {
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
