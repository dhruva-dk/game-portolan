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
  // an answer to the player's offer: by now the talk is gone (signed or refused) or carries a counter, and the player
  // has mail of it naming the talk (a gull answers every offer due that day on the first one's event; each other
  // offer's own event still comes, and stops if the offer was the player's)
  if (e.kind === 'answer') return s.mail.some((m) => m.day === s.day && m.slots.talk === e.talk);
  // a rival's review that approached one of the player's gulls: they may answer it with a renewal before the gull decides
  if (e.kind === 'review') return s.talks.some((t) => t.crew === e.crew && t.made === s.day && s.gulls[t.gull].contract?.crew === mine);
  return false;
};

/** Why Advance cannot move, or null. */
export function advanceCheck(s: CareerState): { code: string; sentence: string } | null {
  if (s.player?.sacked) return { code: 'sacked', sentence: 'You have no crew: take one of the posts offered.' };
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
