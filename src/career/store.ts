// The port the career saves through (Phase B section 1). Adapters live in src/store/ and import only this file:
// store/memory.ts for tests, store/faulty.ts to fail or tear a chosen write, store/indexed.ts in the game.
//
// The journal is append-only: every applied command is one Entry, its sum chained from the previous entry's
// (career/journal.ts). A snapshot is the state's canonical JSON and its sum, at the seq of the last entry it holds.
// The store keeps the newest three snapshots.

import type { Command } from '../office.ts';

export interface Entry {
  seq: number; // 1 the first
  tuning: number; // the TUNING_VERSION it was written under
  command: Command;
  sum: string; // eight hex digits
}

export interface Snapshot {
  at: number;
  state: string;
  sum: string;
}

export interface Saved {
  snapshots: readonly Snapshot[];
  entries: readonly Entry[];
}

export interface Store {
  /** Atomic: all or none. */
  append(entries: readonly Entry[]): Promise<void>;
  snapshot(at: number, state: string, sum: string): Promise<void>;
  /** Snapshots newest first; entries in seq order. */
  load(): Promise<Saved>;
  /** Copy the newest snapshot and its tail aside. */
  backup(): Promise<void>;
  /** Replace the save with the backup; false if there is none. */
  restore(): Promise<boolean>;
  /** Drop entries before a seq. */
  compact(before: number): Promise<void>;
  /** Drop entries at and after a seq: a torn or corrupt tail, once the load has told the player what was lost. */
  truncate(from: number): Promise<void>;
}

/** How many snapshots a store keeps. */
export const KEEP = 3;
