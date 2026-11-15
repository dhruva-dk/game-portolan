// A store that fails at a chosen write (career/store.ts), over a memory disk: for the crash and corruption tests.
// Writes are counted from 1 across append, snapshot, backup, restore, compact and truncate. At the chosen write:
//   'fail' — that write is refused and leaves nothing; later writes go through (a full disk, a moment's error);
//   'kill' — that write and every later one are refused and leave nothing (the app was killed before it);
//   'tear' — that write leaves half of itself (an append's last entry, or a snapshot's text, cut short), and every
//            later write is refused (the app was killed during it).

import { KEEP, type Store } from '../career/store.ts';
import { emptyDisk, memoryStore, type Disk } from './memory.ts';

export type Fault = 'fail' | 'kill' | 'tear';

export interface Faulty extends Store {
  disk: Disk;
  /** Writes made so far (refused ones too). */
  writes(): number;
  /** Whether the store is dead (after a kill or a tear). */
  dead(): boolean;
}

class WriteRefused extends Error {}

/** The store, failing at write `at` in the way `fault` says. */
export function faultyStore(at: number, fault: Fault, disk: Disk = emptyDisk()): Faulty {
  const inner = memoryStore(disk);
  let count = 0, killed = false;
  /** Runs a write unless this is the one to fail or the store is dead; `torn` writes half of it instead. */
  const write = async (whole: () => Promise<void>, torn: () => void): Promise<void> => {
    count++;
    if (killed) throw new WriteRefused(`write ${count}: the store is dead`);
    if (count !== at) return whole();
    if (fault === 'fail') throw new WriteRefused(`write ${count} failed`);
    killed = true;
    if (fault === 'tear') torn();
    throw new WriteRefused(`write ${count}: killed`);
  };
  return {
    disk,
    writes: () => count,
    dead: () => killed,
    append: (entries) => write(() => inner.append(entries), () => {
      const texts = entries.map((e) => JSON.stringify(e));
      const last = texts.pop();
      disk.entries.push(...texts);
      if (last !== undefined) disk.entries.push(last.slice(0, Math.floor(last.length / 2)));
    }),
    snapshot: (s, state, sum) => write(() => inner.snapshot(s, state, sum), () => {
      disk.snapshots.unshift({ at: s, state: state.slice(0, Math.floor(state.length / 2)), sum });
      disk.snapshots.length = Math.min(disk.snapshots.length, KEEP);
    }),
    load: () => inner.load(),
    backup: () => write(() => inner.backup(), () => { disk.backup = null; }),
    restore: async () => {
      let ok = false;
      await write(async () => { ok = await inner.restore(); }, () => { disk.entries = []; });
      return ok;
    },
    compact: (before) => write(() => inner.compact(before), () => {}),
    truncate: (from) => write(() => inner.truncate(from), () => {}),
  };
}
