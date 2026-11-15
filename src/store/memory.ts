// The career's store in memory (career/store.ts): for the tests, and the model the other adapters are held to. It
// keeps what a disk would, as text: each entry its JSON, each snapshot its text and sum, so a test can tear or corrupt
// any byte of it (its `disk`) and see the career load what holds.

import { KEEP, type Entry, type Saved, type Snapshot, type Store } from '../career/store.ts';

/** What the store holds, as a disk would. */
export interface Disk {
  entries: string[];
  snapshots: Snapshot[];                             // newest first
  backup: { entries: string[]; snapshots: Snapshot[] } | null;
}

export const emptyDisk = (): Disk => ({ entries: [], snapshots: [], backup: null });

/** An entry's text read back. What does not parse comes back as a record shaped like no entry, so the career counts
 *  it lost rather than the load failing. */
export function readEntry(text: string): Entry {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(JSON.stringify({ unreadable: text.length }));
  }
}

/** An entry's seq as stored, or null if its text does not say. */
const seqOf = (text: string): number | null => {
  const e = readEntry(text);
  return typeof e.seq === 'number' ? e.seq : null;
};

const copySnapshot = (s: Snapshot): Snapshot => ({ at: s.at, state: s.state, sum: s.sum });

/** The store over a disk (a new empty one if none is given). */
export function memoryStore(disk: Disk = emptyDisk()): Store & { disk: Disk } {
  return {
    disk,
    async append(entries) {
      const texts = entries.map((e) => JSON.stringify(e));
      disk.entries.push(...texts);
    },
    async snapshot(at, state, sum) {
      disk.snapshots.unshift({ at, state, sum });
      disk.snapshots.length = Math.min(disk.snapshots.length, KEEP);
    },
    async load(): Promise<Saved> {
      return { snapshots: disk.snapshots.map(copySnapshot), entries: disk.entries.map(readEntry) };
    },
    async backup() {
      const newest = disk.snapshots[0];
      const tail = newest ? disk.entries.filter((t) => (seqOf(t) ?? Infinity) > newest.at) : [...disk.entries];
      disk.backup = { snapshots: newest ? [copySnapshot(newest)] : [], entries: tail };
    },
    async restore() {
      if (!disk.backup) return false;
      disk.entries = [...disk.backup.entries];
      disk.snapshots = disk.backup.snapshots.map(copySnapshot);
      return true;
    },
    async compact(before) {
      disk.entries = disk.entries.filter((t) => (seqOf(t) ?? Infinity) >= before);
    },
    async truncate(from) {
      const keep: string[] = [];
      for (const t of disk.entries) {
        const seq = seqOf(t);
        if (seq === null || seq >= from) break;
        keep.push(t);
      }
      disk.entries = keep;
    },
  };
}
