// The career's time (D41, Phase B section 1): an event queue ordered by (day, seq). Advance pops events up to and
// including the next that needs the player, applying each (career/advance.ts). Nothing scans every gull every day:
// each crew acts on its own events, and daily quantities (fatigue, the yard) are worked out in closed form over the
// days between them.
//
// Each kind names the section that schedules it and handles it.

/** What happens on a day. */
export type Happening =
  | { kind: 'race'; round: number }                                   // section 13: race day (needs the player)
  | { kind: 'seasonEnd' }                                             // section 13
  | { kind: 'seasonStart' }                                           // section 13: targets, money, the calendar
  | { kind: 'review'; crew: number }                                  // section 6: a rival's weekly review
  | { kind: 'designed'; crew: number }                                // section 8.3: a design is drawn
  | { kind: 'built'; crew: number }                                   // section 8.3: its part is built
  | { kind: 'building'; crew: number; building: string }              // section 9: works finished
  | { kind: 'answer'; talk: number }                                  // section 5: a gull answers an offer
  | { kind: 'report'; crew: number; scout: number }                   // section 4: a scout reports
  | { kind: 'closing'; season: number }                               // section 5: the last days of contracts ending this season open
  | { kind: 'silence'; season: number }                               // section 5: those still offered no renewal lose heart
  | { kind: 'lapse'; talk: number }                                   // section 5: a counter not taken lapses
  | { kind: 'jobExpires'; crew: number }                              // section 7: a job offer lapses (needs the player)
  | { kind: 'proposal'; league: number; round: number }               // section 11: the Admiralty puts a proposal
  | { kind: 'vote'; league: number; proposal: number }                // section 11: its votes are counted
  | { kind: 'patronOffer'; crew: number }                             // section 10
  | { kind: 'dilemma'; id: string; crew: number };                    // section 12

export type Event = Happening & { day: number; seq: number };
export type EventKind = Event['kind'];

/** Whether an event comes before another. */
const before = (a: Event, b: Event): boolean => a.day < b.day || (a.day === b.day && a.seq < b.seq);

/** A queue with an event added in its place: the queue is new, the old one untouched. */
export function scheduled(queue: readonly Event[], event: Event): Event[] {
  let lo = 0, hi = queue.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (before(queue[mid], event)) lo = mid + 1;
    else hi = mid;
  }
  return [...queue.slice(0, lo), event, ...queue.slice(lo)];
}

/** What the state's queue needs to schedule: the queue and the next seq. */
export interface Timed { queue: readonly Event[]; seq: number }

/** A state with a happening scheduled on a day, its seq the state's next. */
export function schedule<S extends Timed>(s: S, day: number, happening: Happening): S {
  const event: Event = { ...happening, day, seq: s.seq };
  return { ...s, queue: scheduled(s.queue, event), seq: s.seq + 1 };
}

/** A state with every event matching `drop` taken out (a cancelled scouting, a withdrawn offer). */
export function unscheduled<S extends Timed>(s: S, drop: (e: Event) => boolean): S {
  const queue = s.queue.filter((e) => !drop(e));
  return queue.length === s.queue.length ? s : { ...s, queue };
}

/** The next event, if any. */
export const next = (queue: readonly Event[]): Event | null => queue[0] ?? null;

/** Whether a queue is in order (an invariant the tests hold the state to). */
export function ordered(queue: readonly Event[]): boolean {
  for (let i = 1; i < queue.length; i++) if (!before(queue[i - 1], queue[i])) return false;
  return true;
}
