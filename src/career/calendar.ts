// A season's calendar (Phase B section 13): ten race days fourteen days apart, then thirty days off, each race on a
// planet fixed when the season is made (its seed, its name, its storm pace). The next season starts a YEAR later.

import { schedule } from './queue.ts';
import { within, type Rand } from './dice.ts';
import { planet } from './names.ts';
import type { CareerState, Calendar } from './state.ts';
import { YEAR } from './stars.ts';
import { TUNING } from './tuning.ts';

/** A season's calendar from its first day, its planets drawn. */
export function makeCalendar(season: number, start: number, rand: Rand): Calendar {
  const { rounds, gap } = TUNING.calendar;
  const P = TUNING.planetPace;
  const list = Array.from({ length: rounds }, (_, r) => ({
    day: start + gap * (r + 1),
    planet: {
      seed: Math.floor(rand() * 4294967296) >>> 0,
      name: planet(rand),
      pace: Math.round(Math.round(within(rand, P.lo, P.hi) / P.step) * P.step * 100) / 100,
    },
  }));
  return { season, start, rounds: list, end: list[list.length - 1].day };
}

/** The day the season after one starting on `start` starts. */
export const nextStart = (start: number): number => start + YEAR;

/** A state with a calendar's race days and its season's end scheduled. */
export function scheduleSeason(s: CareerState, calendar: Calendar): CareerState {
  let out = s;
  calendar.rounds.forEach((r, round) => { out = schedule(out, r.day, { kind: 'race', round }); });
  return schedule(out, calendar.end, { kind: 'seasonEnd' });
}
