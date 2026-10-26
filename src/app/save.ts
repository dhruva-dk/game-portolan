import { decodeCareer, encodeCareer, type Career } from '../career/state.ts';
import { parseRecording, type Recording } from '../sim/input.ts';
import { decodeMatch, encodeMatch, type MatchState } from '../sim/state.ts';

const DB = 'portolan';
const DB_VERSION = 2;
type Store = 'career' | 'match' | 'world';
const STORES: readonly Store[] = ['career', 'match', 'world'];

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

export const saveCareer = (c: Career): Promise<void> => write('career', 'current', encodeCareer(c));

export async function loadCareer(): Promise<Career | null> {
  const bytes = await read<Uint8Array>('career', 'current');
  if (bytes === undefined) return null;
  try {
    return decodeCareer(bytes);
  } catch {
    await request('career', 'readwrite', (s) => s.delete('current'));
    return null;
  }
}
