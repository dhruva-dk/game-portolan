// The career kept in a store (Phase B section 1, D23, D24): every applied command journaled before the game goes on;
// snapshots every 50 entries, at each race's end, at each season's end and on request; backups at each season's end,
// before a migration and on request; compaction after a backup. Loading takes the newest snapshot whose sum holds and
// the entries after it whose chain holds, else the next snapshot back, else the whole journal from the world seed (only
// if every entry carries the present tuning), else the backup, else it says plainly that the save is lost. A torn
// tail is dropped and the player told what was lost.

import type { Command, Refusal } from '../office/command.ts';
import { apply, start, type CareerState } from './career.ts';
import {
  ORIGIN,
  chained,
  entry,
  intact,
  shaped,
  snapshotOf,
  unpacked,
} from './journal.ts';
import { SCHEMA, migrated } from './migrate.ts';
import type { Entry, Saved, Store } from './store.ts';
import { TUNING_VERSION } from './tuning.ts';

/** Entries between snapshots. */
export const EVERY = 50;

/** The career as kept: its state, the journal's last seq and sum, and the seqs of the newest two snapshots. */
export interface Kept {
  state: CareerState;
  seq: number;
  tip: string;
  snapshots: readonly number[];
  debug: boolean;
}

/** What the player is told was lost on load: how many actions, since which day. */
interface Lost {
  actions: number;
  since: number;
}

type Sent =
  | { ok: true; kept: Kept; snapshotFailed: boolean }
  | { ok: false; reason: Refusal };

export type Opened =
  | {
      ok: true;
      kept: Kept;
      from: 'new' | 'snapshot' | 'older' | 'journal' | 'backup';
      lost: Lost | null;
      migratedFrom: number | null;
    }
  | { ok: false; sentence: string };

const UNSAVED: Refusal = {
  code: 'unsaved',
  sentence: 'The save failed, so nothing was done. Try again.',
};

/** A new career, kept nowhere yet. */
export const fresh = (debug = false): Kept => ({
  state: start(),
  seq: 0,
  tip: ORIGIN,
  snapshots: [],
  debug,
});

/** Writes a snapshot of what is kept, and (when asked) a backup and the compaction after it. */
export async function checkpoint(
  store: Store,
  kept: Kept,
  backup: boolean
): Promise<Kept> {
  if (kept.snapshots[0] === kept.seq && !backup) return kept;
  let out = kept;
  if (kept.snapshots[0] !== kept.seq) {
    const snap = snapshotOf(kept.state, kept.seq, kept.tip);
    await store.snapshot(snap.at, snap.state, snap.sum);
    out = { ...kept, snapshots: [kept.seq, ...kept.snapshots].slice(0, 2) };
  }
  if (backup) {
    await store.backup();
    const previous = out.snapshots[1];
    if (previous !== undefined) await store.compact(previous + 1);
  }
  return out;
}

/** Whether a command's change calls for a snapshot: every EVERY entries, a race's end, a season's end. */
function due(
  before: CareerState,
  after: CareerState,
  kept: Kept
): { snapshot: boolean; backup: boolean } {
  const seasonEnd = after.season !== before.season;
  const raceEnd = before.race !== null && after.race === null;
  return {
    snapshot:
      seasonEnd || raceEnd || kept.seq - (kept.snapshots[0] ?? 0) >= EVERY,
    backup: seasonEnd,
  };
}

/** Applies a command and journals it. A refused command changes nothing; a failed append changes nothing and says so. */
export async function send(
  store: Store,
  kept: Kept,
  command: Command
): Promise<Sent> {
  if (command?.kind === 'Snapshot') {
    try {
      return {
        ok: true,
        kept: await checkpoint(store, kept, false),
        snapshotFailed: false,
      };
    } catch {
      return { ok: true, kept, snapshotFailed: true };
    }
  }
  const applied = apply(kept.state, command, { debug: kept.debug });
  if (!applied.ok) return applied;
  const e = entry(kept.tip, kept.seq + 1, TUNING_VERSION, command);
  try {
    await store.append([e]);
  } catch {
    return { ok: false, reason: UNSAVED };
  }
  const next: Kept = { ...kept, state: applied.state, seq: e.seq, tip: e.sum };
  const when = due(kept.state, applied.state, next);
  if (!when.snapshot) return { ok: true, kept: next, snapshotFailed: false };
  try {
    return {
      ok: true,
      kept: await checkpoint(store, next, when.backup),
      snapshotFailed: false,
    };
  } catch {
    // the command is journaled: the game goes on from the journal; the next checkpoint tries again
    return { ok: true, kept: next, snapshotFailed: true };
  }
}

/** Backs up on the player's command: a snapshot, the backup, the compaction. */
export async function backupNow(
  store: Store,
  kept: Kept
): Promise<{ ok: true; kept: Kept } | { ok: false; reason: Refusal }> {
  try {
    return { ok: true, kept: await checkpoint(store, kept, true) };
  } catch {
    return {
      ok: false,
      reason: {
        code: 'unsaved',
        sentence: 'The backup failed. Your career is still saved; try again.',
      },
    };
  }
}

/** Entries replayed onto a state; stops at the first the reducer refuses (a corrupt entry the chain could not see). */
function replay(
  state: CareerState,
  entries: readonly Entry[]
): { state: CareerState; applied: number; day: number } {
  let s = state,
    n = 0;
  for (const e of entries) {
    const r = apply(s, e.command, { debug: true });
    if (!r.ok) break;
    s = r.state;
    n++;
  }
  return { state: s, applied: n, day: s.day };
}

/** Where a load came from, and the schema it was migrated from (null if none). */
interface How {
  from: 'snapshot' | 'older' | 'journal';
  migratedFrom: number | null;
}
type Found = How & { kept: Kept; lost: Lost | null };

/** The career from what a store holds, or null if nothing in it holds. */
function recover(saved: Saved, debug: boolean): Found | null {
  const entries: readonly unknown[] = saved.entries;
  for (const [i, snap] of saved.snapshots.entries()) {
    if (!intact(snap)) continue;
    const packed = unpacked(snap);
    if (!packed) continue;
    const m = migrated(packed.state);
    if (!m.ok) continue;
    return resume(
      m.state,
      entries,
      { seq: snap.at, tip: packed.tip, snapshots: [snap.at], debug },
      {
        from: i === 0 ? 'snapshot' : 'older',
        migratedFrom: m.from === SCHEMA ? null : m.from,
      }
    );
  }
  // the whole journal: only if it begins at the beginning (compaction has not dropped its start) and every entry was
  // written under the present tuning (D36)
  // (a journal of nothing but one torn first entry loads as the beginning, the torn action reported lost)
  const readable = entries.filter(shaped);
  if (
    entries.length === 0 ||
    (readable.length > 0 && readable[0].seq !== 1) ||
    !readable.every((e) => e.tuning === TUNING_VERSION)
  )
    return null;
  return resume(
    start(),
    entries,
    { seq: 0, tip: ORIGIN, snapshots: [], debug },
    { from: 'journal', migratedFrom: null }
  );
}

/** A base state with the good run of the entries after it replayed. */
function resume(
  base: CareerState,
  entries: readonly unknown[],
  at: Omit<Kept, 'state'>,
  how: How
): Found {
  const { good, dropped } = chained(entries, at.seq, at.tip);
  const r = replay(base, good);
  const kept: Kept = {
    ...at,
    state: r.state,
    seq: at.seq + r.applied,
    tip: r.applied === 0 ? at.tip : good[r.applied - 1].sum,
  };
  const actions = dropped + good.length - r.applied;
  return { kept, ...how, lost: actions > 0 ? { actions, since: r.day } : null };
}

/** Opens the career a store holds. Never starts a new career silently: an empty store is a new career; a store
 *  holding nothing readable says so. */
export async function open(store: Store, debug = false): Promise<Opened> {
  for (const fromBackup of [false, true]) {
    let saved: Saved;
    try {
      saved = await store.load();
    } catch {
      saved = { snapshots: [], entries: [] };
    }
    if (
      !fromBackup &&
      saved.snapshots.length === 0 &&
      saved.entries.length === 0
    )
      return {
        ok: true,
        kept: fresh(debug),
        from: 'new',
        lost: null,
        migratedFrom: null,
      };
    const found = recover(saved, debug);
    if (found) {
      const settled = await settle(store, found);
      if (settled)
        return {
          ok: true,
          ...settled,
          from: fromBackup ? 'backup' : found.from,
        };
    }
    if (fromBackup) break;
    let restored = false;
    try {
      restored = await store.restore();
    } catch {
      restored = false;
    }
    if (!restored) break;
  }
  return {
    ok: false,
    sentence:
      'Your save could not be read, and no backup of it holds. You can start a new career.',
  };
}

/** After a load: a torn tail truncated, a migrated save backed up (as it was) and snapshotted anew. Null if the store
 *  will not take it. */
async function settle(store: Store, found: Found): Promise<Found | null> {
  try {
    if (found.lost) await store.truncate(found.kept.seq + 1);
    if (found.migratedFrom !== null) {
      await store.backup();
      return {
        ...found,
        kept: await checkpoint(store, { ...found.kept, snapshots: [] }, false),
      };
    }
    return found;
  } catch {
    return null;
  }
}

/** The day a lost tail began and how many actions, as the player reads it. */
export const lostSentence = (lost: Lost, seasonStart = 0): string =>
  (lost.actions === 1
    ? 'The last action'
    : `The last ${lost.actions} actions`) +
  `, since Day ${lost.since - seasonStart + 1}, could not be read and ${lost.actions === 1 ? 'was' : 'were'} lost.`;

export type { Entry } from './store.ts';
