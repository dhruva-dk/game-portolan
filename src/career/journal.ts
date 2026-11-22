// The journal's entries and their chain (Phase B section 1): each entry's sum is the 32-bit FNV-1a of its canonical
// JSON ({ seq, tuning, command }), started from the previous entry's sum (the first from FNV's offset). A snapshot's
// sum is FNV-1a of its text from the offset.

import type { Command } from '../office.ts';
import { canonical, fnv, hex, sumOf, unhex } from './canon.ts';
import type { CareerState } from './state.ts';
import type { Entry, Snapshot } from './store.ts';

/** The sum before the first entry. */
export const ORIGIN = hex(fnv(''));

/** An entry's sum, chained from the one before. */
export function entrySum(
  prev: string,
  seq: number,
  tuning: number,
  command: Command
): string {
  const from = unhex(prev);
  if (from === null) throw new Error(`entrySum: '${prev}' is not a sum`);
  return hex(fnv(canonical({ seq, tuning, command }), from));
}

/** The next entry after a sum. */
export function entry(
  prev: string,
  seq: number,
  tuning: number,
  command: Command
): Entry {
  return { seq, tuning, command, sum: entrySum(prev, seq, tuning, command) };
}

/** Whether a value read back is shaped as an entry (a torn write may not be). */
export function shaped(e: unknown): e is Entry {
  if (e === null || typeof e !== 'object') return false;
  const x = e as Record<string, unknown>;
  const c = x.command as Record<string, unknown> | null | undefined;
  return (
    typeof x.seq === 'number' &&
    Number.isInteger(x.seq) &&
    typeof x.tuning === 'number' &&
    typeof x.sum === 'string' &&
    c !== null &&
    typeof c === 'object' &&
    typeof c.kind === 'string'
  );
}

/** The longest run of entries that follows on from a seq and a sum with its chain whole: the rest is a torn or
 *  corrupt tail. */
export function chained(
  entries: readonly unknown[],
  afterSeq: number,
  afterSum: string
): { good: Entry[]; dropped: number } {
  const good: Entry[] = [];
  let seq = afterSeq,
    sum = afterSum;
  const tail = entries.filter((e) => !shaped(e) || e.seq > afterSeq);
  for (const e of tail) {
    if (!shaped(e) || e.seq !== seq + 1) break;
    let expected: string;
    try {
      expected = entrySum(sum, e.seq, e.tuning, e.command);
    } catch {
      break;
    }
    if (expected !== e.sum) break;
    good.push(e);
    seq = e.seq;
    sum = e.sum;
  }
  return { good, dropped: tail.length - good.length };
}

/** A state's snapshot at a seq: the canonical JSON of the state with the journal's sum at that seq (`tip`, so the
 *  entries after it can be checked when those before are compacted away), and its sum. */
export function snapshotOf(
  state: CareerState,
  at: number,
  tip: string
): Snapshot {
  const text = canonical({ state, tip });
  return { at, state: text, sum: sumOf(text) };
}

/** A snapshot's state and tip read back, or null if its text does not parse as one. */
export function unpacked(s: Snapshot): { state: unknown; tip: string } | null {
  try {
    const x: unknown = JSON.parse(s.state);
    if (x === null || typeof x !== 'object') return null;
    const r = x as { state?: unknown; tip?: unknown };
    return typeof r.tip === 'string' &&
      unhex(r.tip) !== null &&
      r.state !== undefined
      ? { state: r.state, tip: r.tip }
      : null;
  } catch {
    return null;
  }
}

/** Whether a snapshot's text matches its sum. */
export const intact = (s: Snapshot): boolean =>
  typeof s.state === 'string' && sumOf(s.state) === s.sum;
