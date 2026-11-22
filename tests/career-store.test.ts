// The store suite (tests/store-suite.ts) on the memory adapter and the faulty one (failing nowhere), in node. The
// IndexedDB adapter runs the same suite in headless Chromium: node tools/indexed.ts.
import { test } from 'node:test';
import { emptyDisk, memoryStore, type Disk } from '../src/store/memory.ts';
import { faultyStore } from '../src/store/faulty.ts';
import type { Store } from '../src/career/store.ts';
import { script } from './career-kit.ts';
import { STORE_TESTS, type Rig } from './store-suite.ts';

/** A byte of a text changed. */
export const flipped = (text: string, at: number): string =>
  text.slice(0, at) + (text[at] === '1' ? '2' : '1') + text.slice(at + 1);

function rig(make: (disk: Disk) => Store): Rig {
  let disk = emptyDisk();
  return {
    empty: async () => make((disk = emptyDisk())),
    reopen: async () => make(disk),
    corrupt: async (i) => {
      disk.entries[i] = flipped(
        disk.entries[i],
        Math.floor(disk.entries[i].length / 2)
      );
    },
  };
}

const COMMANDS = script(23, 36);

for (const [name, make] of [
  ['memory', (d: Disk) => memoryStore(d)],
  ['faulty', (d: Disk) => faultyStore(Infinity, 'fail', d)],
] as const) {
  for (const [what, run] of Object.entries(STORE_TESTS))
    test(`${name}: ${what}`, () => run(rig(make), COMMANDS));
}
