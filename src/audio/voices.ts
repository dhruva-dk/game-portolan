// The voices: at most VOICES one-shot sounds play at once (the phone's audio thread kept light), each in a slot the
// mixer keeps wired (mixer.ts). A new sound takes a free slot (one whose sound has ended), else the slot of the sound
// of lowest priority, the oldest among those, if that is no higher than its own; else it is not played. Pure: which
// slot, by numbers alone.

/** The most one-shot sounds playing at once. */
export const VOICES = 16;

/** Each slot's sound: when it began and ends (the context's clock, s), and its priority. */
export interface Pool { begins: Float64Array; ends: Float64Array; priority: Float64Array }

export const pool = (n = VOICES): Pool => ({ begins: new Float64Array(n), ends: new Float64Array(n), priority: new Float64Array(n) });

/** The slot a sound of `priority` from `begins` to `ends` takes at `now`, marked as its; −1 if none may be had. */
export function claim(p: Pool, now: number, priority: number, begins: number, ends: number): number {
  let slot = -1;
  for (let i = 0; i < p.ends.length; i++) {
    if (p.ends[i] <= now) {
      slot = i;
      break;
    }
    const worse = slot < 0 || p.priority[i] < p.priority[slot] || (p.priority[i] === p.priority[slot] && p.begins[i] < p.begins[slot]);
    if (p.priority[i] <= priority && worse) slot = i;
  }
  if (slot < 0) return -1;
  p.begins[slot] = begins;
  p.ends[slot] = ends;
  p.priority[slot] = priority;
  return slot;
}

/** How many slots are playing at `now`. */
export const playing = (p: Pool, now: number) => p.ends.reduce((n, e) => n + (e > now ? 1 : 0), 0);

/** Every slot freed (a new sea: nothing carries over). */
export function clear(p: Pool) {
  p.begins.fill(0);
  p.ends.fill(0);
  p.priority.fill(0);
}
