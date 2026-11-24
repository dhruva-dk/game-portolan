// A season's calendar: ten race days fourteen days apart, then thirty days off, each race on a
// planet fixed when the season is made (its seed, its name, its storm pace). The next season starts a YEAR later.

import { schedule } from './queue.ts';
import { within, type Rand } from './dice.ts';
import { planet } from './names.ts';
import type { CareerState, Calendar } from './state.ts';
import { YEAR } from './stars.ts';
import { TUNING } from './tuning.ts';

/** A season's calendar from its first day, its planets drawn. */
export function makeCalendar(
  season: number,
  start: number,
  rand: Rand
): Calendar {
  const { rounds, gap } = TUNING.calendar;
  const P = TUNING.planetPace;
  const list = Array.from({ length: rounds }, (_, r) => ({
    day: start + gap * (r + 1),
    planet: {
      seed: Math.floor(rand() * 4294967296) >>> 0,
      name: planet(rand),
      pace:
        Math.round(
          Math.round(within(rand, P.lo, P.hi) / P.step) * P.step * 100
        ) / 100,
    },
  }));
  return { season, start, rounds: list, end: list[list.length - 1].day };
}

/** The day the season after one starting on `start` starts. */
export const nextStart = (start: number): number => start + YEAR;

/** A state with a calendar's opening (its planets mailed, halfway between the last season's end and its first race,
 *  or at once for the first season), race days, its contracts' last days (and the day silence costs morale) and its
 *  season's end scheduled. */
export function scheduleSeason(
  s: CareerState,
  calendar: Calendar
): CareerState {
  const M = TUNING.market;
  const opening = Math.floor(
    (calendar.start - TUNING.calendar.off + calendar.rounds[0].day) / 2
  );
  let out = schedule(s, Math.max(s.day, opening), { kind: 'seasonStart' });
  calendar.rounds.forEach((r, round) => {
    out = schedule(out, r.day, { kind: 'race', round });
  });
  out = schedule(out, calendar.end - M.closingDays, {
    kind: 'closing',
    season: calendar.season,
  });
  out = schedule(out, calendar.end - M.closingDays + M.silenceDays, {
    kind: 'silence',
    season: calendar.season,
  });
  // the Federation's proposals, each tier's, standing `open` days before the rounds they are voted before
  for (const round of TUNING.regulations.rounds) {
    for (let tier = 0; tier < s.championships.length; tier++) {
      out = schedule(
        out,
        calendar.rounds[round].day - TUNING.regulations.open,
        { kind: 'proposal', tier, round }
      );
    }
  }
  return schedule(out, calendar.end, { kind: 'seasonEnd' });
}

/** A state with every team's first sponsor offers scheduled from a day, staggered by team id over two weeks; each
 *  offer schedules the next (career/sponsors.ts). */
export function sponsorsScheduled(s: CareerState, from: number): CareerState {
  return s.teams.reduce(
    (acc, c) =>
      schedule(acc, from + 1 + (c.id % TUNING.calendar.gap), {
        kind: 'sponsorOffer',
        team: c.id,
      }),
    s
  );
}

/** The day of a team's first review: staggered by team id over the week. */
const firstReview = (team: number, from: number): number =>
  from + 1 + (team % TUNING.rivals.review);

/** A state with every team's first review scheduled from a day; each review schedules the next. */
export function reviewsScheduled(s: CareerState, from: number): CareerState {
  return s.teams.reduce(
    (acc, c) =>
      schedule(acc, firstReview(c.id, from), { kind: 'review', team: c.id }),
    s
  );
}
