// Saving on the device: one IndexedDB database with a store per kind of record. The match in progress is saved as
// its codec snapshot, the very bytes the match hash covers, so nothing that decides the match's future can be left
// out; a record that does not decode in full is discarded, never half-loaded.
import { parseRecording, type Recording } from '../sim/input.ts';
import { decodeMatch, encodeMatch, type MatchState } from '../sim/state.ts';

const DB = 'portolan';
const DB_VERSION = 1;
/** The match in progress, and the generated world (worldWorker.ts). Adding a store bumps DB_VERSION. */
type Store = 'match' | 'world';
const STORES: readonly Store[] = ['match', 'world'];

let db: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return db;
}

/** One request in its own transaction, settled when the transaction has committed (durably, for writes). */
async function request<T>(store: Store, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const tx = (await open()).transaction(store, mode, { durability: mode === 'readwrite' ? 'strict' : 'default' });
  const req = op(tx.objectStore(store));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export const read = <T>(store: Store, key: string): Promise<T | undefined> => request(store, 'readonly', (s) => s.get(key));

export const write = async (store: Store, key: string, value: unknown): Promise<void> => {
  await request(store, 'readwrite', (s) => s.put(value, key));
};

/** A match to continue: its state and, when a recording drives the player's ship, that recording and the tick at
 * which the replay holds still (null: it runs on). */
export interface SavedMatch {
  readonly state: MatchState;
  readonly recording: Recording | null;
  readonly stopAt: number | null;
}

interface MatchRecord {
  snapshot: Uint8Array;
  recording: Recording | null;
  stopAt: number | null;
}

export const saveMatch = (m: SavedMatch): Promise<void> =>
  write('match', 'current', { snapshot: encodeMatch(m.state), recording: m.recording, stopAt: m.stopAt } satisfies MatchRecord);

export const clearMatch = async (): Promise<void> => {
  await request('match', 'readwrite', (s) => s.delete('current'));
};

/** The match saved when the app last went to the background, or null; an unreadable record is deleted. */
export async function loadMatch(): Promise<SavedMatch | null> {
  const r = await read<MatchRecord>('match', 'current');
  if (r === undefined) return null;
  try {
    if (r.stopAt !== null && !Number.isInteger(r.stopAt)) throw new TypeError('loadMatch: bad stopAt');
    return { state: decodeMatch(r.snapshot), recording: r.recording && parseRecording(r.recording), stopAt: r.stopAt };
  } catch {
    await clearMatch();
    return null;
  }
}
