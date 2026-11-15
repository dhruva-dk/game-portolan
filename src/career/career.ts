// The management game: pure, headless, deterministic (no DOM, no three, no Date, no Math.random). It imports only
// itself, world/random.ts, race.ts, office.ts and kinds.ts (tests/architecture.test.ts LAYERS). It never runs a race:
// it says which are due (race.ts RaceCard) and takes their results (RaceResult); the screens read it through office.ts.
//
// `apply(state, command)` is the reducer: the new state, or a typed refusal with a sentence for the player. It never
// throws on a bad command. Each section's handlers are joined here (COMMANDS, EVENTS); a command kind with no handler
// yet is refused, never guessed at.

import type { Command, CommandKind } from '../office.ts';
import { TIME_EVENTS, timeHandlers, type EventHandlers } from './advance.ts';
import { refuse, type Applied, type Handler, type Handlers } from './command.ts';
import { CREWING } from './crewing.ts';
import { dice } from './dice.ts';
import { FOUNDING } from './found.ts';
import { SCHEMA } from './migrate.ts';
import { beginning, type CareerState } from './state.ts';

export type { Applied } from './command.ts';
export type { CareerState } from './state.ts';

/** Every event kind's handler. */
export const EVENTS: EventHandlers = { ...TIME_EVENTS };

/** Every command kind's handler. */
export const COMMANDS: Handlers = { ...FOUNDING, ...timeHandlers(EVENTS), ...CREWING };

/** The commands only a debug build takes (D42). */
const DEBUG: ReadonlySet<CommandKind> = new Set<CommandKind>(['DebugCoin', 'DebugReveal', 'DebugToRaceDay', 'DebugToSeasonEnd']);

/** The state a career begins from, before Found. */
export const start = (): CareerState => beginning(SCHEMA);

/** What `apply` is told besides the state and the command: whether debug commands are taken. */
export interface Allow { debug: boolean }

/** The reducer. Same state and command, same result. */
export function apply(s: CareerState, command: Command, allow: Allow = { debug: false }): Applied {
  if (command === null || typeof command !== 'object' || typeof command.kind !== 'string') return refuse('malformed', 'That order makes no sense.');
  if (DEBUG.has(command.kind) && !allow.debug) return refuse('debug', 'Playtest orders are off.');
  if (s.player === null && command.kind !== 'Found') return refuse('unfounded', 'Found a crew first.');
  const handler = COMMANDS[command.kind] as Handler<CommandKind> | undefined;
  if (!handler) return refuse('unavailable', 'The career does not take that order.');
  const roll = dice(s.player === null && command.kind === 'Found' ? command.seed : s.seed, s.streams);
  let out: Applied;
  try {
    out = handler(s, command, roll);
  } catch (e) {
    // a command whose fields are not what its type says, or a rule's bug: refused, never thrown at the screen; the
    // tests hold every generated command clear of this
    return refuse('fault', `The career could not take that order (${e instanceof Error ? e.message : String(e)}).`);
  }
  return out.ok ? { ok: true, state: { ...out.state, streams: roll.counters() } } : out;
}
