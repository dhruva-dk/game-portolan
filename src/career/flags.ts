// The state's flags (Phase B sections 12 and 13): named markers a dilemma's answer or a rule leaves for later, each a
// day. A race flag (`guest:<team>`, `rest:<person>`, `push:<person>`, `cover:<person>`, `pushed:<person>`, `forfeit:<team>`)
// holds on the race day it names; a window flag (`slow:<team>`, `exempt:<team>`) is the day its window ends; a
// once-flag (`storm:<team>`, `grey:<team>`, `newPart:<team>`) the day it was last used.

import type { CareerState } from './state.ts';

/** The flags dropped once their day is past. */
const RACE = [
  'guest',
  'rest',
  'push',
  'cover',
  'pushed',
  'forfeit',
  'slow',
  'exempt',
];

/** A flag's day, or null. */
export const flag = (s: CareerState, key: string): number | null =>
  s.flags[key] ?? null;

/** A state with a flag set to a day. */
export const flagged = (
  s: CareerState,
  key: string,
  day: number
): CareerState => ({ ...s, flags: { ...s.flags, [key]: day } });

/** A state with a flag taken off. */
export function unflagged(s: CareerState, key: string): CareerState {
  if (!(key in s.flags)) return s;
  const flags = { ...s.flags };
  delete flags[key];
  return { ...s, flags };
}

/** Whether a race flag holds today (race day). */
export const today = (s: CareerState, key: string): boolean =>
  s.flags[key] === s.day;

/** The day of the next race to sail, or null at the season's end. */
export const nextRace = (s: CareerState): number | null =>
  s.calendar?.rounds[s.round]?.day ?? null;

/** A state with the race and window flags whose day is past dropped. */
export function flagsCleared(s: CareerState): CareerState {
  const keys = Object.keys(s.flags).filter(
    (k) => RACE.includes(k.split(':')[0]) && s.flags[k] < s.day
  );
  if (keys.length === 0) return s;
  const flags = { ...s.flags };
  for (const k of keys) delete flags[k];
  return { ...s, flags };
}

/** The days of [from, to) inside a window flag's `length` days ending on its day. */
export function within(
  s: CareerState,
  key: string,
  length: number,
  from: number,
  to: number
): number {
  const end = s.flags[key];
  if (end === undefined) return 0;
  return Math.max(0, Math.min(to, end) - Math.max(from, end - length));
}
