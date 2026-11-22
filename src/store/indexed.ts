// The career's store in the browser's IndexedDB (career/store.ts; Phase B section 16). Three object stores: the
// journal's entries (each its JSON text, keyed by seq), the snapshots (keyed by the seq they hold; the newest three
// kept), and the backup (one record). Every write is one transaction, so an append lands whole or not at all; a write
// that fails rejects and the career does not go on (career/session.ts).

import {
  KEEP,
  readEntry,
  type Saved,
  type Snapshot,
  type Store,
} from '../career/store.ts';

const ENTRIES = 'entries',
  SNAPSHOTS = 'snapshots',
  BACKUP = 'backup';
const VERSION = 1;

interface Line {
  seq: number;
  text: string;
}
interface Kept {
  entries: string[];
  snapshots: Snapshot[];
}

/** A request's result, or its error. */
const done = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((ok, no) => {
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });

/** Runs `work` in one transaction over the stores named; resolves once the transaction has committed. */
function inTransaction<T>(
  db: IDBDatabase,
  names: readonly string[],
  work: (t: IDBTransaction) => Promise<T>
): Promise<T> {
  return new Promise((ok, no) => {
    const t = db.transaction([...names], 'readwrite');
    let result: T;
    t.oncomplete = () => ok(result);
    t.onabort = () => no(t.error ?? new Error('The save was abandoned.'));
    t.onerror = () => no(t.error);
    work(t).then(
      (r) => {
        result = r;
      },
      (e) => {
        no(e);
        try {
          t.abort();
        } catch {
          /* already finished */
        }
      }
    );
  });
}

/** Opens (making if new) the database of a name. */
export function openDatabase(
  name: string,
  factory: IDBFactory = indexedDB
): Promise<IDBDatabase> {
  return new Promise((ok, no) => {
    const r = factory.open(name, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(ENTRIES))
        db.createObjectStore(ENTRIES, { keyPath: 'seq' });
      if (!db.objectStoreNames.contains(SNAPSHOTS))
        db.createObjectStore(SNAPSHOTS, { keyPath: 'at' });
      if (!db.objectStoreNames.contains(BACKUP)) db.createObjectStore(BACKUP);
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
    r.onblocked = () => no(new Error('The save is open elsewhere.'));
  });
}

/** The snapshots newest first. */
async function snapshotsOf(t: IDBTransaction): Promise<Snapshot[]> {
  const all: Snapshot[] = await done(t.objectStore(SNAPSHOTS).getAll());
  return all
    .sort((a, b) => b.at - a.at)
    .map((s) => ({ at: s.at, state: s.state, sum: s.sum }));
}

/** The store over an open database. */
export function indexedStore(db: IDBDatabase): Store {
  return {
    append: (entries) =>
      inTransaction(db, [ENTRIES], async (t) => {
        const lines = t.objectStore(ENTRIES);
        for (const e of entries)
          lines.put({ seq: e.seq, text: JSON.stringify(e) } satisfies Line);
      }),
    snapshot: (at, state, sum) =>
      inTransaction(db, [SNAPSHOTS], async (t) => {
        const snaps = t.objectStore(SNAPSHOTS);
        await done(snaps.put({ at, state, sum } satisfies Snapshot));
        const ats = await done(snaps.getAllKeys());
        const newest = ats.map(Number).sort((a, b) => b - a);
        for (const old of newest.slice(KEEP)) snaps.delete(old);
      }),
    load: async (): Promise<Saved> => {
      const t = db.transaction([ENTRIES, SNAPSHOTS], 'readonly');
      const read: Promise<Line[]> = done(t.objectStore(ENTRIES).getAll());
      const [lines, snapshots] = await Promise.all([read, snapshotsOf(t)]);
      return {
        snapshots,
        entries: lines
          .sort((a, b) => a.seq - b.seq)
          .map((l) => readEntry(l.text)),
      };
    },
    backup: () =>
      inTransaction(db, [ENTRIES, SNAPSHOTS, BACKUP], async (t) => {
        const [newest] = await snapshotsOf(t);
        const from = newest
          ? IDBKeyRange.lowerBound(newest.at, true)
          : undefined;
        const lines: Line[] = await done(t.objectStore(ENTRIES).getAll(from));
        const kept: Kept = {
          snapshots: newest ? [newest] : [],
          entries: lines.map((l) => l.text),
        };
        t.objectStore(BACKUP).put(kept, BACKUP);
      }),
    restore: () =>
      inTransaction(db, [ENTRIES, SNAPSHOTS, BACKUP], async (t) => {
        const kept: Kept | undefined = await done(
          t.objectStore(BACKUP).get(BACKUP)
        );
        if (!kept) return false;
        const lines = t.objectStore(ENTRIES),
          snaps = t.objectStore(SNAPSHOTS);
        await Promise.all([done(lines.clear()), done(snaps.clear())]);
        for (const text of kept.entries) {
          const seq = readEntry(text).seq;
          if (typeof seq === 'number') lines.put({ seq, text } satisfies Line);
        }
        for (const s of kept.snapshots) snaps.put(s);
        return true;
      }),
    compact: (before) =>
      inTransaction(db, [ENTRIES], async (t) => {
        await done(
          t.objectStore(ENTRIES).delete(IDBKeyRange.upperBound(before, true))
        );
      }),
    truncate: (from) =>
      inTransaction(db, [ENTRIES], async (t) => {
        await done(t.objectStore(ENTRIES).delete(IDBKeyRange.lowerBound(from)));
      }),
  };
}
