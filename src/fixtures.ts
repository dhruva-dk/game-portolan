// The office's fixtures: careers on a memory store, made by the commands a player would send (Found, Advance), for
// ?screen= (debug.ts) and tools/capture.ts. Nothing here touches the device's own career.

import type { Command, Desk } from './office';
import { createDesk, type Shelf } from './desk';
import { send, fresh } from './career/session';
import { emptyDisk, memoryStore, type Disk } from './store/memory';

/** The fixtures' founding. */
export const FOUNDING: Extract<Command, { kind: 'Found' }> = {
  kind: 'Found', seed: 20261115, crew: 'Portolan Quills', colours: { first: 2, second: 7 }, emblem: 3, given: 'Ottoline', family: 'Wrackham', headshot: 99,
};

/** The careers a fixture can be: none yet (found), founded (home), on race day, and a save whose last action is torn
 *  (recover). */
export const FIXTURES = ['found', 'home', 'raceday', 'recover'] as const;
export type Fixture = (typeof FIXTURES)[number];

const COMMANDS: Readonly<Record<Fixture, readonly Command[]>> = {
  found: [],
  home: [FOUNDING, { kind: 'DebugCoin', coin: 1250 }],
  raceday: [FOUNDING, { kind: 'Advance' }],
  recover: [FOUNDING, { kind: 'Advance' }],
};

/** A shelf over a memory disk. */
function memoryShelf(disk: Disk): Shelf {
  let day: { day: number; season: number } | null = { day: 1, season: 0 };
  return {
    open: async () => memoryStore(disk),
    wipe: async () => {
      disk.entries = [];
      disk.snapshots = [];
      disk.backup = null;
      day = null;
    },
    backupDay: { get: () => day, set: (v) => { day = v; } },
  };
}

/** A desk on a fixture's career. */
export async function fixture(name: Fixture): Promise<Desk> {
  const disk = emptyDisk(), store = memoryStore(disk);
  let kept = fresh(true);
  for (const c of COMMANDS[name]) {
    const r = await send(store, kept, c);
    if (!r.ok) throw new Error(`the ${name} fixture's ${c.kind} was refused: ${r.reason.sentence}`);
    kept = r.kept;
  }
  // (recover: the last action's entry torn on the disk, as a crash mid-write leaves it)
  if (name === 'recover') disk.entries[disk.entries.length - 1] = disk.entries[disk.entries.length - 1].slice(0, 40);
  return createDesk(memoryShelf(disk), true);
}
