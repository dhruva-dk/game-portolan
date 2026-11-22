// Advance (D41, Phase B section 1): pops the queue's events up to and including the next one that needs the player
// (race day, a dilemma, an answer, a deadline), applying each by its kind's handler. The day becomes each event's day
// as it is popped. Each section adds its kinds' handlers to EVENTS (a kind with none is a bug: it throws).

import type { Dice } from './dice.ts';
import { accept, refuse, type Applied, type Handlers } from './command.ts';
import type { Event, EventKind } from './queue.ts';
import type { CareerState } from './state.ts';

/** An event's handler: the state with the event applied (the event is already off the queue, the day already its). */
export type EventHandler<K extends EventKind> = (
  s: CareerState,
  event: Extract<Event, { kind: K }>,
  roll: Dice
) => CareerState;
export type EventHandlers = { readonly [K in EventKind]?: EventHandler<K> };

/** Whether an event stops Advance for the player once applied. */
type Stops = (s: CareerState, event: Event) => boolean;

/** The kinds that always need the player. Others may need them by the state (a dilemma for the player's team). A new
 *  season's first day stops too: its planets and suppliers wait, and it splits the forty-four days off in two. */
const ALWAYS_STOP: ReadonlySet<EventKind> = new Set<EventKind>([
  'race',
  'jobExpires',
]);

/** Whether any of today's mail meets a test (mail is kept in the order it came, so only its tail is read). */
function mailedToday(
  s: CareerState,
  test: (m: CareerState['mail'][number]) => boolean
): boolean {
  for (let i = s.mail.length - 1; i >= 0 && s.mail[i].day === s.day; i--)
    if (test(s.mail[i])) return true;
  return false;
}

/** The default stop rule: race day, a job offer's deadline, a season's first day, and anything addressed to the
 *  player's team that leaves them a choice (an answer to their offer, a dilemma of theirs). */
export const stopsFor: Stops = (s, e) => {
  if (ALWAYS_STOP.has(e.kind)) return true;
  // the first season opens on the founding day itself: nothing to stop for
  if (e.kind === 'seasonStart') return s.season > 0;
  const mine = s.player?.team;
  // a dilemma of the player's team whose mail came (its trigger still held: career/dilemmas.ts)
  if (e.kind === 'dilemma')
    return (
      e.team === mine &&
      mailedToday(s, (m) => m.dilemma?.id === e.id && m.dilemma.answer === null)
    );
  // an answer to the player's offer: by now the talk is gone (signed or refused) or carries a counter, and the player
  // has mail of it naming the talk (a person answers every offer due that day on the first one's event; each other
  // offer's own event still comes, and stops if the offer was the player's)
  if (e.kind === 'answer')
    return mailedToday(s, (m) => m.slots.talk === e.talk);
  // a rival's review that approached one of the player's people: they may answer it with a renewal before the person decides
  if (e.kind === 'review')
    return s.talks.some(
      (t) =>
        t.team === e.team &&
        t.made === s.day &&
        s.people[t.person].contract?.team === mine
    );
  return false;
};

/** Why Advance cannot move, or null. */
export function advanceCheck(
  s: CareerState
): { code: string; sentence: string } | null {
  if (s.player?.sacked)
    return {
      code: 'sacked',
      sentence: 'You have no team: take one of the posts offered.',
    };
  if (s.race !== null)
    return {
      code: 'raceDay',
      sentence: 'It is race day: set the race plan and sail.',
    };
  if (s.queue.length === 0)
    return { code: 'nothing', sentence: 'Nothing lies ahead on the calendar.' };
  return null;
}

/** Advance, with a set of event handlers. */
function advance(s: CareerState, roll: Dice, events: EventHandlers): Applied {
  const blocked = advanceCheck(s);
  if (blocked) return refuse(blocked.code, blocked.sentence);
  let state = s;
  while (state.queue.length > 0) {
    const [event, ...rest] = state.queue;
    const handler = events[event.kind] as EventHandler<EventKind> | undefined;
    if (!handler)
      throw new Error(`Advance: no handler for a '${event.kind}' event`);
    state = handler(
      { ...state, queue: rest, day: Math.max(state.day, event.day) },
      event as Extract<Event, { kind: EventKind }>,
      roll
    );
    // the player sacked (an chairman's verdict at the season's end) needs them at once: the posts offered wait
    if (stopsFor(state, event) || state.player?.sacked) break;
  }
  return accept(state);
}

/** The Advance handler, given the events (career/career.ts passes them all). */
export const timeHandlers = (events: EventHandlers): Handlers => ({
  Advance: (s, _c, roll) => advance(s, roll, events),
});
