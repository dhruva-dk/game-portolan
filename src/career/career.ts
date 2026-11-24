// The management game: pure, headless, deterministic (no DOM, no three, no Date, no Math.random). It imports only
// itself, world/random.ts, race.ts, office.ts and kinds.ts (tests/architecture.test.ts LAYERS). It never runs a race:
// it says which are due (race.ts RaceCard) and takes their results (RaceResult); the screens read it through office.ts.
//
// `apply(state, command)` is the reducer: the new state, or a typed refusal with a sentence for the player. It never
// throws on a bad command. Each section's handlers are joined here (COMMANDS, EVENTS); a command kind with no handler
// yet is refused, never guessed at.

import type { Command, CommandKind } from '../office/command.ts';
import { ADMIRALTY, counted, proposalPut } from './regulations.ts';
import { timeHandlers, type EventHandlers } from './advance.ts';
import { DESIGNING, built, drawn } from './design.ts';
import { FITTING } from './parts.ts';
import { SPONSORS, offersCome } from './sponsors.ts';
import { BUILDING, finished } from './hq.ts';
import { SUPPLYING } from './suppliers.ts';
import { IMPROVEMENT } from './improvement.ts';
import {
  refuse,
  type Applied,
  type Handler,
  type Handlers,
} from './command.ts';
import { BOARD } from './board.ts';
import { dice } from './dice.ts';
import { FOUNDING } from './found.ts';
import { HIRING, closingOpens, hear, lapse, silenceFalls } from './hiring.ts';
import { JOBS_TAKEN, jobLapses } from './jobs.ts';
import { RIVAL_EVENTS } from './rivals.ts';
import { SCOUTING } from './scouting.ts';
import { MAIL, dilemmaComes } from './dilemmas.ts';
import { debugHandlers } from './playtest.ts';
import { RACING, raceDay } from './raceday.ts';
import { seasonBegun, seasonEnded } from './season.ts';
import { SCHEMA } from './migrate.ts';
import { beginning, type CareerState } from './state.ts';

export type { Applied } from './command.ts';
export type { CareerState } from './state.ts';

/** Every event kind's handler. */
export const EVENTS: EventHandlers = {
  ...RIVAL_EVENTS,
  answer: hear,
  lapse,
  closing: closingOpens,
  silence: silenceFalls,
  jobExpires: jobLapses,
  designed: drawn,
  built,
  building: finished,
  sponsorOffer: offersCome,
  proposal: proposalPut,
  vote: counted,
  race: raceDay,
  seasonEnd: seasonEnded,
  seasonStart: seasonBegun,
  dilemma: dilemmaComes,
};

/** Every command kind's handler. */
export const COMMANDS: Handlers = {
  ...FOUNDING,
  ...timeHandlers(EVENTS),
  ...SCOUTING,
  ...HIRING,
  ...JOBS_TAKEN,
  ...IMPROVEMENT,
  ...FITTING,
  ...DESIGNING,
  ...BUILDING,
  ...SUPPLYING,
  ...SPONSORS,
  ...ADMIRALTY,
  ...RACING,
  ...MAIL,
  ...BOARD,
  ...debugHandlers(EVENTS),
};

/** The commands only a debug build takes. */
const DEBUG: ReadonlySet<CommandKind> = new Set<CommandKind>([
  'DebugBalance',
  'DebugReveal',
  'DebugToRaceDay',
  'DebugToSeasonEnd',
]);

/** What the career takes while the player's race is under way: its result, and the mail read. Nothing else may change
 *  who sails or how (career/lineup.ts reads the state as it stands). */
const RACING_TAKES: ReadonlySet<CommandKind> = new Set<CommandKind>([
  'RecordRace',
  'Forfeit',
  'MarkRead',
]);

/** The state a career begins from, before Found. */
export const start = (): CareerState => beginning(SCHEMA);

/** What `apply` is told besides the state and the command: whether debug commands are taken. */
interface Allow {
  debug: boolean;
}

/** The reducer. Same state and command, same result. */
export function apply(
  s: CareerState,
  command: Command,
  allow: Allow = { debug: false }
): Applied {
  if (
    command === null ||
    typeof command !== 'object' ||
    typeof command.kind !== 'string'
  )
    return refuse('malformed', 'That order makes no sense.');
  if (DEBUG.has(command.kind) && !allow.debug)
    return refuse('debug', 'Playtest orders are off.');
  if (s.player === null && command.kind !== 'Found')
    return refuse('unfounded', 'Found a team first.');
  const handler = COMMANDS[command.kind] as Handler<CommandKind> | undefined;
  if (!handler)
    return refuse('unavailable', 'The career does not take that order.');
  if (s.race?.started && !RACING_TAKES.has(command.kind))
    return refuse('racing', 'The race is under way.');
  const roll = dice(
    s.player === null && command.kind === 'Found' ? command.seed : s.seed,
    s.streams
  );
  let out: Applied;
  try {
    out = handler(s, command, roll);
  } catch (e) {
    // a command whose fields are not what its type says, or a rule's bug: refused, never thrown at the screen; the
    // tests hold every generated command clear of this
    return refuse(
      'fault',
      `The career could not take that order (${e instanceof Error ? e.message : String(e)}).`
    );
  }
  return out.ok
    ? { ok: true, state: { ...out.state, streams: roll.counters() } }
    : out;
}
