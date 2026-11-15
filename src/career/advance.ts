// Advance (D41, Phase B section 1): pops the queue's events up to and including the next one that needs the player
// (race day, a dilemma, an answer, a deadline), applying each by its kind's handler. The day becomes each event's day
// as it is popped. Each section adds its kinds' handlers to EVENTS (a kind with none is a bug: it throws).

import type { Dice } from './dice.ts';
import { accept, refuse, type Applied, type Handlers } from './command.ts';
import type { Event, EventKind } from './queue.ts';
import type { CareerState } from './state.ts';

/** An event's handler: the state with the event applied (the event is already off the queue, the day already its). */
export type EventHandler<K extends EventKind> = (s: CareerState, event: Extract<Event, { kind: K }>, roll: Dice) => CareerState;
export type EventHandlers = { readonly [K in EventKind]?: EventHandler<K> };

/** Whether an event stops Advance for the player once applied. */
export type Stops = (s: CareerState, event: Event) => boolean;

/** Race day: the round's races are due. Advance stops; the race plan and the results follow (section 13). */
const raceDay: EventHandler<'race'> = (s, e) => ({ ...s, round: e.round, race: { round: e.round, started: false, results: s.leagues.map(() => null) } });

/** The handlers of the kinds this module knows; sections join theirs in career/career.ts. */
export const TIME_EVENTS: EventHandlers = { race: raceDay };

/** The kinds that always need the player. Others may need them by the state (a dilemma for the player's crew). */
const ALWAYS_STOP: ReadonlySet<EventKind> = new Set<EventKind>(['race', 'jobExpires']);

/** The default stop rule: race day, a job offer's deadline, and anything addressed to the player's crew that leaves
 *  them a choice (an answer to their offer, a dilemma of theirs). */
export const stopsFor: Stops = (s, e) => {
  if (ALWAYS_STOP.has(e.kind)) return true;
  const mine = s.player?.crew;
  if (e.kind === 'dilemma') return e.crew === mine;
  if (e.kind === 'answer') return s.talks.find((t) => t.id === e.talk)?.crew === mine;
  return false;
};

/** Why Advance cannot move, or null. */
export function advanceCheck(s: CareerState): { code: string; sentence: string } | null {
  if (s.race !== null) return { code: 'raceDay', sentence: 'It is race day: set the race plan and sail.' };
  if (s.queue.length === 0) return { code: 'nothing', sentence: 'Nothing lies ahead on the calendar.' };
  return null;
}

/** Advance, with a set of event handlers. */
export function advance(s: CareerState, roll: Dice, events: EventHandlers): Applied {
  const blocked = advanceCheck(s);
  if (blocked) return refuse(blocked.code, blocked.sentence);
  let state = s;
  while (state.queue.length > 0) {
    const [event, ...rest] = state.queue;
    const handler = events[event.kind] as EventHandler<EventKind> | undefined;
    if (!handler) throw new Error(`Advance: no handler for a '${event.kind}' event`);
    state = handler({ ...state, queue: rest, day: Math.max(state.day, event.day) }, event as Extract<Event, { kind: EventKind }>, roll);
    if (stopsFor(state, event)) break;
  }
  return accept(state);
}

/** The Advance handler, given the events (career/career.ts passes them all). */
export const timeHandlers = (events: EventHandlers): Handlers => ({ Advance: (s, _c, roll) => advance(s, roll, events) });
