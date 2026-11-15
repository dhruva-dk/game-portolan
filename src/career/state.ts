// The whole career in one immutable value (Phase B section 1): every gull and crew, the leagues and their rules, the
// calendar, the player, mail, the ledger, talks, scouting, the event queue and every random stream's counter. It is
// plain JSON (career/canon.ts Json): a snapshot is its canonical text. Ids are indices: gull i is gulls[i], crew i is
// crews[i]. Nothing is ever removed from gulls (the retired keep their history) or crews.

import type { Colours, PartType, RaceResult, Rules } from '../race.ts';
import type { Building, Change, MailCategory, Offer, Plan, Ship, Trade, YardShare } from '../office.ts';
import type { Streams } from './dice.ts';
import type { Event } from './queue.ts';
import type { Gull } from './roles.ts';

/** A ship's two who sail and serve her: the captain (null on the player's ship one: the player sails her) and her bosun. */
export interface Hands { captain: number | null; bosun: number | null }

/** Who works for a crew, by gull id. Every gull listed here has a contract with this crew, and no other is listed. */
export interface Staff {
  manager: number | null;                            // null while the post is open (section 7)
  elder: number;
  ships: readonly [Hands, Hands];
  reserve: number | null;
  shipwright: number | null;
  scouts: readonly number[];                         // one a crow's nest level at most
  flight: readonly number[];                         // four; each one's job is on the gull
}

/** A building's level, and the works under way to the next (Phase B section 9). */
export interface Works { level: number; next: { level: number; done: number } | null }

/** A part a crew owns (Phase B section 8.1). Performance (perf) 0..1000; reliability, risk, condition 0..1. */
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
  cost: number;                                      // its design's cost, for fines
}

/** A part's numbers as a design projects them, or as built. */
export interface Numbers { perf: number; perfMax: number; reliability: number; reliabilityMax: number; risk: number }

/** A design in hand (Phase B section 8.3): designed by `designed`, built by `built`. `projected` is fixed at its start;
 *  `drawn` by the shipwright's Accuracy when it is designed. */
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
export interface Draft { type: PartType; deals: readonly { slot: number; cards: readonly string[]; redealt: boolean }[] }

/** A patron's objective in a race (Phase B section 10). */
export type Objective = 'top10' | 'sinkTwo' | 'afloat' | 'mostSea';

/** A patron, offered or signed (Phase B section 10): a fixed sum a race (no objectives), or a bonus for the objective
 *  chosen in each race plan from its list; for so many races; of a tier (the landing pad's level it needs). */
export interface Patron { id: number; name: string; perRace: number; objectives: readonly Objective[]; bonus: number; races: number; tier: number }

/** A patron's offer standing until a day. */
export interface PatronOffer { patron: Patron; expires: number }

/** A crew (Phase B section 3). */
export interface Crew {
  id: number;
  name: string;
  colours: Colours;
  emblem: number;
  colony: number;
  league: number;                                    // 0 League One, 1 Two, 2 Three
  staff: Staff;
  coin: number;
  budget: number;
  debtFloor: number;                                 // coin below which no spend is accepted (negative)
  reputation: number;                                // 0..100
  confidence: number;                                // the elder's in the manager, 0..100
  target: number;                                    // the elder's target place, 1..40
  buildings: Readonly<Record<Building, Works>>;
  parts: readonly Part[];
  design: Design | null;
  draft: Draft | null;
  designs: number;                                   // designs ever started: seeds each design's deals
  yard: readonly YardShare[];
  yardDay: number;                                   // the day the yard's work is reckoned to (closed form, career/yard.ts)
  lastNew: Readonly<Record<PartType, Ship | null>>;  // who got the last new part of each type
  bonds: readonly [number, number];                  // each ship's bosun and captain
  suppliers: Readonly<Record<Trade, string | null>>;
  patrons: readonly (Patron | null)[];               // by slot, three
  offers: readonly PatronOffer[];
  plan: Plan | null;
  player: boolean;
}

export interface Standing { crew: number; points: number; wins: number; podiums: number; sinkings: number }

/** An Admiralty proposal (Phase B section 11): voted before `round`, on day `closes`. `votes` by crew id; `lobbied`
 *  the sway Coin has added to each side; `decided` true (carried), false (the rule kept), null (open). */
export interface Proposal { id: number; round: number; closes: number; change: Change; votes: Readonly<Record<string, Side>>; lobbied: { for: number; against: number }; decided: boolean | null }
export type Side = 'for' | 'against' | 'abstain';

export interface League {
  id: number;
  crews: readonly number[];                          // forty, by id
  rules: Rules;                                      // this season's
  next: Rules;                                       // next season's, as voted
  standings: readonly Standing[];
  proposals: readonly Proposal[];
}

/** A planet of the calendar: the career keeps only its seed and what its rules read; screens sketch it (epic 4.1). */
export interface Planet { seed: number; name: string; pace: number }
export interface Round { day: number; planet: Planet }
export interface Calendar { season: number; start: number; rounds: readonly Round[]; end: number }

/** The race day under way: its round, whether the player's race began, and the three leagues' results. */
export interface RaceDay { round: number; started: boolean; results: readonly (RaceResult | null)[] }

/** A message (Phase B section 12). */
export interface Mail {
  id: number;
  day: number;
  category: MailCategory;
  sender: number | null;                             // a gull, or null for the Admiralty's secretary
  kind: string;                                      // the template (career/mail.ts)
  wording: number;
  slots: Readonly<Record<string, string | number>>;
  links: readonly { to: 'gull' | 'part' | 'building' | 'screen' | 'crew'; id: string | number }[];
  read: boolean;
  dilemma: { id: string; options: readonly string[]; answer: number | null } | null;
}

/** A line of the player's crew's ledger (Phase B section 10). */
export interface LedgerLine { day: number; kind: string; what: string; amount: number; balance: number }

/** Talks between a crew and a gull (Phase B section 5). */
export interface Talk { id: number; crew: number; gull: number; offer: Offer; made: number; answer: number; counter: Offer | null; scout: number | null }

/** A scout at work (Phase B section 4). */
export interface Scouting { crew: number; scout: number; gull: number; started: number; done: number }

/** A crew's offer of its manager's post to the player (Phase B section 7). */
export interface JobOffer { crew: number; made: number; expires: number }

/** The player (D35): their gull, their crew, their manager's reputation, and the posts they are offered. */
export interface Player { gull: number; crew: number; reputation: number; sacked: boolean; offers: readonly JobOffer[] }

export interface CareerState {
  schema: number;                                    // career/migrate.ts SCHEMA
  seed: number;                                      // the world's
  day: number;
  season: number;                                    // 0 the first
  round: number;                                     // the next round of the season to sail, 0..rounds
  streams: Streams;
  player: Player | null;                             // null until Found
  colonies: readonly string[];
  gulls: readonly Gull[];
  crews: readonly Crew[];
  leagues: readonly League[];
  calendar: Calendar | null;
  race: RaceDay | null;
  mail: readonly Mail[];
  ledger: readonly LedgerLine[];
  talks: readonly Talk[];
  scouting: readonly Scouting[];
  queue: readonly Event[];
  seq: number;                                       // the next event's seq
  ids: { part: number; mail: number; talk: number; proposal: number; patron: number };
  flags: Readonly<Record<string, number>>;           // once-a-season markers (e.g. the storm-damage dilemma), by name
}

/** The state before Found: no world yet. Found makes it from the command's seed. */
export function beginning(schema: number): CareerState {
  return {
    schema, seed: 0, day: 0, season: 0, round: 0, streams: {}, player: null, colonies: [], gulls: [], crews: [], leagues: [],
    calendar: null, race: null, mail: [], ledger: [], talks: [], scouting: [], queue: [], seq: 0,
    ids: { part: 0, mail: 0, talk: 0, proposal: 0, patron: 0 }, flags: {},
  };
}

/** A state with some gulls replaced (by id), the rest shared. */
export function withGulls(s: CareerState, changed: readonly Gull[]): CareerState {
  if (changed.length === 0) return s;
  const gulls = [...s.gulls];
  for (const g of changed) gulls[g.id] = g;
  return { ...s, gulls };
}

/** A state with some crews replaced (by id), the rest shared. */
export function withCrews(s: CareerState, changed: readonly Crew[]): CareerState {
  if (changed.length === 0) return s;
  const crews = [...s.crews];
  for (const c of changed) crews[c.id] = c;
  return { ...s, crews };
}

/** Every gull on a crew's staff, by id. */
export function staffOf(c: Crew): number[] {
  const { manager, elder, ships, reserve, shipwright, scouts, flight } = c.staff;
  const ids = [manager, elder, ...ships.flatMap((h) => [h.captain, h.bosun]), reserve, shipwright, ...scouts, ...flight];
  return ids.filter((id): id is number => id !== null);
}
