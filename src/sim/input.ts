// What a ship's helm asks for in one tick, from the player's controls or a captain's mind, and the recorder
// that turns a stream of inputs into a compact replay. A match replayed from its seed and its recording ends
// with the same state hash.
import type { V3 } from './math.ts';

export interface ShipInput {
  /** The turn wanted, in radians from the current heading: positive toward starboard. Beyond about 1.8 she slows to come round. */
  steer: number;
  /** Sail set, 0 (furled) to 1 (full). */
  throttle: number;
  /** Fire the selected weapon, or use the selected consumable. Held fires again as soon as it can. */
  fire: boolean;
  /** Where to aim: a point on the sphere (unit vector) and its height above the sea. */
  aim: V3;
  aimY: number;
  /** Select a hotbar slot (0–4), or -1 to keep the current one. */
  select: number;
  /** Swap the selected slot with this one (0–4), or -1. */
  swap: number;
  /** Drop the selected item. */
  drop: boolean;
  /** Take the nearest loot in reach even when the hotbar is full: it swaps with the selected slot. */
  take: boolean;
  /** Reload now. */
  reload: boolean;
  gust: boolean;
  /** Use the active ability. */
  ability: boolean;
  /** Leave the Gale and dive; while gliding, hold to dive steeply. */
  dive: boolean;
  /** Call a gull delivery: parcel tier 0–2, or -1. */
  hail: number;
}

export function idleInput(): ShipInput {
  return {
    steer: 0, throttle: 1, fire: false, aim: { x: 0, y: 0, z: 1 }, aimY: 0, select: -1, swap: -1, drop: false, take: false,
    reload: false, gust: false, ability: false, dive: false, hail: -1,
  };
}

/** Copies an input. Numbers gain + 0, which turns -0 into 0: JSON does the same, so a replay matches the live match. */
export function copyInput(out: ShipInput, a: ShipInput): ShipInput {
  out.steer = a.steer + 0;
  out.throttle = a.throttle + 0;
  out.fire = a.fire;
  out.aim.x = a.aim.x + 0;
  out.aim.y = a.aim.y + 0;
  out.aim.z = a.aim.z + 0;
  out.aimY = a.aimY + 0;
  out.select = a.select;
  out.swap = a.swap;
  out.drop = a.drop;
  out.take = a.take;
  out.reload = a.reload;
  out.gust = a.gust;
  out.ability = a.ability;
  out.dive = a.dive;
  out.hail = a.hail;
  return out;
}

// ---------------------------------------------------------------- recording

export const INPUT_FIELDS = ['steer', 'throttle', 'fire', 'aim', 'aimY', 'select', 'swap', 'drop', 'take', 'reload', 'gust', 'ability', 'dive', 'hail'] as const;
export type InputField = (typeof INPUT_FIELDS)[number];
type FieldValue = number | boolean | readonly [number, number, number];
export type InputEvent = [tick: number, field: InputField, value: FieldValue];

export interface Recording {
  format: 2;
  events: InputEvent[];
}

const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;

function valid(field: InputField, v: unknown): boolean {
  switch (field) {
    case 'steer': return isNum(v, -4, 4);
    case 'throttle': return isNum(v, 0, 1);
    case 'aim': return Array.isArray(v) && v.length === 3 && v.every((x) => isNum(x, -1.0001, 1.0001));
    case 'aimY': return isNum(v, -50, 500);
    case 'select': case 'swap': return isInt(v, -1, 4);
    case 'hail': return isInt(v, -1, 2);
    default: return typeof v === 'boolean';
  }
}

// + 0 keeps -0 out of the recording, so it reads back the same after JSON
const valueOf = (input: ShipInput, field: InputField): FieldValue => {
  if (field === 'aim') return [input.aim.x + 0, input.aim.y + 0, input.aim.z + 0];
  const v = input[field];
  return typeof v === 'number' ? v + 0 : v;
};

const same = (a: FieldValue, b: FieldValue): boolean =>
  a === b || (Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

function setField(input: ShipInput, field: InputField, v: FieldValue): void {
  if (field === 'aim') {
    const a = v as readonly number[];
    input.aim.x = a[0];
    input.aim.y = a[1];
    input.aim.z = a[2];
  } else (input as unknown as Record<string, FieldValue>)[field] = v;
}

export interface Recorder {
  readonly recording: Recording;
  readonly held: ShipInput;
  lastTick: number;
}

export function recorder(): Recorder {
  return { recording: { format: 2, events: [] }, held: idleInput(), lastTick: -1 };
}

/** Notes the input for a tick: only the fields that changed are kept. */
export function record(r: Recorder, tick: number, input: ShipInput): void {
  if (!(Number.isInteger(tick) && tick > r.lastTick)) throw new RangeError(`record: tick ${tick} after ${r.lastTick}`);
  for (const field of INPUT_FIELDS) {
    const v = valueOf(input, field);
    if (!valid(field, v)) throw new RangeError(`record: bad ${field} at tick ${tick}`);
    if (same(v, valueOf(r.held, field))) continue;
    r.recording.events.push([tick, field, v]);
    setField(r.held, field, v);
  }
  r.lastTick = tick;
}

export function parseRecording(data: unknown): Recording {
  const d = data as Partial<Recording> | null;
  if (typeof d !== 'object' || d === null || d.format !== 2 || !Array.isArray(d.events)) {
    throw new TypeError('parseRecording: not a format-2 recording');
  }
  const events: InputEvent[] = [];
  let last = 0;
  for (const e of d.events as unknown[]) {
    if (!Array.isArray(e) || e.length !== 3 || !isInt(e[0], last, Number.MAX_SAFE_INTEGER)
      || !INPUT_FIELDS.includes(e[1]) || !valid(e[1], e[2])) {
      throw new TypeError(`parseRecording: bad event ${events.length}`);
    }
    last = e[0];
    events.push([e[0], e[1], Array.isArray(e[2]) ? [e[2][0], e[2][1], e[2][2]] : e[2]]);
  }
  return { format: 2, events };
}

export interface Replay {
  readonly events: readonly InputEvent[];
  next: number;
  readonly input: ShipInput;
}

export function replay(recording: Recording): Replay {
  return { events: recording.events, next: 0, input: idleInput() };
}

export function inputAt(r: Replay, tick: number): ShipInput {
  while (r.next < r.events.length && r.events[r.next][0] <= tick) {
    const [, field, v] = r.events[r.next++];
    setField(r.input, field, v);
  }
  return r.input;
}
