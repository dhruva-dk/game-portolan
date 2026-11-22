// The playtest commands (Phase B section 16, D42): taken only when debug.ts enables them (career/career.ts), and
// journaled like any other. DebugCoin gives the player's crew Coin; DebugReveal shows the player every gull;
// DebugToRaceDay and DebugToSeasonEnd run the calendar past every stop but race day (a race is never skipped: its
// result is the match's to give), up to the next race day or through the season's end.

import type { EventHandler, EventHandlers } from './advance.ts';
import { accept, refuse, type Applied, type Handlers } from './command.ts';
import { paid } from './coin.ts';
import type { Dice } from './dice.ts';
import { mine } from './post.ts';
import type { EventKind } from './queue.ts';
import type { CareerState } from './state.ts';
import { stars } from './stars.ts';

/** The most Coin one DebugCoin gives or takes. */
const MOST = 1_000_000;

/** Events applied, no stop heeded, until `done` holds after one, a race day comes, or the queue is empty. */
function ran(
  s: CareerState,
  roll: Dice,
  ctx: { events: EventHandlers; done: (kind: EventKind) => boolean }
): Applied {
  if (s.player?.sacked)
    return refuse('sacked', 'You have no crew: take one of the posts offered.');
  if (s.race !== null)
    return refuse('raceDay', 'It is race day: set the race plan and sail.');
  let state = s;
  while (state.queue.length > 0) {
    const [event, ...rest] = state.queue;
    const handler = ctx.events[event.kind] as
      | EventHandler<EventKind>
      | undefined;
    if (!handler) throw new Error(`no handler for a '${event.kind}' event`);
    state = handler(
      { ...state, queue: rest, day: Math.max(state.day, event.day) },
      event as Extract<typeof event, { kind: EventKind }>,
      roll
    );
    if (state.race !== null || ctx.done(event.kind) || state.player?.sacked)
      break;
  }
  return accept(state);
}

/** The debug handlers, given every event's (career/career.ts passes them). */
export const debugHandlers = (events: EventHandlers): Handlers => ({
  DebugCoin: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no crew: take one of the posts offered.'
      );
    if (
      typeof c.coin !== 'number' ||
      !Number.isInteger(c.coin) ||
      Math.abs(c.coin) > MOST ||
      c.coin === 0
    )
      return refuse(
        'coin',
        'Give a whole sum of Coin, not zero, up to a million either way.'
      );
    return accept(
      paid(s, me, -c.coin, { kind: 'debug', what: 'a playtest grant' })
    );
  },
  DebugReveal: (s) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no crew: take one of the posts offered.'
      );
    const gulls = s.gulls.map((g) =>
      g.retired !== null || g.player || g.known[me]
        ? g
        : {
            ...g,
            known: {
              ...g.known,
              [me]: { day: s.day, last: stars(g), by: null, used: false },
            },
          }
    );
    return accept({ ...s, gulls });
  },
  DebugToRaceDay: (s, _c, roll) => ran(s, roll, { events, done: () => false }),
  DebugToSeasonEnd: (s, _c, roll) =>
    ran(s, roll, { events, done: (kind) => kind === 'seasonEnd' }),
});
