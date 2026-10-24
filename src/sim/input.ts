// What a ship does in a tick: ShipInput, the only way the player and the captains act on a match. The interface
// quantises touch into it; captains fill it from inside the step. Then the recording of the player's inputs as
// change events, and its replay, which rebuilds exactly the struct of every tick.
import { TERRITORY } from './sphere.ts';
import { SAIL, type Ship } from './state.ts';

/** ShipInput.flags bits. */
export const FLAG = {
  breakOff: 1, // swipe up: peel off the Great Current
  headHome: 2, // held: sail the shortest safe route back to the ship's own waters
  callGull: 4, // spend doubloons to send the gull for a chest
  useAimed: 8, // fire the fitting that needs a target, at `aim`
  dive: 16, // the gull dives at a rival, at `aim`
} as const;
const ALL_FLAGS = 31;

export const STEER_MAX = 127;

export interface ShipInput {
  /** The helm: −127 hard to port … 127 hard to starboard. */
  steer: number;
  /** This tick's sail step: −1 reef one setting, 0 hold, +1 make one more. */
  sail: number;
  /** FLAG bits. */
  flags: number;
  /** The consumable slot (0–2) to use this tick, or −1. */
  consumable: number;
  /** The target of an aimed action as a territory cell, or −1 to aim automatically. */
  aim: number;
  /** The item (0–2) chosen from an opened chest, or −1. */
  chestPick: number;
  /** A newly drawn course (territory cells in order), [] to drop the course, or null for no change. */
  course: number[] | null;
}

export function idleInput(): ShipInput {
  return { steer: 0, sail: 0, flags: 0, consumable: -1, aim: -1, chestPick: -1, course: null };
}

/** Apply the lasting part of an input to its ship: the sail setting and the drawn course. */
export function applyControls(ship: Ship, input: ShipInput): void {
  ship.sail = Math.min(SAIL.full, Math.max(SAIL.reefed, ship.sail + input.sail));
  if (input.course !== null) ship.course = input.course.slice();
}

// ---------------------------------------------------------------------------------------------------------------
// Recording. Every field holds its value until an event changes it, so the input of tick t is the result of all
// events up to t, and a replay can start at any tick. Recordings are test data and saved as JSON.

export const INPUT_FIELDS = ['steer', 'sail', 'flags', 'consumable', 'aim', 'chestPick', 'course'] as const;
export type InputField = (typeof INPUT_FIELDS)[number];
type FieldValue = number | number[] | null;
export type InputEvent = [tick: number, field: InputField, value: FieldValue];

export interface Recording {
  format: 1;
  /** In tick order. */
  events: InputEvent[];
}

const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isCell = (v: unknown): v is number => isInt(v, 0, TERRITORY.cells - 1);

function valid(field: InputField, v: unknown): v is FieldValue {
  switch (field) {
    case 'steer': return isInt(v, -STEER_MAX, STEER_MAX);
    case 'sail': return isInt(v, -1, 1);
    case 'flags': return isInt(v, 0, ALL_FLAGS);
    case 'consumable': case 'chestPick': return isInt(v, -1, 2);
    case 'aim': return v === -1 || isCell(v);
    case 'course': return v === null || (Array.isArray(v) && v.every(isCell));
  }
}

const same = (a: FieldValue, b: FieldValue): boolean =>
  a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((c, i) => c === b[i]));

const copyOf = (v: FieldValue): FieldValue => (Array.isArray(v) ? v.slice() : v);

function setField(input: ShipInput, field: InputField, v: FieldValue): void {
  if (field === 'course') input.course = v as number[] | null;
  else input[field] = v as number;
}

export interface Recorder {
  readonly recording: Recording;
  /** The input as of the last recorded tick. */
  readonly held: ShipInput;
  lastTick: number;
}

export function recorder(): Recorder {
  return { recording: { format: 1, events: [] }, held: idleInput(), lastTick: -1 };
}

/** Record the input of `tick` (ticks strictly increasing): one event per field that changed. */
export function record(r: Recorder, tick: number, input: ShipInput): void {
  if (!(Number.isInteger(tick) && tick > r.lastTick)) throw new RangeError(`record: tick ${tick} after ${r.lastTick}`);
  for (const field of INPUT_FIELDS) {
    const v = input[field];
    if (!valid(field, v)) throw new RangeError(`record: bad ${field} at tick ${tick}`);
    if (same(v, r.held[field])) continue;
    r.recording.events.push([tick, field, copyOf(v)]);
    setField(r.held, field, copyOf(v));
  }
  r.lastTick = tick;
}

/** A recording read from untrusted data (parsed JSON): checked in full and copied, or rejected with a throw. */
export function parseRecording(data: unknown): Recording {
  const d = data as Partial<Recording> | null;
  if (typeof d !== 'object' || d === null || d.format !== 1 || !Array.isArray(d.events)) {
    throw new TypeError('parseRecording: not a format-1 recording');
  }
  const events: InputEvent[] = [];
  let last = 0;
  for (const e of d.events as unknown[]) {
    if (!Array.isArray(e) || e.length !== 3 || !isInt(e[0], last, Number.MAX_SAFE_INTEGER)
      || !INPUT_FIELDS.includes(e[1]) || !valid(e[1], e[2])) {
      throw new TypeError(`parseRecording: bad event ${events.length}`);
    }
    last = e[0];
    events.push([e[0], e[1], copyOf(e[2])]);
  }
  return { format: 1, events };
}

/** A replay of a recording: the input of each tick, asked for in non-decreasing tick order. */
export interface Replay {
  readonly events: readonly InputEvent[];
  next: number;
  readonly input: ShipInput;
}

export function replay(recording: Recording): Replay {
  return { events: recording.events, next: 0, input: idleInput() };
}

/** The recorded input of `tick`. The returned struct is reused by the next call. */
export function inputAt(r: Replay, tick: number): ShipInput {
  while (r.next < r.events.length && r.events[r.next][0] <= tick) {
    const [, field, v] = r.events[r.next++];
    setField(r.input, field, v);
  }
  return r.input;
}
